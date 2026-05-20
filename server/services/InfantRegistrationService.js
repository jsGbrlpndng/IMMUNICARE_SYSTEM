const { v4: uuidv4 } = require('uuid');
const NIPScheduleService = require('./NIPScheduleService');
const VaccinationService = require('./VaccinationService');
const { ROLES, REGISTRATION_STATUS } = require('../constants/domain');

class InfantRegistrationService {
    constructor(db) {
        this.db = db;
        this.nipScheduleService = new NIPScheduleService(db);
        this.vaccinationService = new VaccinationService(db);
    }

    /**
     * BHW Encode: Save a new registration or draft
     */
    async saveRegistration(data, actorOrUserId, legacyRole) {
        const actor = this._actor(actorOrUserId, legacyRole);
        this._requireRole(actor, [ROLES.BHW], 'Only BHWs can create or update infant registrations.');

        if (!data || typeof data !== 'object') {
            throw this._httpError('Registration data is required.', 400);
        }

        const id = data.id || uuidv4();
        const reference_id = data.reference_id || this._generateReferenceId();

        const status = this._normalizeBhwSaveStatus(data.status || data.registration_status);
        if (status === REGISTRATION_STATUS.PENDING_VALIDATION) {
            data.correction_notes = null;
        }

        // Explicitly trim and normalize the barangay string
        const trimmedBarangay = this._normalizeBarangay(actor.assigned_barangay || data.barangay);
        if (!trimmedBarangay || !this._canAccessBarangay(actor, trimmedBarangay)) {
            throw this._httpError('Forbidden: Registration is outside your barangay scope.', 403);
        }
        data.barangay = trimmedBarangay;

        const query = `
            INSERT INTO infant_registrations 
            (id, reference_id, registration_data, status, barangay, created_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                registration_data = EXCLUDED.registration_data,
                status = EXCLUDED.status,
                barangay = EXCLUDED.barangay,
                correction_notes = CASE WHEN EXCLUDED.status = 'PENDING_VALIDATION' THEN NULL ELSE infant_registrations.correction_notes END,
                updated_at = CURRENT_TIMESTAMP
            WHERE infant_registrations.status IN ('DRAFT', 'NEEDS_CORRECTION')
              AND infant_registrations.created_by = ?
              AND TRIM(infant_registrations.barangay) = ?
        `;

        const [result] = await this.db.execute(query, [
            id, 
            reference_id, 
            JSON.stringify(data), 
            status, 
            trimmedBarangay, 
            actor.id,
            actor.id,
            trimmedBarangay
        ]);

        if (result.affectedRows === 0 && data.id) {
            throw new Error('Record is locked for validation or access denied.');
        }

        return { id, reference_id, status };
    }

    /**
     * Midwife Queue: Fetch records pending validation
     */
    async getValidationQueue(barangay = null, actor = null) {
        const normalizedBarangay = this._normalizeBarangay(barangay);
        if (actor?.role && actor.role !== ROLES.SUPER_ADMIN && !this._canAccessBarangay(actor, normalizedBarangay)) {
            throw this._httpError('Forbidden: Validation queue is outside your barangay scope.', 403);
        }

        let query = `
            SELECT ir.*, u.full_name as submitted_by_name 
            FROM infant_registrations ir
            LEFT JOIN users u ON ir.created_by = u.id
            WHERE ir.status = 'PENDING_VALIDATION'
        `;
        const params = [];

        if (normalizedBarangay) {
            query += ' AND TRIM(ir.barangay) = ?';
            params.push(normalizedBarangay);
        }

        query += ' ORDER BY ir.created_at ASC';
        
        const [rows] = await this.db.execute(query, params);
        return rows.map(row => {
            const data = typeof row.registration_data === 'string' 
                ? JSON.parse(row.registration_data) 
                : row.registration_data;
            
            return {
                id: row.id,
                reference_id: row.reference_id,
                status: row.status,
                correction_notes: row.correction_notes,
                barangay: row.barangay,
                created_by: row.created_by,
                promoted_infant_id: row.promoted_infant_id,
                correction_cycle_count: row.correction_cycle_count,
                review_history: row.review_history,
                created_at: row.created_at,
                updated_at: row.updated_at,
                submitted_by_name: row.submitted_by_name,
                ...data
            };
        });
    }

    /**
     * Duplicate Check: Multi-factor detection
     */
    async checkDuplicates(data, actor = null) {
        const { first_name, last_name, dob, mothers_maiden_name } = data;
        const scopedBarangay = actor?.role === ROLES.SUPER_ADMIN ? this._normalizeBarangay(data.barangay) : this._normalizeBarangay(actor?.assigned_barangay || data.barangay);
        const barangayClause = scopedBarangay ? ' AND TRIM(barangay) = ?' : '';
        const barangayParams = scopedBarangay ? [scopedBarangay] : [];
        
        // Exact match
        const [exact] = await this.db.execute(`
            SELECT id, reference_id, first_name, last_name, dob 
            FROM infants 
            WHERE first_name = ? AND last_name = ? AND dob = ?
            ${barangayClause}
        `, [first_name, last_name, dob, ...barangayParams]);

        if (exact.length > 0) return { type: 'EXACT', matches: exact };

        // Fuzzy match (Basic name + Mother match)
        const [fuzzy] = await this.db.execute(`
            SELECT id, reference_id, first_name, last_name, dob, mothers_maiden_name
            FROM infants 
            WHERE (first_name ILIKE ? OR last_name ILIKE ?) 
            AND dob = ?
            AND mothers_maiden_name ILIKE ?
            ${barangayClause}
        `, [`%${first_name}%`, `%${last_name}%`, dob, `%${mothers_maiden_name || ''}%`, ...barangayParams]);

        if (fuzzy.length > 0) return { type: 'FUZZY', matches: fuzzy };

        return null;
    }

    /**
     * Midwife Approval: Promote to infants table
     */
    /**
     * Midwife Approval: Promote to infants table
     */
    async approveAndPromote(registrationId, actorOrReviewerId, legacyRoleOrNotes, legacyNotes) {
        const actor = this._actor(actorOrReviewerId, legacyNotes === undefined ? null : legacyRoleOrNotes);
        const notes = legacyNotes === undefined ? legacyRoleOrNotes : legacyNotes;
        this._requireRole(actor, [ROLES.MIDWIFE], 'Only Midwives can approve infant registrations.');

        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Fetch registration
            const reg = await this._getRegistrationForActor(connection, registrationId, actor, true);
            const data = typeof reg.registration_data === 'string' ? JSON.parse(reg.registration_data) : reg.registration_data;

            if (reg.status !== REGISTRATION_STATUS.PENDING_VALIDATION) {
                throw new Error(`Forbidden: Cannot approve from ${reg.status}. Registration must be PENDING_VALIDATION.`);
            }

            // CLINICAL VALIDATION GUARDRAILS
            // Verify vaccine dates against Date of Birth
            const dob = new Date(data.dob);
            if (data.bcg_status?.includes('GIVEN') && data.bcg_date) {
                if (new Date(data.bcg_date) < dob) {
                    throw new Error("Clinical Error: BCG administration date cannot precede the infant's Date of Birth.");
                }
            }
            if (data.hepatitis_b_status?.includes('GIVEN') && data.hepatitis_b_date) {
                if (new Date(data.hepatitis_b_date) < dob) {
                    throw new Error("Clinical Error: Hepatitis B administration date cannot precede the infant's Date of Birth.");
                }
            }

            // 2. Map data to infants table
            const infantId = uuidv4();
            const referenceId = reg.reference_id;

            // Build review history for the registration record
            const history = this._parseHistory(reg.review_history);
            history.push({
                reviewer_id: actor.id,
                action: REGISTRATION_STATUS.APPROVED,
                notes: notes,
                timestamp: new Date().toISOString()
            });

            const sexValue = data.sex === 'Male' ? 'M' : data.sex === 'Female' ? 'F' : data.sex;
            
            const promoQuery = `
                INSERT INTO infants 
                (id, reference_id, first_name, middle_name, last_name, suffix, dob, sex, 
                 birth_weight, place_of_birth, mothers_maiden_name, father_name, caregiver_phone, caregiver_relationship, 
                 purok, barangay, current_address, last_tt_date, pregnancy_order, cpab_status,
                 bcg_date, hepatitis_b_date, birth_setting, mother_tt_status,
                 status, created_by, encoded_by_role, created_at, birth_status,
                 bcg_facility, hepa_b_facility, location, is_location_verified, exact_address,
                 landmark, length_at_birth_cm, initiated_breastfeeding, delivery_facility_name,
                 bcg_status, hepa_b_status, latitude, longitude, approved_registration_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await connection.execute(promoQuery, [
                infantId, referenceId, data.first_name, data.middle_name || null, data.last_name, data.suffix || null, data.dob, sexValue,
                data.birth_weight ? parseFloat(data.birth_weight) : null,
                data.place_of_birth || null, data.mothers_maiden_name || data.mother_name || null, data.father_name || null, data.caregiver_phone || null, data.caregiver_relationship || null,
                data.purok || null, reg.barangay ? reg.barangay.toUpperCase() : null, data.current_address || null,
                data.last_tt_date || null,
                data.pregnancy_order ? parseInt(data.pregnancy_order) : null,
                data.cpab_status || 'Pending', 
                data.bcg_date || null,
                data.hepatitis_b_date || null,
                data.birth_setting || null, data.mother_tt_status ? String(data.mother_tt_status) : '0',
                reg.created_by, data.encoded_by_role || 'BHW',
                data.birth_status || null,
                !!data.bcg_facility, !!data.hepa_b_facility,
                parseFloat(data.longitude) || 0, parseFloat(data.latitude) || 0,
                !!data.is_location_verified,
                data.exact_address || null,
                data.landmark || null,
                data.length_at_birth_cm ? parseFloat(data.length_at_birth_cm) : null,
                !!(data.initiated_breastfeeding || data.breastfed_immediately_after_birth),
                data.delivery_facility_name || null,
                data.bcg_status || null,
                data.hepatitis_b_status || data.hepa_b_status || null,
                data.latitude ? parseFloat(data.latitude) : null,
                data.longitude ? parseFloat(data.longitude) : null,
                registrationId
            ]);

            // 3. Update registration status
            await connection.execute(`
                UPDATE infant_registrations 
                SET status = 'APPROVED', 
                    promoted_infant_id = ?, 
                    reviewed_by = ?,
                    reviewed_at = CURRENT_TIMESTAMP,
                    review_history = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [infantId, actor.id, JSON.stringify(history), registrationId]);

            // 4. Write Audit Trail (New Schema)
            await connection.execute(`
                INSERT INTO audit_trail (id, entity_type, entity_id, action_type, user_id, user_role, old_values, new_values, description)
                VALUES (?, 'infant', ?, 'status_change', ?, ?, ?, ?, ?)
            `, [
                uuidv4(),
                registrationId,
                actor.id,
                actor.role,
                JSON.stringify({ status: reg.status }),
                JSON.stringify({ status: REGISTRATION_STATUS.APPROVED, promoted_infant_id: infantId }),
                notes || 'Approved via Validation Center'
            ]);

            await connection.execute(`
                INSERT INTO approval_audit (id, registration_id, infant_id, action, approver_id, approver_role, remarks, timestamp)
                VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, CURRENT_TIMESTAMP)
            `, [uuidv4(), registrationId, infantId, actor.id, actor.role, notes || 'Approved via Validation Center']);

            // 5. Generate NIP Schedule
            await this.nipScheduleService.generateFullSchedule(infantId, data.dob, connection);

            // 6. AUTO-LOG AT-BIRTH DOSES (BCG & HepB)
            // Inspect the at_birth_doses payload captured by the BHW.
            // If given, INSERT a VALIDATED vaccination record into the vaccinations table
            // so the Infant Profile and NIP Scheduler show them as "Administered" immediately.
            // The DB trigger trg_calculate_immunization_status fires automatically on INSERT.
            const atBirthDosesToLog = [];

            const formatDobLocal = (dateStr) => {
                const d = new Date(dateStr);
                return d.getFullYear() + '-' +
                       String(d.getMonth() + 1).padStart(2, '0') + '-' +
                       String(d.getDate()).padStart(2, '0');
            };
            const dobStr = formatDobLocal(data.dob);

            const completedStatuses = ['Given', 'Given within 24 hours', 'Given more than 24 hours', 'GIVEN'];
            if (data.bcg_given || completedStatuses.includes(data.bcg_status)) {
                const adminDate = data.bcg_date || dobStr;
                atBirthDosesToLog.push({
                    vaccine_name: 'BCG',
                    vaccine_code: 'BCG',
                    dose_number: 1,
                    site_of_injection: 'Right Deltoid',
                    administered_date: adminDate
                });
            }

            if (data.hepatitis_b_given || completedStatuses.includes(data.hepatitis_b_status) || completedStatuses.includes(data.hepa_b_status)) {
                const adminDate = data.hepatitis_b_date || data.bcg_date || dobStr;
                atBirthDosesToLog.push({
                    vaccine_name: 'Hepatitis B Birth Dose',
                    vaccine_code: 'HEPB',
                    dose_number: 1,
                    site_of_injection: 'Left Anterolateral Thigh',
                    administered_date: adminDate
                });
            }

            for (const dose of atBirthDosesToLog) {
                // Resolve the schedule entry created in step 5
                const scheduleEntry = await this.vaccinationService.findScheduleEntry(
                    infantId, dose.vaccine_code, 1, connection
                );

                if (!scheduleEntry) {
                    console.warn(`[APPROVE] Schedule entry not found for ${dose.vaccine_code}. Skipping at-birth dose log.`);
                    continue;
                }

                // Idempotency: skip if already logged
                const [existingVax] = await connection.execute(
                    'SELECT id FROM vaccinations WHERE infant_id = ? AND vaccine_code = ? AND dose_number = 1',
                    [infantId, dose.vaccine_code]
                );
                if (existingVax.length > 0) {
                    console.log(`[APPROVE] At-birth dose for ${dose.vaccine_code} already logged. Skipping.`);
                    continue;
                }

                // INSERT into vaccinations — triggers calculate_immunization_status
                const vaccinationId = uuidv4();
                await connection.execute(`
                    INSERT INTO vaccinations (
                        id, infant_id, schedule_id, vaccine_name, vaccine_code,
                        dose_number, batch_number, site_of_injection,
                        vaccinator_id, vaccinator_name, administered_date,
                        notes, validation_status, is_early_override,
                        recorded_by, recorded_by_role, recorded_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALIDATED', false, ?, ?, CURRENT_TIMESTAMP)
                `, [
                    vaccinationId,
                    infantId,
                    scheduleEntry.id,
                    dose.vaccine_name,
                    dose.vaccine_code,
                    dose.dose_number,
                    'AT-BIRTH',
                    dose.site_of_injection,
                    actor.id,
                    'Midwife (Approval)',
                    dose.administered_date,
                    'Auto-logged at-birth dose upon Midwife validation approval.',
                    actor.id,
                    actor.role
                ]);

                // Mark the schedule entry as COMPLETED (with actual_date set)
                await connection.execute(`
                    UPDATE infant_schedules
                    SET status = 'COMPLETED',
                        actual_date = ?
                    WHERE id = ?
                      AND status NOT IN ('COMPLETED')
                `, [dose.administered_date, scheduleEntry.id]);

                console.log(`[APPROVE] At-birth dose logged: ${dose.vaccine_code} on ${dose.administered_date} for infant ${infantId}`);
            }

            await connection.commit();
            const cleanReferenceId = referenceId.replace(/\s+/g, '-');
            return { infantId, referenceId: cleanReferenceId };

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * Midwife Rejection: Permanently reject the registration
     */
    async rejectRegistration(registrationId, actorOrReviewerId, legacyRoleOrReason, legacyReason) {
        const actor = this._actor(actorOrReviewerId, legacyReason === undefined ? null : legacyRoleOrReason);
        const reason = legacyReason === undefined ? legacyRoleOrReason : legacyReason;
        this._requireRole(actor, [ROLES.MIDWIFE], 'Only Midwives can reject infant registrations.');

        console.log(`[REJECT SERVICE] Attempting to reject ${registrationId} by ${actor.id} (${actor.role})`);
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            const reg = await this._getRegistrationForActor(connection, registrationId, actor, true);

            if (reg.status !== REGISTRATION_STATUS.PENDING_VALIDATION) {
                throw new Error(`Forbidden: Cannot reject from ${reg.status}. Registration must be PENDING_VALIDATION.`);
            }

            const history = this._parseHistory(reg.review_history);
            history.push({
                reviewer_id: actor.id,
                action: REGISTRATION_STATUS.REJECTED,
                notes: reason,
                timestamp: new Date().toISOString()
            });

            await connection.execute(
                'UPDATE infant_registrations SET status = ?, review_history = ?, correction_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['REJECTED', JSON.stringify(history), reason, registrationId]
            );

            await connection.execute(`
                INSERT INTO audit_trail (id, entity_type, entity_id, action_type, user_id, user_role, old_values, new_values, description)
                VALUES (?, 'infant', ?, 'status_change', ?, ?, ?, ?, ?)
            `, [
                uuidv4(),
                registrationId,
                actor.id,
                actor.role,
                JSON.stringify({ status: reg.status }),
                JSON.stringify({ status: REGISTRATION_STATUS.REJECTED }),
                reason
            ]);

            await connection.commit();
            return true;
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * Midwife Return: Back to BHW for correction
     */
    async returnForCorrection(registrationId, actorOrReviewerId, legacyRoleOrNotes, legacyNotes) {
        const actor = this._actor(actorOrReviewerId, legacyNotes === undefined ? null : legacyRoleOrNotes);
        const notes = legacyNotes === undefined ? legacyRoleOrNotes : legacyNotes;
        this._requireRole(actor, [ROLES.MIDWIFE], 'Only Midwives can return infant registrations for correction.');

        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            const reg = await this._getRegistrationForActor(connection, registrationId, actor, true);
            if (reg.status !== REGISTRATION_STATUS.PENDING_VALIDATION) {
                throw new Error(`Forbidden: Cannot return from ${reg.status}. Registration must be PENDING_VALIDATION.`);
            }

            const history = this._parseHistory(reg.review_history);
            history.push({
                reviewer_id: actor.id,
                action: 'RETURNED_FOR_CORRECTION',
                notes: notes,
                timestamp: new Date().toISOString()
            });

            await connection.execute(`
                UPDATE infant_registrations 
                SET status = 'NEEDS_CORRECTION',
                    correction_cycle_count = correction_cycle_count + 1,
                    review_history = ?,
                    correction_notes = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [JSON.stringify(history), notes, registrationId]);

            await connection.execute(`
                INSERT INTO audit_trail (id, entity_type, entity_id, action_type, user_id, user_role, old_values, new_values, description)
                VALUES (?, 'infant', ?, 'status_change', ?, ?, ?, ?, ?)
            `, [
                uuidv4(),
                registrationId,
                actor.id,
                actor.role,
                JSON.stringify({ status: reg.status }),
                JSON.stringify({ status: REGISTRATION_STATUS.NEEDS_CORRECTION }),
                notes
            ]);

            await connection.commit();
            return true;
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * Midwife Correction: Direct alteration of registration data
     */
    async updateRegistrationData(registrationId, actorOrReviewerId, legacyRoleOrData, legacyData) {
        const actor = this._actor(actorOrReviewerId, legacyData === undefined ? null : legacyRoleOrData);
        const updatedData = legacyData === undefined ? legacyRoleOrData : legacyData;
        this._requireRole(actor, [ROLES.MIDWIFE], 'Only Midwives can directly correct pending registrations.');

        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            const reg = await this._getRegistrationForActor(connection, registrationId, actor, true);

            if (reg.status !== REGISTRATION_STATUS.PENDING_VALIDATION) {
                throw new Error(`Forbidden: Direct corrections only allowed during PENDING_VALIDATION.`);
            }

            const oldData = typeof reg.registration_data === 'string' ? JSON.parse(reg.registration_data) : reg.registration_data;
            
            // Diff calculation (shallow)
            const diff = {};
            for (const key in updatedData) {
                if (JSON.stringify(updatedData[key]) !== JSON.stringify(oldData[key])) {
                    diff[key] = { from: oldData[key], to: updatedData[key] };
                }
            }

            if (Object.keys(diff).length === 0) {
                await connection.rollback();
                return { success: true, message: 'No changes detected.' };
            }

            await connection.execute(
                'UPDATE infant_registrations SET registration_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [JSON.stringify(updatedData), registrationId]
            );

            await connection.execute(`
                INSERT INTO audit_trail (id, entity_type, entity_id, action_type, user_id, user_role, old_values, new_values, description)
                VALUES (?, 'infant', ?, 'update', ?, ?, ?, ?, ?)
            `, [
                uuidv4(),
                registrationId,
                actor.id,
                actor.role,
                JSON.stringify({ registration_data: oldData }),
                JSON.stringify({ registration_data: updatedData, diff }),
                `Direct correction of: ${Object.keys(diff).join(', ')}`
            ]);

            await connection.commit();
            return { success: true, diff };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * BHW Dashboard Stats
     */
    async getBhwStats(userId) {
        const query = `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'DRAFT') as drafts,
                COUNT(*) FILTER (WHERE status = 'PENDING_VALIDATION') as pending,
                COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
                COUNT(*) FILTER (WHERE status = 'NEEDS_CORRECTION') as needs_correction
            FROM infant_registrations
            WHERE created_by = ?
        `;
        const [rows] = await this.db.execute(query, [userId]);
        return rows[0];
    }

    /**
     * BHW My Submissions: Enhanced with infant name extraction
     */
    async getMySubmissions(userId) {
        const query = `
            SELECT 
                id, 
                reference_id, 
                status, 
                correction_cycle_count, 
                correction_notes,
                created_at, 
                updated_at, 
                barangay,
                registration_data->>'first_name' as first_name,
                registration_data->>'last_name' as last_name,
                registration_data->>'dob' as dob,
                registration_data->>'sex' as sex
            FROM infant_registrations
            WHERE created_by = ?
            ORDER BY updated_at DESC
        `;
        const [rows] = await this.db.execute(query, [userId]);
        return rows;
    }

    async getRegistrationById(registrationId, actor) {
        const [rows] = await this.db.execute(`
            SELECT *
            FROM infant_registrations
            WHERE id = ?
        `, [registrationId]);

        if (rows.length === 0) {
            throw this._httpError('Registration not found', 404);
        }

        const reg = rows[0];
        if (actor.role === ROLES.BHW && reg.created_by !== actor.id) {
            throw this._httpError('Registration not found', 404);
        }

        if (!this._canAccessBarangay(actor, reg.barangay)) {
            throw this._httpError('Registration not found', 404);
        }

        return {
            ...reg,
            registration_data: typeof reg.registration_data === 'string'
                ? JSON.parse(reg.registration_data)
                : reg.registration_data
        };
    }

    _generateReferenceId() {
        const year = new Date().getFullYear();
        const random = Math.floor(1000 + Math.random() * 9000);
        return `REG-${year}-${random}`;
    }

    _actor(actorOrUserId, legacyRole) {
        if (actorOrUserId && typeof actorOrUserId === 'object') {
            return {
                id: actorOrUserId.id,
                role: actorOrUserId.role,
                assigned_barangay: this._normalizeBarangay(actorOrUserId.assigned_barangay),
                assigned_barangays: (actorOrUserId.assigned_barangays || [])
                    .map((barangay) => this._normalizeBarangay(barangay))
                    .filter(Boolean)
            };
        }

        return {
            id: actorOrUserId,
            role: legacyRole,
            assigned_barangay: null,
            assigned_barangays: []
        };
    }

    _normalizeBarangay(barangay) {
        if (barangay === undefined || barangay === null) return null;
        const value = barangay.toString().trim();
        return value || null;
    }

    _normalizeBhwSaveStatus(status) {
        const value = status || REGISTRATION_STATUS.DRAFT;
        const normalized = value.toString().trim().toUpperCase().replace(/\s+/g, '_');

        if (normalized === 'PENDING' || normalized === REGISTRATION_STATUS.PENDING_VALIDATION) {
            return REGISTRATION_STATUS.PENDING_VALIDATION;
        }

        if (normalized === REGISTRATION_STATUS.DRAFT) {
            return REGISTRATION_STATUS.DRAFT;
        }

        throw this._httpError('BHWs may only save DRAFT registrations or submit PENDING_VALIDATION registrations.', 400);
    }

    _parseHistory(history) {
        if (Array.isArray(history)) return history;
        if (!history) return [];

        try {
            const parsed = typeof history === 'string' ? JSON.parse(history) : history;
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    _requireRole(actor, allowedRoles, message) {
        if (!actor?.id || !allowedRoles.includes(actor.role)) {
            throw this._httpError(message || 'Forbidden', 403);
        }
    }

    _canAccessBarangay(actor, barangay) {
        if (!actor || actor.role === ROLES.SUPER_ADMIN) return true;
        const normalized = this._normalizeBarangay(barangay);
        const assignments = new Set((actor.assigned_barangays || [])
            .map((value) => this._normalizeBarangay(value)?.toLowerCase())
            .filter(Boolean));

        if (actor.assigned_barangay) {
            assignments.add(actor.assigned_barangay.toLowerCase());
        }

        return normalized ? assignments.has(normalized.toLowerCase()) : false;
    }

    async _getRegistrationForActor(connection, registrationId, actor, lock = false) {
        const [rows] = await connection.execute(
            `SELECT * FROM infant_registrations WHERE id = ?${lock ? ' FOR UPDATE' : ''}`,
            [registrationId]
        );

        if (rows.length === 0) {
            throw this._httpError('Registration not found', 404);
        }

        const reg = rows[0];
        if (!this._canAccessBarangay(actor, reg.barangay)) {
            throw this._httpError('Registration not found', 404);
        }

        return reg;
    }

    _httpError(message, status) {
        const error = new Error(message);
        error.status = status;
        return error;
    }
}

module.exports = InfantRegistrationService;
