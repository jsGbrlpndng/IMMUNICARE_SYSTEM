const crypto = require('crypto');
const SecurityUtils = require('../utils/SecurityUtils');
const SMSService = require('./SMSService');
const { ROLES } = require('../constants/domain');

class CaregiverOTPService {
    constructor(db) {
        this.db = db;
        this.smsService = new SMSService(db);
    }

    normalizePhone(phone) {
        return phone ? phone.toString().trim() : '';
    }

    hashOtp(otp) {
        const pepper = process.env.OTP_PEPPER || process.env.JWT_SECRET || 'immunicare-otp-pepper';
        return crypto.createHmac('sha256', pepper).update(otp).digest('hex');
    }

    generateOtp() {
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

    async requestOtp(mobileNumber) {
        const normalizedPhone = this.normalizePhone(mobileNumber);
        if (!/^09\d{9}$/.test(normalizedPhone)) {
            const error = new Error('Invalid mobile number format. Use 09XXXXXXXXX.');
            error.status = 400;
            throw error;
        }

        const caregiver = await this.findOrCreateCaregiver(normalizedPhone);
        if (!caregiver) {
            const error = new Error('No caregiver record found for this mobile number.');
            error.status = 404;
            throw error;
        }

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
            mockOtp: this.smsService.mockMode ? otp : undefined
        };
    }

    async verifyOtp(mobileNumber, otp) {
        const normalizedPhone = this.normalizePhone(mobileNumber);
        if (!normalizedPhone || !otp) {
            const error = new Error('Mobile number and OTP are required.');
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
            mobile_number: normalizedPhone,
            role: ROLES.CAREGIVER
        }, Number(process.env.CAREGIVER_SESSION_SECONDS || 60 * 60 * 4));

        return {
            authToken: token,
            caregiver: {
                id: record.caregiver_id,
                name: record.full_name,
                mobile_number: normalizedPhone,
                role: ROLES.CAREGIVER
            }
        };
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
