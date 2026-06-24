const crypto = require('crypto');
const SecurityUtils = require('../../shared/utils/SecurityUtils');
const SMSService = require('./SMSService');
const NIPScheduleService = require('../vaccination/NIPScheduleService');
const { ROLES } = require('../../config/constants/domain');

class CaregiverOTPService {
    constructor(db) {
        this.db = db;
        this.smsService = new SMSService(db);
        this.nipScheduleService = new NIPScheduleService(db);
    }

    normalizePhone(phone) {
        return phone ? phone.toString().trim() : '';
    }

    normalizeReference(referenceNumber) {
        return referenceNumber ? referenceNumber.toString().trim() : '';
    }

    hashOtp(otp) {
        const pepper = process.env.OTP_PEPPER || process.env.JWT_SECRET || 'immunicare-otp-pepper';
        return crypto.createHmac('sha256', pepper).update(otp).digest('hex');
    }

    generateOtp() {
        // Temporary development OTP. Replace this branch with a real SMS OTP
        // provider once SMS delivery is enabled for caregiver portal access.
        if (process.env.CAREGIVER_DEV_OTP || process.env.SMS_PROVIDER !== 'semaphore') {
            return process.env.CAREGIVER_DEV_OTP || '123456';
        }

        return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    }

    async getOtpExpiryMinutes() {
        try {
            const [rows] = await this.db.execute(
                'SELECT setting_value FROM system_settings WHERE setting_key = ?',
                ['otp_expiry_minutes']
            );
            const value = Number(rows[0]?.setting_value);
            return Number.isFinite(value) ? value : 5;
        } catch (_) {
            return 5;
        }
    }

    async findOrCreateCaregiver(mobileNumber) {
        const [existing] = await this.db.execute(
            'SELECT * FROM caregivers WHERE mobile_number = ? LIMIT 1',
            [mobileNumber]
        );
        if (existing.length > 0) {
            await this.linkInfantsToCaregiver(existing[0].id, mobileNumber);
            return existing[0];
        }

        const [infants] = await this.db.execute(`
            SELECT id, mothers_maiden_name, caregiver_relationship
            FROM infants
            WHERE caregiver_phone = ?
            ORDER BY created_at DESC
            LIMIT 1
        `, [mobileNumber]);

        if (infants.length === 0) {
            return null;
        }

        const fullName = infants[0].mothers_maiden_name || 'Caregiver';
        const relationship = infants[0].caregiver_relationship || 'Caregiver';

        const [rows] = await this.db.execute(`
            INSERT INTO caregivers (full_name, mobile_number, relationship, is_portal_enrolled, enrolled_at)
            VALUES (?, ?, ?, TRUE, CURRENT_TIMESTAMP)
            ON CONFLICT (mobile_number) DO UPDATE SET
                is_portal_enrolled = TRUE,
                enrolled_at = COALESCE(caregivers.enrolled_at, CURRENT_TIMESTAMP),
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [fullName, mobileNumber, relationship]);

        await this.linkInfantsToCaregiver(rows[0].id, mobileNumber);

        return rows[0];
    }

    async linkInfantsToCaregiver(caregiverId, mobileNumber) {
        await this.db.execute(`
            UPDATE infants
            SET caregiver_id = ?
            WHERE caregiver_phone = ?
              AND caregiver_id IS NULL
        `, [caregiverId, mobileNumber]);
    }

    async findInfantByReference(referenceNumber) {
        const normalizedReference = this.normalizeReference(referenceNumber);
        const hyphenated = normalizedReference.replace(/\s+/g, '-');
        const spaced = hyphenated.replace(/-/g, ' ');

        if (!normalizedReference) {
            const error = new Error('Reference number is required.');
            error.status = 400;
            throw error;
        }

        const [rows] = await this.db.execute(`
            SELECT id, reference_id, first_name, middle_name, last_name, suffix,
                   has_no_middle_name, dob, sex, barangay, purok, current_address,
                   exact_address, caregiver_id, caregiver_phone, caregiver_relationship,
                   mothers_maiden_name, father_name, birth_weight, length_at_birth_cm,
                   place_of_birth, immunization_status, status
            FROM infants
            WHERE reference_id = ? OR reference_id = ? OR reference_id = ?
            LIMIT 1
        `, [normalizedReference, hyphenated, spaced]);

        if (rows.length === 0) {
            const error = new Error('No infant record found for this reference number.');
            error.status = 404;
            throw error;
        }

        return rows[0];
    }

    async ensureCaregiverForInfant(infant) {
        const normalizedPhone = this.normalizePhone(infant.caregiver_phone);
        if (!/^09\d{9}$/.test(normalizedPhone)) {
            const error = new Error('The linked caregiver mobile number is missing or invalid. Please contact RHU staff.');
            error.status = 409;
            throw error;
        }

        if (infant.caregiver_id) {
            const [caregivers] = await this.db.execute(
                'SELECT * FROM caregivers WHERE id = ? LIMIT 1',
                [infant.caregiver_id]
            );
            if (caregivers.length > 0) {
                await this.linkInfantsToCaregiver(caregivers[0].id, normalizedPhone);
                return caregivers[0];
            }
        }

        const caregiver = await this.findOrCreateCaregiver(normalizedPhone);
        if (!caregiver) {
            const error = new Error('No caregiver record found for this infant.');
            error.status = 409;
            throw error;
        }

        await this.db.execute(
            'UPDATE infants SET caregiver_id = ? WHERE id = ? AND caregiver_id IS NULL',
            [caregiver.id, infant.id]
        );

        return caregiver;
    }

    async requestOtp(referenceNumber) {
        const infant = await this.findInfantByReference(referenceNumber);
        const caregiver = await this.ensureCaregiverForInfant(infant);
        const normalizedPhone = this.normalizePhone(caregiver.mobile_number || infant.caregiver_phone);
        const otp = this.generateOtp();
        const expiryMinutes = await this.getOtpExpiryMinutes();

        await this.db.execute(`
            UPDATE otp_records
            SET consumed_at = CURRENT_TIMESTAMP
            WHERE mobile_number = ?
              AND consumed_at IS NULL
        `, [normalizedPhone]);

        const [otpRows] = await this.db.execute(`
            INSERT INTO otp_records (caregiver_id, mobile_number, otp_hash, purpose, expires_at)
            VALUES (?, ?, ?, 'CAREGIVER_LOGIN', CURRENT_TIMESTAMP + (?::int * INTERVAL '1 minute'))
            RETURNING id, expires_at
        `, [caregiver.id, normalizedPhone, this.hashOtp(otp), expiryMinutes]);

        await this.smsService.queueMessage({
            caregiverId: caregiver.id,
            mobileNumber: normalizedPhone,
            messageType: 'OTP',
            messageBody: `Your IMMUNICARE login code is ${otp}. It expires in ${expiryMinutes} minutes.`
        });
        await this.smsService.processQueued(10);

        return {
            otpId: otpRows[0].id,
            expiresAt: otpRows[0].expires_at,
            referenceNumber: infant.reference_id,
            maskedMobileNumber: this.maskPhone(normalizedPhone)
        };
    }

    maskPhone(mobileNumber) {
        const value = this.normalizePhone(mobileNumber);
        if (value.length < 4) return value;
        return `${value.slice(0, 2)}*****${value.slice(-4)}`;
    }

    async verifyOtp(referenceNumber, otp) {
        const infant = await this.findInfantByReference(referenceNumber);
        const caregiver = await this.ensureCaregiverForInfant(infant);
        const normalizedPhone = this.normalizePhone(caregiver.mobile_number || infant.caregiver_phone);

        if (!normalizedPhone || !otp) {
            const error = new Error('Reference number and OTP are required.');
            error.status = 400;
            throw error;
        }

        const [rows] = await this.db.execute(`
            SELECT o.*, c.full_name
            FROM otp_records o
            JOIN caregivers c ON c.id = o.caregiver_id
            WHERE o.mobile_number = ?
              AND o.purpose = 'CAREGIVER_LOGIN'
              AND o.consumed_at IS NULL
            ORDER BY o.created_at DESC
            LIMIT 1
        `, [normalizedPhone]);

        if (rows.length === 0) {
            const error = new Error('OTP not found or already used.');
            error.status = 401;
            throw error;
        }

        const record = rows[0];
        if (new Date(record.expires_at) < new Date()) {
            const error = new Error('OTP has expired.');
            error.status = 401;
            throw error;
        }

        const attempts = Number(record.attempt_count || 0) + 1;
        const valid = this.hashOtp(otp) === record.otp_hash;
        if (!valid) {
            await this.db.execute(
                'UPDATE otp_records SET attempt_count = ? WHERE id = ?',
                [attempts, record.id]
            );
            const error = new Error('Invalid OTP.');
            error.status = 401;
            throw error;
        }

        await this.db.execute(
            'UPDATE otp_records SET consumed_at = CURRENT_TIMESTAMP, attempt_count = ? WHERE id = ?',
            [attempts, record.id]
        );

        const token = SecurityUtils.signToken({
            caregiver_id: record.caregiver_id,
            infant_id: infant.id,
            reference_id: infant.reference_id,
            mobile_number: normalizedPhone,
            role: ROLES.CAREGIVER
        }, Number(process.env.CAREGIVER_SESSION_SECONDS || 60 * 60 * 4));

        return {
            authToken: token,
            caregiver: {
                id: record.caregiver_id,
                name: record.full_name,
                reference_number: infant.reference_id,
                infant_id: infant.id,
                mobile_number: normalizedPhone,
                role: ROLES.CAREGIVER
            }
        };
    }

    async getCaregiverSession(caregiverId, infantId) {
        const [rows] = await this.db.execute(`
            SELECT c.id, c.full_name, c.mobile_number, c.relationship,
                   i.id AS infant_id, i.reference_id, i.first_name, i.middle_name,
                   i.last_name, i.suffix, i.has_no_middle_name, i.dob, i.sex,
                   i.barangay, i.immunization_status
            FROM caregivers c
            JOIN infants i ON i.caregiver_id = c.id
            WHERE c.id = ? AND i.id = ?
            LIMIT 1
        `, [caregiverId, infantId]);

        if (rows.length === 0) {
            const error = new Error('Caregiver session record not found.');
            error.status = 404;
            throw error;
        }

        const row = rows[0];
        return {
            caregiver: {
                id: row.id,
                name: row.full_name,
                relationship: row.relationship,
                mobile_number_masked: this.maskPhone(row.mobile_number),
                role: ROLES.CAREGIVER
            },
            infant: {
                id: row.infant_id,
                reference_id: row.reference_id,
                first_name: row.first_name,
                middle_name: row.middle_name,
                last_name: row.last_name,
                suffix: row.suffix,
                has_no_middle_name: row.has_no_middle_name,
                dob: row.dob,
                sex: row.sex,
                barangay: row.barangay,
                immunization_status: row.immunization_status
            }
        };
    }

    async getSelectedInfantSummary(caregiverId, infantId) {
        const card = await this.getInfantCard(caregiverId, infantId);
        return [{
            infant: card.infant,
            summary: card.summary
        }];
    }

    async getInfantCard(caregiverId, infantIdOrReference) {
        const reference = this.normalizeReference(infantIdOrReference);
        const hyphenated = reference.replace(/\s+/g, '-');
        const spaced = hyphenated.replace(/-/g, ' ');

        const [infantRows] = await this.db.execute(`
            SELECT i.id, i.reference_id, i.first_name, i.middle_name, i.last_name, i.suffix,
                   i.has_no_middle_name, i.mothers_maiden_name, i.father_name,
                   i.dob, i.sex, i.place_of_birth, i.delivery_facility_name, i.birth_setting, i.current_address, i.exact_address,
                   i.purok, i.barangay, i.caregiver_phone, i.caregiver_relationship,
                   i.birth_weight, i.length_at_birth_cm, i.immunization_status,
                   i.next_due_vaccine, i.status, i.created_at,
                   c.full_name AS caregiver_name, c.mobile_number AS caregiver_mobile, c.relationship AS caregiver_rel
            FROM infants i
            LEFT JOIN caregivers c ON i.caregiver_id = c.id
            WHERE i.caregiver_id = ?
              AND (i.id = ? OR i.reference_id = ? OR i.reference_id = ? OR i.reference_id = ?)
            LIMIT 1
        `, [caregiverId, reference, reference, hyphenated, spaced]);

        if (infantRows.length === 0) {
            const error = new Error('Infant record not found.');
            error.status = 404;
            throw error;
        }

        const infant = infantRows[0];

        await this.nipScheduleService.updateScheduleStatuses(infant.id);

        const [scheduleRows] = await this.db.execute(`
            SELECT s.id AS schedule_id, s.vaccine_code, COALESCE(r.vaccine_name, s.vaccine_code) AS vaccine_name,
                   s.dose_number, s.recommended_date, s.earliest_allowed_date,
                   s.actual_date AS schedule_actual_date,
                   s.status AS schedule_status, v.id AS vaccination_id,
                   v.administered_date AS administered_date, v.validation_status,
                   v.notes, v.batch_number, v.brand, v.vaccinator_name,
                   v.recorded_at, v.validated_at
            FROM infant_schedules s
            LEFT JOIN doh_compliance_rules r
              ON r.vaccine_code = s.vaccine_code
             AND r.dose_number = s.dose_number
            LEFT JOIN vaccinations v
              ON v.infant_id = s.infant_id
             AND v.vaccine_code = s.vaccine_code
             AND v.dose_number = s.dose_number
            WHERE s.infant_id = ?
            ORDER BY s.recommended_date ASC, s.vaccine_code ASC, s.dose_number ASC
        `, [infant.id]);

        const doses = scheduleRows.map((row) => ({
            schedule_id: row.schedule_id,
            vaccine_code: row.vaccine_code,
            vaccine_name: row.vaccine_name || row.vaccine_code,
            dose_number: row.dose_number,
            recommended_date: row.recommended_date,
            earliest_allowed_date: row.earliest_allowed_date,
            date_given: row.administered_date || row.schedule_actual_date || null,
            status: this.mapCardStatus(row),
            original_status: row.schedule_status,
            validation_status: row.validation_status,
            remarks: row.notes || null,
            batch_number: row.batch_number || null,
            brand: row.brand || null,
            vaccinator_name: row.vaccinator_name || null
        }));

        const resolvedPlaceOfBirth = infant.place_of_birth
            || infant.delivery_facility_name
            || (infant.birth_setting === 'FACILITY' ? 'Health Facility' : infant.birth_setting === 'HOME' ? 'Home Delivery' : infant.birth_setting)
            || null;

        return {
            infant: {
                id: infant.id,
                reference_id: infant.reference_id,
                first_name: infant.first_name,
                middle_name: infant.middle_name,
                last_name: infant.last_name,
                suffix: infant.suffix,
                has_no_middle_name: infant.has_no_middle_name,
                dob: infant.dob,
                sex: infant.sex,
                place_of_birth: resolvedPlaceOfBirth,
                address: infant.exact_address || infant.current_address,
                purok: infant.purok,
                barangay: infant.barangay,
                mothers_name: infant.mothers_maiden_name,
                fathers_name: infant.father_name,
                birth_weight: infant.birth_weight,
                birth_length: infant.length_at_birth_cm,
                family_number: null,
                code_number: infant.reference_id,
                caregiver_relationship: infant.caregiver_rel || infant.caregiver_relationship,
                immunization_status: infant.immunization_status,
                next_due_vaccine: infant.next_due_vaccine,
                status: infant.status
            },
            caregiver: {
                name: infant.caregiver_name || null,
                relationship: infant.caregiver_rel || infant.caregiver_relationship || null,
                phone: infant.caregiver_mobile || infant.caregiver_phone || null
            },
            summary: this.buildSummary(doses, infant),
            upcoming: doses.filter((dose) => ['Due Soon', 'Not Yet Due'].includes(dose.status)).slice(0, 5),
            overdue: doses.filter((dose) => dose.status === 'Overdue'),
            doses,
            vaccine_groups: this.groupDoses(doses)
        };
    }

    mapCardStatus(row) {
        if (row.validation_status === 'PENDING_VALIDATION' || row.schedule_status === 'PENDING_VALIDATION') {
            return 'Pending Validation';
        }
        if (row.administered_date || row.schedule_actual_date || row.schedule_status === 'COMPLETED') {
            return 'Completed';
        }
        if (['OVERDUE', 'DEFAULTED', 'DEFAULTER'].includes(row.schedule_status)) {
            return 'Overdue';
        }
        if (['DUE_TODAY', 'DUE_SOON'].includes(row.schedule_status)) {
            return 'Due Soon';
        }
        return 'Not Yet Due';
    }

    buildSummary(doses, infant) {
        const completed = doses.filter((dose) => dose.status === 'Completed').length;
        const pendingValidation = doses.filter((dose) => dose.status === 'Pending Validation').length;
        const overdue = doses.filter((dose) => dose.status === 'Overdue').length;
        const dueSoon = doses.filter((dose) => dose.status === 'Due Soon').length;
        const nextDose = doses.find((dose) => dose.status === 'Due Soon') ||
            doses.find((dose) => dose.status === 'Overdue') ||
            doses.find((dose) => dose.status === 'Not Yet Due');

        return {
            immunization_status: infant.immunization_status || (overdue > 0 ? 'OVERDUE' : 'INCOMPLETE'),
            next_due_vaccine: nextDose?.vaccine_name || infant.next_due_vaccine || null,
            next_due_date: nextDose?.recommended_date || null,
            overdue_count: overdue,
            due_soon_count: dueSoon,
            completed_count: completed,
            pending_validation_count: pendingValidation,
            total_dose_count: doses.length
        };
    }

    groupDoses(doses) {
        const preferredOrder = [
            'BCG',
            'Hepatitis B',
            'Pentavalent Vaccine',
            'Oral Polio Vaccine',
            'Inactivated Polio Vaccine',
            'Pneumococcal Conjugate Vaccine',
            'Measles-containing Vaccine',
            'Other Vaccines'
        ];

        const groups = new Map();
        for (const dose of doses) {
            const groupName = this.getVaccineGroupName(dose);
            if (!groups.has(groupName)) groups.set(groupName, []);
            groups.get(groupName).push(dose);
        }

        return Array.from(groups.entries())
            .map(([name, groupDoses]) => ({ name, doses: groupDoses }))
            .sort((a, b) => {
                const aIndex = preferredOrder.indexOf(a.name);
                const bIndex = preferredOrder.indexOf(b.name);
                if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            });
    }

    getVaccineGroupName(dose) {
        const code = String(dose.vaccine_code || '').toUpperCase();
        const name = String(dose.vaccine_name || '').toUpperCase();
        if (code.includes('BCG') || name.includes('BCG')) return 'BCG';
        if (code.includes('HEP') || name.includes('HEPATITIS')) return 'Hepatitis B';
        if (code.includes('PENTA') || name.includes('PENTAVALENT')) return 'Pentavalent Vaccine';
        if (code.includes('OPV') || name.includes('ORAL POLIO')) return 'Oral Polio Vaccine';
        if (code.includes('IPV') || name.includes('INACTIVATED POLIO')) return 'Inactivated Polio Vaccine';
        if (code.includes('PCV') || name.includes('PNEUMOCOCCAL')) return 'Pneumococcal Conjugate Vaccine';
        if (code.includes('MCV') || code.includes('MMR') || name.includes('MEASLES') || name.includes('MMR')) return 'Measles-containing Vaccine';
        return 'Other Vaccines';
    }

    async getCaregiverRecords(caregiverId) {
        const [infants] = await this.db.execute(`
            SELECT id, reference_id, first_name, last_name, dob, sex, barangay,
                   purok, caregiver_phone, immunization_status
            FROM infants
            WHERE caregiver_id = ?
            ORDER BY dob DESC
        `, [caregiverId]);

        if (infants.length === 0) return [];

        const infantIds = infants.map((infant) => infant.id);
        const placeholders = infantIds.map(() => '?').join(',');
        const [schedules] = await this.db.execute(`
            SELECT infant_id, vaccine_name, vaccine_code, dose_number,
                   recommended_date, actual_date, status
            FROM infant_schedules
            WHERE infant_id IN (${placeholders})
            ORDER BY recommended_date ASC, dose_number ASC
        `, infantIds);

        const scheduleMap = new Map();
        schedules.forEach((schedule) => {
            if (!scheduleMap.has(schedule.infant_id)) scheduleMap.set(schedule.infant_id, []);
            scheduleMap.get(schedule.infant_id).push(schedule);
        });

        return infants.map((infant) => ({
            infant,
            schedules: scheduleMap.get(infant.id) || []
        }));
    }
}

module.exports = CaregiverOTPService;
