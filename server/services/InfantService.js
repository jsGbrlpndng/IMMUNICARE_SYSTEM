const { v4: uuidv4 } = require('uuid');
const ValidationService = require('./ValidationService');
const CPABCalculator = require('./CPABCalculator');
const EnhancedNIPScheduleEngine = require('./EnhancedNIPScheduleEngine');
const VaccinationService = require('./VaccinationService');
const NIPScheduleService = require('./NIPScheduleService');
const DuplicateDetectionService = require('./DuplicateDetectionService');
const localityHelper = require('../utils/localityHelper');
const DBSCANService = require('./DBSCANService');

class InfantService {
    constructor(db) {
        this.db = db;
        this.nipEngine = new EnhancedNIPScheduleEngine(db);
        this.vaccinationService = new VaccinationService(db);
        this.nipScheduleService = new NIPScheduleService(db);
        this.duplicateService = new DuplicateDetectionService(db);
    }

    async getRecentlyApproved(days = 7, barangay = null) {
        const barangayClause = barangay ? 'AND i.barangay = ?' : '';
        const params = barangay ? [parseInt(days), barangay] : [parseInt(days)];

        const [infants] = await this.db.execute(`
            SELECT 
                i.id, i.reference_id, i.first_name, i.last_name, i.dob, i.barangay,
                aa.timestamp as approved_at, aa.approver_id, aa.approver_role, aa.remarks
            FROM infants i
            INNER JOIN approval_audit aa ON i.id = aa.infant_id AND aa.action = 'Approved'
            WHERE aa.timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY) ${barangayClause}
            ORDER BY aa.timestamp DESC
        `, params);

        return infants.map(infant => {
            const approvedAt = new Date(infant.approved_at);
            const now = new Date();
            const diffMs = now - approvedAt;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            let time_since_approval;
            if (diffMins < 60) {
                time_since_approval = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
            } else if (diffHours < 24) {
                time_since_approval = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
            } else {
                time_since_approval = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
            }

            return {
                ...infant,
                time_since_approval,
                approver_name: infant.approver_id // Placeholder for future users table join
            };
        });
    }

    async getInfantsRegistry({ search, page = 1, limit = 20, status, urgency, barangay }) {
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const filterStatus = status || 'VALIDATED,PENDING_VALIDATION';
        const statusArray = filterStatus.split(',');

        const result = await this.nipEngine.getApprovedInfantsWithSchedule(
            { search, registration_statuses: statusArray, urgency, barangay },
            parseInt(limit),
            offset
        );

        return {
            infants: result.infants || [],
            pagination: {
                totalRecords: result.total_count,
                totalPages: Math.ceil(result.total_count / parseInt(limit)),
                currentPage: parseInt(page),
                limit: parseInt(limit)
            }
        };
    }

    async getDrafts(userId, barangay = null) {
        // SHARED POOL: In clinical triage, drafts are shared across the same barangay
        // to allow Midwives and other BHWs to pick up incomplete registrations.
        const barangayClause = barangay ? 'AND barangay = ?' : '';
        const params = barangay ? [barangay] : [];
        
        const [drafts] = await this.db.execute(`
            SELECT * FROM infant_registrations 
            WHERE status = 'DRAFT' ${barangayClause}
            ORDER BY draft_saved_at DESC
        `, params);
        return drafts;
    }

    /**
     * CENTRALIZED ID RESOLVER
     * Resolves any incoming ID format to the internal UUID (infants.id).
     *
     * Handles ALL of the following input formats:
     *   - Internal UUID:        'a1b2c3d4-...'           → returned as-is
     *   - Hyphenated ref ID:    'REG-2026-8743'          → resolved from DB
     *   - Space-encoded ref ID: 'REG 2026 8743'          → sanitized then resolved
     *   - DB stored with spaces: reference_id='REG 2026 8743' → matched via OR clause
     *
     * @param {string} idParam - The raw ID from req.params.id
     * @param {string|null} barangay - The user's assigned barangay for tenancy enforcement
     * @returns {string|null} The internal UUID, or null if not found
     */
    async resolveInternalId(idParam, barangay = null) {
        try {
            // Step 1: Normalize input — convert any space variant to hyphenated
            const hyphenated = idParam.toString().replace(/\s+/g, '-');

            // Step 2: If it already looks like a UUID, return it immediately
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hyphenated)) {
                return hyphenated;
            }

            // Step 3: Build the space-variant so we match regardless of how it was stored
            const spaced = hyphenated.replace(/-/g, ' ');

            // Step 4: Query DB matching EITHER the hyphenated or space variant
            // This is the critical fix: the DB may store 'REG 2026 8743' while the
            // request arrives as 'REG-2026-8743' (or vice-versa). We catch both.
            const barangayClause = barangay ? 'AND TRIM(barangay::text) = ?' : '';
            const params = barangay
                ? [hyphenated, spaced, barangay.toString().trim()]
                : [hyphenated, spaced];

            const [rows] = await this.db.execute(
                `SELECT id FROM infants WHERE (reference_id = ? OR reference_id = ?) ${barangayClause} LIMIT 1`,
                params
            );

            if (!rows || rows.length === 0) return null;
            return rows[0].id;
        } catch (error) {
            console.error('EXACT DB ERROR IN resolveInternalId:', error);
            throw error;
        }
    }

    async getScheduleById(id) {
        return await this.nipEngine.getScheduleWithAuthorizationStatus(id);
    }

    async approveRegistration(id, approverId, approverRole, remarks, barangay = null) {
        let connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            const barangayClause = barangay ? 'AND barangay = ?' : '';
            const params = barangay ? [id, barangay] : [id];
            const [existingInfant] = await connection.execute(`
                SELECT id, registration_status, first_name, last_name, dob, reference_id, barangay 
                FROM infants WHERE id = ? ${barangayClause} FOR UPDATE`,
                params
            );

            if (existingInfant.length === 0) {
                throw new Error('Infant record not found');
            }

            const infant = existingInfant[0];

            if (infant.registration_status === 'Approved') {
                const [auditRecord] = await connection.execute(
                    "SELECT timestamp, approver_id FROM approval_audit WHERE infant_id = ? AND action = 'Approved' ORDER BY timestamp DESC LIMIT 1",
                    [id]
                );
                return { alreadyApproved: true, approvedAt: auditRecord.length > 0 ? auditRecord[0].timestamp : null };
            }

            if (infant.registration_status !== 'Pending') {
                throw new Error(`Cannot approve registration with status: ${infant.registration_status}`);
            }

            const [updateResult] = await connection.execute(`
                UPDATE infants 
                SET registration_status = 'Approved', status = 'Active'
                WHERE id = ? AND registration_status = 'Pending'
            `, [id]);

            if (updateResult.affectedRows === 0) {
                throw new Error('Concurrent modification detected');
            }

            const auditId = uuidv4();
            const timestamp = new Date();

            await connection.execute(`
                INSERT INTO approval_audit 
                (id, infant_id, action, approver_id, approver_role, remarks, timestamp)
                VALUES (?, ?, 'Approved', ?, ?, ?, ?)
            `, [auditId, id, approverId, approverRole, remarks || null, timestamp]);

            await connection.commit();
            return { success: true, infant, timestamp };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async rejectRegistration(id, rejectedById, approverRole, rejectionReason, barangay = null) {
        let connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            const barangayClause = barangay ? 'AND barangay = ?' : '';
            const params = barangay ? [id, barangay] : [id];
            const [existingInfant] = await connection.execute(`
                SELECT id, registration_status, first_name, last_name, reference_id, barangay 
                FROM infants WHERE id = ? ${barangayClause} FOR UPDATE`,
                params
            );

            if (existingInfant.length === 0) {
                throw new Error('Infant record not found');
            }

            const infant = existingInfant[0];

            if (infant.registration_status === 'Rejected') {
                const [auditRecord] = await connection.execute(
                    "SELECT timestamp, approver_id, remarks FROM approval_audit WHERE infant_id = ? AND action = 'Rejected' ORDER BY timestamp DESC LIMIT 1",
                    [id]
                );
                return { alreadyRejected: true, rejectedAt: auditRecord.length > 0 ? auditRecord[0].timestamp : null };
            }

            if (infant.registration_status !== 'Pending') {
                throw new Error(`Cannot reject registration with status: ${infant.registration_status}`);
            }

            const [updateResult] = await connection.execute(`
                UPDATE infants 
                SET registration_status = 'Rejected'
                WHERE id = ? AND registration_status = 'Pending'
            `, [id]);

            if (updateResult.affectedRows === 0) {
                throw new Error('Concurrent modification detected');
            }

            const auditId = uuidv4();
            const timestamp = new Date();

            await connection.execute(`
                INSERT INTO approval_audit 
                (id, infant_id, action, approver_id, approver_role, remarks, timestamp)
                VALUES (?, ?, 'Rejected', ?, ?, ?, ?)
            `, [auditId, id, rejectedById, approverRole, rejectionReason.trim(), timestamp]);

            await connection.commit();
            return { success: true, infant, timestamp };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async registerInfant(infantData, userId, userRole, assignedBarangay = null) {
        const validationResult = ValidationService.validate(infantData);
        if (!validationResult.valid) {
            const error = new Error('Validation failed');
            error.code = 'VALIDATION_ERROR';
            error.details = validationResult.errors;
            throw error;
        }

        const isDraft = infantData.registration_status === 'DRAFT';
        if (!isDraft && (!infantData.latitude || !infantData.longitude)) {
            const error = new Error('Spatial coordinates required');
            error.code = 'PROTOCOL_VIOLATION';
            throw error;
        }

        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            const [userCheck] = await connection.execute(
                'SELECT id, role FROM users WHERE id = ? AND is_active = true',
                [userId]
            );

            if (userCheck.length === 0) {
                throw new Error('Invalid or inactive user');
            }

            const sexValue = infantData.sex === 'Male' ? 'M' : infantData.sex === 'Female' ? 'F' : infantData.sex;
            const id = uuidv4();
            const reference_id = this._generateReferenceId();

            const normalizedRole = userRole ? userRole.toUpperCase() : '';
            const isClinicalUser = ['MIDWIFE', 'NURSE', 'ADMIN'].includes(normalizedRole);
            let finalStatus = infantData.registration_status || (isClinicalUser ? 'APPROVED' : 'PENDING');

            if (finalStatus === 'APPROVED' && !isClinicalUser) {
                finalStatus = 'PENDING';
            }

            const isValidated = finalStatus === 'APPROVED' || finalStatus === 'VALIDATED';

            const cpabResult = CPABCalculator.calculate({
                dob: infantData.dob,
                last_tt_date: infantData.last_tt_date || null,
                mother_tt_status: infantData.mother_tt_status,
                pregnancy_order: infantData.pregnancy_order,
                tt_history_unknown: infantData.tt_history_unknown
            });

            const formatDate = (dateStr) => {
                if (!dateStr || dateStr.trim() === '') return null;
                const d = new Date(dateStr);
                return isNaN(d.getTime()) ? null : dateStr;
            };

            let finalMotherTTStatus = infantData.mother_tt_status ? parseInt(infantData.mother_tt_status) : 0;
            let finalLastTTDate = formatDate(infantData.last_tt_date);
            if (infantData.tt_history_unknown) {
                finalMotherTTStatus = 0;
                finalLastTTDate = null;
            }

            const mappedBirthSetting = (infantData.birth_setting || '').toUpperCase().includes('FACILITY') ? 'FACILITY' : 
                                       (infantData.birth_setting || '').toUpperCase().includes('HOME') ? 'HOME' : null;

            const isBcgGiven = infantData.bcg_status === 'Given';
            const isHepBGiven = infantData.hepatitis_b_status?.startsWith('Given');

            let finalLocality = localityHelper.normalizeLocality(infantData.locality, infantData.exact_address || infantData.current_address);
            let finalLocationVerified = !!infantData.is_location_verified || (!!infantData.latitude && !!infantData.longitude);

            // --- CONTEXT LOCKING ---
            const userIsSuperAdmin = (userRole === 'Super Admin');
            const lockedBarangay = userIsSuperAdmin ? (infantData.barangay || null) : assignedBarangay;

            const query = `
                INSERT INTO infants 
                (id, reference_id, first_name, middle_name, last_name, suffix, dob, sex, birth_weight, place_of_birth, 
                 mothers_maiden_name, father_name, caregiver_phone, caregiver_relationship, purok, barangay, current_address,
                 last_tt_date, pregnancy_order, cpab_status,
                 bcg_date, hepatitis_b_date, birth_setting, mother_tt_status,
                 status, created_by, encoded_by_role,
                 is_duplicate, duplicate_override_reason,
                 birth_status,
                 bcg_facility, hepa_b_facility, location, is_location_verified, exact_address,
                 landmark, length_at_birth_cm, initiated_breastfeeding, delivery_facility_name,
                 bcg_status, hepa_b_status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const nowTs = new Date();
            await connection.execute(query, [
                id, reference_id, infantData.first_name, infantData.middle_name || null, infantData.last_name, infantData.suffix || null, infantData.dob, sexValue,
                infantData.birth_weight ? parseFloat(infantData.birth_weight) : null,
                infantData.place_of_birth || null, infantData.mothers_maiden_name || null, infantData.father_name || null, infantData.caregiver_phone, infantData.caregiver_relationship || null,
                finalLocality || null, lockedBarangay, infantData.current_address || null,
                finalLastTTDate,
                infantData.pregnancy_order ? parseInt(infantData.pregnancy_order) : null,
                cpabResult.cpab_status, 
                isBcgGiven ? formatDate(infantData.bcg_date) : null,
                isHepBGiven ? formatDate(infantData.hepatitis_b_date) : null,
                mappedBirthSetting, finalMotherTTStatus,
                'Active', userId, userRole,
                !!infantData.is_duplicate, infantData.duplicate_override_reason || null,
                infantData.birth_status || null,
                false, false,
                infantData.longitude || 121.0509, infantData.latitude || 14.3510,
                finalLocationVerified, infantData.exact_address || null,
                infantData.landmark || null,
                infantData.length_at_birth_cm ? parseFloat(infantData.length_at_birth_cm) : null,
                !!infantData.initiated_breastfeeding, infantData.delivery_facility_name || null,
                infantData.bcg_status || 'Not Given', infantData.hepatitis_b_status || 'Not Given'
            ]);

            if (isValidated) {
                await this.nipScheduleService.generateFullSchedule(id, infantData.dob, connection);
                
                const [checkSchedule] = await connection.execute(
                    'SELECT COUNT(*) as count FROM infant_schedules WHERE infant_id = ?',
                    [id]
                );
                if (checkSchedule[0].count === 0) {
                    throw new Error("Schedule generation failed");
                }

                const atBirthDoses = [];
                const deferredDoses = [];

                if (infantData.bcg_status === 'Given' && infantData.bcg_date) {
                    atBirthDoses.push({ vaccine_name: 'BCG', vaccine_code: 'BCG', administered_date: infantData.bcg_date, site: 'Right Arm' });
                } else if (infantData.bcg_status === 'Not Given' || infantData.bcg_status === 'Unknown') {
                    deferredDoses.push('BCG');
                }
                if (infantData.hepatitis_b_status?.startsWith('Given') && infantData.hepatitis_b_date) {
                    atBirthDoses.push({ vaccine_name: 'Hepatitis B Birth Dose', vaccine_code: 'HEPB', administered_date: infantData.hepatitis_b_date, site: 'Left Thigh' });
                } else if (infantData.hepatitis_b_status === 'Not Given' || infantData.hepatitis_b_status === 'Unknown') {
                    deferredDoses.push('HEPB');
                }

                for (const dose of atBirthDoses) {
                    const schedule = await this.vaccinationService.findScheduleEntry(id, dose.vaccine_code, 1, connection);
                    if (schedule) {
                        await this.vaccinationService.recordVaccination({
                            infant_id: id,
                            schedule_id: schedule.id,
                            vaccine_name: dose.vaccine_name,
                            vaccine_code: dose.vaccine_code,
                            dose_number: 1,
                            batch_number: 'AUTO-BD',
                            site_of_injection: dose.site,
                            vaccinator_id: userId,
                            vaccinator_name: 'System (At birth)',
                            administered_date: dose.administered_date,
                            recorded_by: userId,
                            recorded_by_role: userRole,
                            validation_status: 'VALIDATED'
                        }, connection);
                    }
                }

                for (const missed of deferredDoses) {
                    const schedule = await this.vaccinationService.findScheduleEntry(id, missed, 1, connection);
                    if (schedule) {
                        await connection.execute(`UPDATE infant_schedules SET status = 'OVERDUE' WHERE id = ?`, [schedule.id]);
                    }
                }

                await connection.execute(`
                    INSERT INTO approval_audit (id, infant_id, action, approver_id, approver_role, remarks, timestamp)
                    VALUES (?, ?, 'Approved', ?, ?, ?, ?)
                `, [uuidv4(), id, userId, userRole, 'Auto-approved at registration by clinical staff', nowTs]);
            }

            await connection.commit();
            return { id, reference_id, finalStatus };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }


    async getInfantById(idOrRef, barangay = null, isInternalId = null) {
        try {
            // ─── STEP 1: SANITIZE ───────────────────────────────────────────────
            // URL decoding can turn 'REG-2026-8743' into 'REG 2026 8743'.
            // Normalize ALL spaces to hyphens before any DB interaction.
            const sanitizedId = idOrRef.toString().replace(/\s+/g, '-');

            // ─── STEP 2: DETECT ID TYPE ─────────────────────────────────────────
            // A reference ID contains 'REG-' or hyphens, or is non-numeric.
            // A UUID also contains hyphens, but NOT 'REG-'. We detect by prefix.
            const isRefId = sanitizedId.startsWith('REG-') || 
                            (!sanitizedId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) && 
                             sanitizedId.includes('-') && 
                             !isInternalId);

            const idField = isRefId ? 'reference_id' : 'id';

            // ─── STEP 3: RESOLVE TO INTERNAL UUID ───────────────────────────────
            // If this is a reference ID, first resolve to the internal UUID.
            // This guarantees ALL downstream sub-queries use the UUID (infants.id)
            // and never accidentally receive a 'REG-' string.
            let internalId = sanitizedId;

            if (isRefId) {
                const barangayClause = barangay ? 'AND TRIM(barangay::text) = ?' : '';
                const resolveParams = barangay ? [sanitizedId, barangay.toString().trim()] : [sanitizedId];
                const [resolved] = await this.db.execute(
                    `SELECT id FROM infants WHERE reference_id = ? ${barangayClause} LIMIT 1`,
                    resolveParams
                );
                if (!resolved || resolved.length === 0) return null;
                internalId = resolved[0].id;
            }

            // ─── STEP 4: FETCH FULL PROFILE USING INTERNAL UUID ONLY ────────────
            const barangayClause = barangay ? 'AND TRIM(barangay::text) = ?' : '';
            const params = barangay ? [internalId, barangay.toString().trim()] : [internalId];

            const [infants] = await this.db.execute(`
                SELECT 
                    id, reference_id, first_name, middle_name, last_name, suffix,
                    mothers_maiden_name, father_name,
                    dob, sex, birth_setting, purok, barangay, current_address, caregiver_phone, 
                    caregiver_relationship, birth_weight, place_of_birth, mother_tt_status, last_tt_date,
                    pregnancy_order, cpab_status,
                    bcg_status, hepa_b_status,
                    bcg_date, hepatitis_b_date,
                    next_due_vaccine, 'VALIDATED' AS registration_status,
                    status, created_by, encoded_by_role, created_at,
                    is_location_verified, exact_address,
                    landmark, length_at_birth_cm, initiated_breastfeeding, delivery_facility_name,
                    birth_status,
                    COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                    COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
                FROM infants 
                WHERE id = ? ${barangayClause}
            `, params);

            return infants[0] || null;
        } catch (error) {
            // Task 4: Expose the true DB error so the terminal shows the exact PostgreSQL complaint
            console.error('EXACT DB ERROR IN getInfantById:', error);
            throw error;
        }
    }


    async getVaccinationRecord(id, barangay = null) {
        await this.nipScheduleService.updateScheduleStatuses(id);
        const barangayClause = barangay ? 'AND i.barangay = ?' : '';
        const params = barangay ? [id, barangay] : [id];

        const [rows] = await this.db.execute(`
            SELECT 
                s.id AS schedule_id, s.vaccine_code, COALESCE(r.vaccine_name, s.vaccine_code) AS vaccine_name,
                s.dose_number, s.recommended_date, s.earliest_allowed_date, s.actual_date AS schedule_actual_date,
                s.status AS schedule_status, v.id AS vaccination_id, v.administered_date AS vax_actual_date,
                v.validation_status, v.recorded_by_role, v.batch_number, v.site_of_injection,
                v.vaccinator_name, v.recorded_by, v.notes, v.validated_by_name, v.validated_at, v.recorded_at
            FROM infant_schedules s
            JOIN infants i ON s.infant_id = i.id
            LEFT JOIN doh_compliance_rules r ON s.vaccine_code = r.vaccine_code
            LEFT JOIN vaccinations v ON s.infant_id = v.infant_id AND s.vaccine_code = v.vaccine_code AND s.dose_number = v.dose_number
            WHERE s.infant_id = ? ${barangayClause}
            ORDER BY s.recommended_date ASC, s.dose_number ASC;
        `, params);

        const [infantRows] = await this.db.execute(`
            SELECT 
                id, reference_id, first_name, last_name, mothers_maiden_name, father_name,
                dob, sex, birth_setting, purok, barangay, current_address, caregiver_phone, 
                birth_weight, place_of_birth, mother_tt_status, last_tt_date,
                pregnancy_order, cpab_status,
                next_due_vaccine, 'VALIDATED' AS registration_status,
                status, created_by, created_at, is_location_verified, exact_address,
                landmark, length_at_birth_cm, initiated_breastfeeding, delivery_facility_name,
                COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
            FROM infants i
            WHERE i.id = ? ${barangayClause}
        `, params);
        const infant = infantRows[0] || null;


        const formattedRecord = rows.map(row => ({
            ...row,
            actual_date: row.vax_actual_date || row.schedule_actual_date || null,
            // COMPLETED and COMPLETED_VALIDATED both mean the dose is administered & confirmed.
            // At-birth doses auto-logged by approveAndPromote have schedule_status = 'COMPLETED'.
            status: (row.schedule_status === 'COMPLETED')
                ? 'COMPLETED_VALIDATED'
                : (row.schedule_status === 'PENDING_VALIDATION' ? 'PENDING_VALIDATION' : 'NOT_GIVEN'),
            original_schedule_status: row.schedule_status
        }));

        const summary = {
            completed: formattedRecord.filter(r => r.status === 'COMPLETED_VALIDATED').length,
            pending: formattedRecord.filter(r => r.status === 'PENDING_VALIDATION').length,
            defaulter: formattedRecord.filter(r => (r.original_schedule_status === 'DEFAULTER' || r.original_schedule_status === 'DROPOUT') && r.status === 'NOT_GIVEN').length,
            due_today: formattedRecord.filter(r => r.original_schedule_status === 'DUE_TODAY' && r.status === 'NOT_GIVEN').length,
            due_soon: formattedRecord.filter(r => r.original_schedule_status === 'DUE_SOON' && r.status === 'NOT_GIVEN').length,
            upcoming: formattedRecord.filter(r => r.original_schedule_status === 'NOT_YET_DUE' && r.status === 'NOT_GIVEN').length,
            total_doses: formattedRecord.length
        };

        let age_metrics = { ageInMonths: 0, ageInWeeks: 0 };
        if (infant?.dob) {
            const birth = new Date(infant.dob);
            const today = new Date();
            const timeDiff = today.getTime() - birth.getTime();
            const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
            age_metrics.ageInWeeks = Math.floor(daysDiff / 7);
            age_metrics.ageInMonths = Math.floor(daysDiff / 30.44);
        }

        return { infant, formattedRecord, summary, age_metrics };
    }

    async updateInfant(idOrRef, infantData, barangay = null) {
        const fields = Object.keys(infantData).map(key => `${key} = ?`).join(', ');
        const values = Object.values(infantData);
        
        const barangayClause = barangay ? 'AND barangay = ?' : '';
        const params = barangay ? [...values, idOrRef, idOrRef, barangay] : [...values, idOrRef, idOrRef];

        const [result] = await this.db.execute(`UPDATE infants SET ${fields} WHERE (id = ? OR reference_id = ?) ${barangayClause}`, params);
        return result.affectedRows > 0;
    }

    _generateReferenceId() {
        const year = new Date().getFullYear();
        const random = Math.floor(1000 + Math.random() * 9000);
        return `LG-${year}-${random}`;
    }

    /**
     * getSpatialTriage
     * Unified logic for spatial risk analysis used by Dashboard and Heatmap.
     */
    async getSpatialTriage(params = {}) {
        let { eps = 300, minPts = 3, barangay = null, scope = 'defaulter' } = params;
        // Normalize to uppercase to match the rhu2_barangay PostgreSQL enum
        if (barangay) barangay = barangay.toUpperCase();

        // 1. Fetch infants using the clinical engine for consistent urgency/schedule data
        const scheduleData = await this.nipEngine.getApprovedInfantsWithSchedule({ 
            barangay,
            urgency: 'all' 
        }, 10000, 0);

        const infants = scheduleData.infants || [];
        if (infants.length === 0) {
            return {
                barangay,
                clusters: [],
                noise: [],
                all_infants: [],
                recommended_actions: [],
                counts: { 
                    all: 0, 
                    mappable_in_scope: 0,
                    total_defaulters: 0,
                    total_due_soon: 0,
                    total_on_track: 0,
                    total_completed: 0,
                    total_ineligible: 0,
                    total_upcoming: 0,
                    urgency: {
                        defaulter: 0,
                        due_today: 0,
                        due_soon: 0,
                        upcoming: 0,
                        completed: 0
                    }
                }
            };
        }

        // 2. Fetch worst-case computed schedule status from database directly using LEFT JOIN.
        // CLINICAL LOGIC: Priority order — DEFAULTER > DUE_TODAY > DUE_SOON > ON_TRACK > COMPLETED
        // ON_TRACK = infant has upcoming (NOT_YET_DUE) doses but none overdue or immediately due.
        // COMPLETED = every schedule row is COMPLETED or INELIGIBLE (Fully Immunized Child).
        let statusQuery = `
            SELECT 
                i.id,
                COALESCE(
                    MAX(CASE WHEN s.status = 'DEFAULTER'   THEN 'DEFAULTER'  END),
                    MAX(CASE WHEN s.status = 'DROPOUT'     THEN 'DEFAULTER'  END),
                    MAX(CASE WHEN s.status = 'DUE_TODAY'   THEN 'DUE_TODAY'  END),
                    MAX(CASE WHEN s.status = 'DUE_SOON'    THEN 'DUE_SOON'   END),
                    MAX(CASE WHEN s.status = 'NOT_YET_DUE' THEN 'ON_TRACK'   END),
                    'COMPLETED'
                ) AS computed_map_status
            FROM infants i
            LEFT JOIN infant_schedules s ON i.id = s.infant_id
                AND s.status NOT IN ('COMPLETED', 'INELIGIBLE', 'PENDING_VALIDATION')
        `;
        const statusParams = [];
        if (barangay) {
            statusQuery += ` WHERE i.barangay = ?`;
            statusParams.push(barangay);
        }
        statusQuery += ` GROUP BY i.id`;
        const [statusRows] = await this.db.query(statusQuery, statusParams);
        const statusMap = new Map(statusRows.map(r => [r.id, r.computed_map_status]));

        // 3. Prepare dataset
        const dataset = infants.map(inf => {
            const hasCoords = inf.lat != null && inf.lng != null && inf.lat !== 0;

            // Mapping Readiness
            let mapping_readiness = 'Unmapped';
            if (hasCoords) {
                // is_location_verified is the clinical truth for house-level geocoding.
                // If false but coords exist, it's an approximated position (street/sitio).
                mapping_readiness = inf.is_location_verified ? 'Verified' : 'Approximate';
            }

            const computed_map_status = statusMap.get(inf.id) || 'COMPLETED';

            // Clinical Directive — 4 independent states
            let clinical_directive = 'Routine Follow-Up';
            const doseCount = (inf.vaccination_needs || []).length;
            const topVaccine = doseCount > 0 ? (inf.vaccination_needs[0].vaccine_name || inf.vaccination_needs[0].vaccine_code) : null;

            if (computed_map_status === 'DEFAULTER') {
                clinical_directive = topVaccine ? `Visit for ${topVaccine}` : 'Urgent Follow-Up';
            } else if (computed_map_status === 'DUE_TODAY' || computed_map_status === 'DUE_SOON') {
                clinical_directive = topVaccine ? `Prepare ${topVaccine}` : 'Prepare Next Dose';
            } else if (computed_map_status === 'ON_TRACK') {
                clinical_directive = 'On Schedule — Next dose upcoming';
            } else if (computed_map_status === 'COMPLETED') {
                clinical_directive = 'Fully Immunized Child (FIC)';
            }

            // Map Rendering Rules: 4 independent color categories
            let marker_color = '#94A3B8'; // Default slate for unknown
            if (computed_map_status === 'DEFAULTER') {
                marker_color = '#EF4444'; // Red
            } else if (computed_map_status === 'DUE_TODAY' || computed_map_status === 'DUE_SOON') {
                marker_color = '#F59E0B'; // Amber
            } else if (computed_map_status === 'ON_TRACK') {
                marker_color = '#10B981'; // Green
            } else if (computed_map_status === 'COMPLETED') {
                marker_color = '#64748B'; // Grey
            }

            // Urgency: lowercase token for frontend filtering — 4 independent values
            const urgency = 
                computed_map_status === 'DEFAULTER'                             ? 'defaulter' :
                (computed_map_status === 'DUE_TODAY' || computed_map_status === 'DUE_SOON') ? 'due_soon'  :
                computed_map_status === 'ON_TRACK'                              ? 'on_track'  :
                'completed';

            return {
                ...inf,
                patient_name: `${inf.first_name} ${inf.last_name}`.trim(),
                lat: hasCoords ? parseFloat(inf.lat) : null,
                lng: hasCoords ? parseFloat(inf.lng) : null,
                mapping_readiness,
                clinical_directive,
                marker_color,
                computed_map_status,
                urgency
            };
        });

        // 3. Filter for clustering based on the active scope (only mappable infants)
        let dssDataset = [];
        if (scope === 'defaulter' || scope === 'dropout') {
            dssDataset = dataset.filter(pt => pt.urgency === 'defaulter' && pt.lat != null && pt.lng != null);
        } else if (scope === 'due-soon') {
            dssDataset = dataset.filter(pt => (pt.urgency === 'due_soon' || pt.urgency === 'due_today') && pt.lat != null && pt.lng != null);
        } else if (scope === 'actionable' || scope === 'clusters') {
            dssDataset = dataset.filter(pt => (pt.urgency === 'defaulter' || pt.urgency === 'due_soon' || pt.urgency === 'due_today') && pt.lat != null && pt.lng != null);
        } else if (scope === 'all' || scope === 'census') {
            // For 'all' scope, we don't want to cluster the healthy populations, but we return everyone
            dssDataset = []; 
        } else {
            // Default fallback
            dssDataset = dataset.filter(pt => pt.urgency === 'defaulter' && pt.lat != null && pt.lng != null);
        }

        // 4. Run DBSCAN
        const dbscan = new DBSCANService(parseInt(eps), parseInt(minPts));
        const rawClusters = dssDataset.length >= parseInt(minPts) ? dbscan.cluster(dssDataset) : [];

        // 5. Build Clusters
        const clusteredPointIds = new Set();
        let clusters = rawClusters.map((clusterPts, index) => {
            let totalDoses = 0;
            let dueDoses = 0;
            clusterPts.forEach(pt => {
                clusteredPointIds.add(pt.id);
                if (pt.urgency === 'defaulter') {
                    totalDoses += (pt.vaccination_needs || []).length;
                } else if (pt.urgency === 'due_soon' || pt.urgency === 'due_today') {
                    dueDoses += (pt.vaccination_needs || []).length;
                }
            });

            const areaName = localityHelper.deriveClusterLabel(clusterPts);
            const meta = DBSCANService.getClusterMetadata(clusterPts);
            
            // Compute severity based on dose burden
            let severity = 'low';
            const relevantDoses = totalDoses + dueDoses;
            
            if (relevantDoses >= 8 || clusterPts.length >= 8) severity = 'critical';
            else if (relevantDoses >= 5 || clusterPts.length >= 5) severity = 'high';
            else if (relevantDoses >= 2 || clusterPts.length >= 3) severity = 'medium';

            // Find bounds for zoom
            const lats = clusterPts.map(p => p.lat);
            const lngs = clusterPts.map(p => p.lng);
            const bounds = [
                [Math.min(...lats), Math.min(...lngs)],
                [Math.max(...lats), Math.max(...lngs)]
            ];

            return {
                clusterId: `CL-${index}`,
                points: clusterPts,
                lat: meta ? meta.medoid_lat : clusterPts[0].lat,
                lng: meta ? meta.medoid_lng : clusterPts[0].lng,
                bounds: bounds,
                total_infants: clusterPts.length,
                total_defaulter_doses: totalDoses,
                total_due_doses: dueDoses,
                locality: areaName,
                severity: severity,
                area_justification: `${clusterPts.length} infants with ${totalDoses + dueDoses} actionable doses.`,
                // Only use actionable doses for sort metric
                _sortMetric: relevantDoses + (clusterPts.length * 0.5) 
            };
        });

        // 6. Rank clusters
        clusters = clusters.sort((a, b) => b._sortMetric - a._sortMetric);
        clusters.forEach((c, i) => { c.rank = i + 1; });

        const noise = dssDataset.filter(pt => !clusteredPointIds.has(pt.id));

        // 7. Generate Recommended Actions based ONLY on valid clusters
        const recommended_actions = [];

        if (clusters.length > 0) {
            const topCluster = clusters[0];
            const isDueSoon = scope === 'due-soon';
            
            recommended_actions.push({
                type: 'FIELD_TARGET',
                rank: 1,
                title: isDueSoon ? `PREVENTIVE TARGET — ${topCluster.locality}` : `STRATEGIC FOLLOW-UP — ${topCluster.locality}`,
                subtitle: `High-density cluster with ${topCluster.total_infants} infants`,
                reason: isDueSoon ? 'Highest concentration of upcoming doses.' : 'Highest concentration of defaulter doses.',
                severity: topCluster.severity,
                impact: `${topCluster.total_defaulter_doses + topCluster.total_due_doses} doses addressable`,
                targetId: topCluster.clusterId,
                lat: topCluster.lat,
                lng: topCluster.lng,
                bounds: topCluster.bounds
            });

            if (clusters.length > 1) {
                const secondary = clusters[1];
                recommended_actions.push({
                    type: 'FIELD_TARGET',
                    rank: 2,
                    title: `SECONDARY TARGET — ${secondary.locality}`,
                    subtitle: `${secondary.total_infants} infants in this segment`,
                    reason: 'Significant localized dose burden.',
                    severity: secondary.severity,
                    impact: `${secondary.total_defaulter_doses + secondary.total_due_doses} doses`,
                    targetId: secondary.clusterId,
                    lat: secondary.lat,
                    lng: secondary.lng,
                    bounds: secondary.bounds
                });
            }
        }

        if (noise.length > 0) {
            const highBurdenNoise = noise
                .filter(pt => (pt.vaccination_needs || []).length >= 3)
                .sort((a, b) => (b.vaccination_needs || []).length - (a.vaccination_needs || []).length);
            
            if (highBurdenNoise.length > 0) {
                recommended_actions.push({
                    type: 'INDIVIDUAL_TRIAGE',
                    rank: recommended_actions.length + 1,
                    title: 'ROUTINE FOLLOW-UP — Individual Cases',
                    subtitle: `${highBurdenNoise.length} isolated high-burden cases`,
                    reason: 'Isolated cases with significant dose needs.',
                    severity: 'low',
                    impact: 'Improve overall immunization coverage',
                    count: highBurdenNoise.length
                });
            }
        }

        // 8. Response Construction
        const getCounts = (statusList, mappableOnly = false) => {
            return dataset.filter(p => 
                statusList.includes(p.urgency) && 
                (!mappableOnly || (p.lat != null && p.lng != null))
            ).length;
        };

        return {
            barangay,
            scope,
            clusters,
            noise,
            all_infants: dataset, // Send all infants so map can render all 4 status layers
            recommended_actions: recommended_actions.sort((a, b) => a.rank - b.rank),
            counts: {
                all: dataset.length,
                mappable_in_scope: dssDataset.length,
                
                // Detailed Clinical Counts (Total population truth) — 4 independent buckets
                total_defaulters: getCounts(['defaulter']),
                total_due_soon:   getCounts(['due_soon']),
                total_on_track:   getCounts(['on_track']),
                total_completed:  getCounts(['completed']),

                // Mapped Counts (Visible on map with valid lat/lng)
                mapped_defaulters: getCounts(['defaulter'], true),
                mapped_due_soon:   getCounts(['due_soon'], true),
                mapped_on_track:   getCounts(['on_track'], true),
                mapped_completed:  getCounts(['completed'], true),

                // Unmapped Counts (Exclusions)
                unmapped_defaulters: getCounts(['defaulter']) - getCounts(['defaulter'], true),
                unmapped_due_soon:   getCounts(['due_soon'])  - getCounts(['due_soon'],  true)
            }
        };
    }

    async getVaccinationRecords(id, barangay = null) {
        return this.getVaccinationRecord(id, barangay);
    }

    async getNIPSchedule(id) {
        return this.nipScheduleService.getSchedule(id);
    }
}

module.exports = InfantService;
