const { v4: uuidv4 } = require('uuid');
const NIPScheduleService = require('./NIPScheduleService');
const VaccinationService = require('./VaccinationService');
const NotificationService = require('./NotificationService');
const { ROLES, REGISTRATION_STATUS } = require('../constants/domain');
const { buildVaccinationReportFields } = require('../utils/vaccinationReporting');
const { safeRecordAuditEvent } = require('../utils/auditLedger');

class InfantRegistrationService {
    constructor(db) {
        this.db = db;
        this.nipScheduleService = new NIPScheduleService(db);
        this.vaccinationService = new VaccinationService(db);
        this.notificationService = new NotificationService(db);
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

        const payload = { ...data };
        const allowDuplicateOverride = this._isTruthy(payload.override_duplicate);
        delete payload.override_duplicate;
        payload.has_no_middle_name = this._normalizeNoMiddleName(payload.has_no_middle_name);
        if (payload.has_no_middle_name) {
            payload.middle_name = '';
        }

        const id = data.id || uuidv4();
        const reference_id = data.reference_id || this._generateReferenceId();
        let existingRegistration = null;
        if (data.id) {
            const [existingRows] = await this.db.execute(
                'SELECT * FROM infant_registrations WHERE id = ? LIMIT 1',
                [data.id]
            );
            existingRegistration = existingRows[0] || null;
        }

        const rawStatus = payload.status ?? payload.registration_status;
        const status = this._normalizeBhwSaveStatus(rawStatus ?? REGISTRATION_STATUS.PENDING_VALIDATION);
        if (status === REGISTRATION_STATUS.DRAFT) {
            this._validateDraftSavePayload(payload);
        } else {
            this._validateSaveRegistrationPayload(payload);
            payload.correction_notes = null;
        }
        if (payload.sex !== undefined && payload.sex !== null && String(payload.sex).trim() !== '') {
            payload.sex = this._normalizeSex(payload.sex);
        } else if (status === REGISTRATION_STATUS.PENDING_VALIDATION) {
            payload.sex = this._normalizeSex(payload.sex);
        } else {
            payload.sex = '';
        }

        // Explicitly trim and normalize the barangay string
        const trimmedBarangay = this._normalizeBarangay(actor.assigned_barangay || payload.barangay);
        if (!trimmedBarangay || !this._canAccessBarangay(actor, trimmedBarangay)) {
            throw this._httpError('Forbidden: Registration is outside your barangay scope.', 403);
        }
        payload.barangay = trimmedBarangay;

        const duplicateResult = await this._findDuplicateIdentitySignals(payload, actor, id);
        const reviewAlert = this._buildDuplicateReviewAlert(duplicateResult);
        if (reviewAlert && !allowDuplicateOverride && ['STRICT_DUPLICATE', 'PROBABLE_DUPLICATE'].includes(reviewAlert.status)) {
            throw this._duplicateConflictError(reviewAlert);
        }
        payload.duplicate_alert = reviewAlert;
        if (reviewAlert?.status === 'TRANSFER_POSSIBLE') {
            const transferInquiryNotes = String(
                payload.transfer_inquiry_notes
                || payload.override_reason
                || payload.duplicate_resolution?.notes
                || ''
            ).trim();

            if (status === REGISTRATION_STATUS.PENDING_VALIDATION && !transferInquiryNotes) {
                throw this._httpError('Transfer inquiry notes are required before submitting a cross-barangay match for Midwife review.', 400);
            }

            payload.transfer_inquiry_notes = transferInquiryNotes || null;
            payload.override_reason = transferInquiryNotes || null;
            payload.duplicate_resolution = {
                ...(payload.duplicate_resolution && typeof payload.duplicate_resolution === 'object' ? payload.duplicate_resolution : {}),
                disposition: 'TRANSFER_INQUIRY_SUBMITTED',
                resolved: false,
                signature: reviewAlert.signature || null,
                inquiry_barangay: reviewAlert.barangay || null,
                submitted_by: actor.id,
                submitted_at: new Date().toISOString(),
                notes: transferInquiryNotes || null
            };
        } else if (!payload.duplicate_alert) {
            payload.duplicate_resolution = null;
            payload.transfer_inquiry_notes = null;
            payload.override_reason = null;
        }
        payload.is_duplicate = duplicateResult.strictMatches.length > 0 || duplicateResult.probableMatches.length > 0;

        const query = `
            INSERT INTO infant_registrations 
            (id, reference_id, registration_data, status, barangay, has_no_middle_name, created_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                registration_data = EXCLUDED.registration_data,
                status = EXCLUDED.status,
                barangay = EXCLUDED.barangay,
                has_no_middle_name = EXCLUDED.has_no_middle_name,
                correction_notes = CASE WHEN EXCLUDED.status = 'PENDING_VALIDATION' THEN NULL ELSE infant_registrations.correction_notes END,
                updated_at = CURRENT_TIMESTAMP
            WHERE infant_registrations.status IN ('DRAFT', 'NEEDS_CORRECTION')
              AND infant_registrations.created_by = ?
              AND TRIM(infant_registrations.barangay) = ?
        `;

        const [result] = await this.db.execute(query, [
            id, 
            reference_id, 
            JSON.stringify(payload), 
            status, 
            trimmedBarangay, 
            payload.has_no_middle_name,
            actor.id,
            actor.id,
            trimmedBarangay
        ]);

        if (result.affectedRows === 0 && data.id) {
            throw new Error('Record is locked for validation or access denied.');
        }

            await safeRecordAuditEvent({
                actor,
                action: existingRegistration
                    ? (status === REGISTRATION_STATUS.PENDING_VALIDATION ? 'REGISTRATION_SUBMIT' : 'REGISTRATION_UPDATE')
                    : (status === REGISTRATION_STATUS.PENDING_VALIDATION ? 'REGISTRATION_SUBMIT' : 'REGISTRATION_CREATE_DRAFT'),
                targetEntity: 'infant_registrations',
                targetRecordId: id,
                targetName: this._registrationTargetName(payload),
                barangay: trimmedBarangay,
                oldValues: existingRegistration || {},
                newValues: {
                    id,
                    reference_id,
                    registration_data: payload,
                    status,
                    barangay: trimmedBarangay
                },
                metadata: status === REGISTRATION_STATUS.PENDING_VALIDATION
                    ? {
                        duplicate_alert_status: payload.duplicate_alert?.status || null,
                        transfer_inquiry_notes: payload.transfer_inquiry_notes || payload.override_reason || null,
                        duplicate_resolution: payload.duplicate_resolution || null
                    }
                    : {}
            });

        return {
            id,
            reference_id,
            status,
            duplicate_alert: payload.duplicate_alert || null
        };
    }

    _validateDraftSavePayload(data) {
        const firstName = typeof data?.first_name === 'string' ? data.first_name.trim() : '';
        const hasNoMiddleName = this._normalizeNoMiddleName(data?.has_no_middle_name);
        const middleName = typeof data?.middle_name === 'string' ? data.middle_name.trim() : '';
        const lastName = typeof data?.last_name === 'string' ? data.last_name.trim() : '';
        const sex = typeof data?.sex === 'string' ? data.sex.trim().toUpperCase() : '';

        if (!firstName || !lastName || !sex || (!hasNoMiddleName && !middleName)) {
            throw this._httpError("Infant's first name, last name, and sex are required to save a draft. Provide a middle name or explicitly mark 'No Middle Name'.", 400);
        }
    }

    _normalizeDuplicateText(value) {
        return String(value || '').trim().toLowerCase();
    }

    _normalizeNoMiddleName(value) {
        return value === true || String(value || '').trim().toLowerCase() === 'true';
    }

    _isTruthy(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            return ['true', '1', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
        }
        return false;
    }

    _duplicateConflictError(alert) {
        const duplicateStatus = String(alert?.status || 'STRICT_DUPLICATE').toUpperCase();
        const isProbable = duplicateStatus === 'PROBABLE_DUPLICATE';
        const error = this._httpError(
            isProbable
                ? 'A similar patient record already exists in this barangay.'
                : 'A potential duplicate record exists.',
            409
        );
        error.error_code = isProbable ? 'PROBABLE_DUPLICATE_DETECTED' : 'DUPLICATE_DETECTED';
        error.duplicate_tier = duplicateStatus;
        error.matches = alert?.matches || [];
        error.duplicate_alert = alert || null;
        return error;
    }

    _buildDuplicateReviewAlert(result = {}) {
        const strictMatches = Array.isArray(result.strictMatches) ? result.strictMatches : [];
        const probableMatches = Array.isArray(result.probableMatches) ? result.probableMatches : [];
        const crossBarangayAlert = result.crossBarangayAlert || null;

        if (strictMatches.length > 0) {
            return {
                status: 'STRICT_DUPLICATE',
                message: 'An existing record matches this infant identity in the same barangay.',
                matches: strictMatches,
                signature: this._duplicateAlertSignature('STRICT_DUPLICATE', strictMatches)
            };
        }

        if (probableMatches.length > 0) {
            return {
                status: 'PROBABLE_DUPLICATE',
                message: 'Similar infant records already exist in this barangay. Review before proceeding.',
                matches: probableMatches,
                signature: this._duplicateAlertSignature('PROBABLE_DUPLICATE', probableMatches)
            };
        }

        if (crossBarangayAlert) {
            return {
                ...crossBarangayAlert,
                signature: this._duplicateAlertSignature('TRANSFER_POSSIBLE', [crossBarangayAlert])
            };
        }

        return null;
    }

    _duplicateAlertSignature(type, matches = []) {
        const signatureSource = [String(type || '').toUpperCase(), ...(matches || []).map((match) => {
            const referenceKey = match.promoted_infant_id || match.reference_id || match.id || 'unknown';
            return `${referenceKey}:${this._normalizeDuplicateText(match.barangay)}`;
        })]
            .filter(Boolean)
            .sort()
            .join('|');

        return signatureSource || null;
    }

    _fullIdentityName(row = {}) {
        return [row.first_name, row.has_no_middle_name ? '' : row.middle_name, row.last_name]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(' ');
    }

    async _findDuplicateIdentitySignals(data, actor, excludeRegistrationId = null) {
        const firstName = this._normalizeDuplicateText(data?.first_name);
        const hasNoMiddleName = this._normalizeNoMiddleName(data?.has_no_middle_name);
        const middleName = hasNoMiddleName ? '' : this._normalizeDuplicateText(data?.middle_name);
        const lastName = this._normalizeDuplicateText(data?.last_name);
        const dob = String(data?.dob || '').trim();
        const barangay = this._normalizeDuplicateText(actor?.assigned_barangay || data?.barangay);

        if (!firstName || !lastName || !dob || !barangay || (!hasNoMiddleName && !middleName)) {
            return { strictMatches: [], crossBarangayAlert: null, allMatches: [] };
        }

        const registrationParams = [firstName, lastName, hasNoMiddleName, hasNoMiddleName, middleName, dob];
        const registrationExcludeClause = excludeRegistrationId ? ' AND ir.id <> ?' : '';
        if (excludeRegistrationId) registrationParams.push(excludeRegistrationId);

        const registrationDuplicateSql = `
            SELECT
                ir.id,
                ir.reference_id,
                ir.status,
                ir.barangay,
                ir.created_at,
                ir.registration_data->>'first_name' AS first_name,
                COALESCE(ir.has_no_middle_name, FALSE) AS has_no_middle_name,
                ir.registration_data->>'middle_name' AS middle_name,
                ir.registration_data->>'last_name' AS last_name,
                ir.registration_data->>'dob' AS dob,
                ir.registration_data->>'sex' AS sex,
                ir.promoted_infant_id,
                'REGISTRATION' AS source_table
            FROM infant_registrations ir
            WHERE LOWER(TRIM(COALESCE(ir.registration_data->>'first_name', ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND LOWER(TRIM(COALESCE(ir.registration_data->>'last_name', ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND COALESCE(ir.has_no_middle_name, FALSE) = ?
              AND (? = TRUE OR LOWER(TRIM(COALESCE(ir.registration_data->>'middle_name', ''))) = LOWER(TRIM(COALESCE(?, ''))))
              AND TRIM(COALESCE(ir.registration_data->>'dob', '')) = TRIM(COALESCE(?, ''))
              AND UPPER(TRIM(COALESCE(ir.status, ''))) <> 'REJECTED'
              ${registrationExcludeClause}
            ORDER BY ir.created_at DESC
            LIMIT 10
        `;

        const registrationProbableSql = `
            SELECT
                ir.id,
                ir.reference_id,
                ir.status,
                ir.barangay,
                ir.created_at,
                ir.registration_data->>'first_name' AS first_name,
                COALESCE(ir.has_no_middle_name, FALSE) AS has_no_middle_name,
                ir.registration_data->>'middle_name' AS middle_name,
                ir.registration_data->>'last_name' AS last_name,
                ir.registration_data->>'dob' AS dob,
                ir.registration_data->>'sex' AS sex,
                ir.promoted_infant_id,
                'REGISTRATION' AS source_table
            FROM infant_registrations ir
            WHERE LOWER(TRIM(COALESCE(ir.registration_data->>'first_name', ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND LOWER(TRIM(COALESCE(ir.registration_data->>'last_name', ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND LOWER(TRIM(COALESCE(ir.barangay, ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND UPPER(TRIM(COALESCE(ir.status, ''))) <> 'REJECTED'
              AND NOT (
                  TRIM(COALESCE(ir.registration_data->>'dob', '')) = TRIM(COALESCE(?, ''))
                  AND COALESCE(ir.has_no_middle_name, FALSE) = ?
                  AND (? = TRUE OR LOWER(TRIM(COALESCE(ir.registration_data->>'middle_name', ''))) = LOWER(TRIM(COALESCE(?, ''))))
              )
              ${registrationExcludeClause}
            ORDER BY ir.created_at DESC
            LIMIT 10
        `;

        const infantDuplicateSql = `
            SELECT
                i.id,
                i.reference_id,
                i.status,
                i.barangay,
                i.created_at,
                i.first_name,
                COALESCE(i.has_no_middle_name, FALSE) AS has_no_middle_name,
                i.middle_name,
                i.last_name,
                i.dob,
                i.sex,
                'INFANT' AS source_table
            FROM infants i
            WHERE LOWER(TRIM(COALESCE(i.first_name, ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND LOWER(TRIM(COALESCE(i.last_name, ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND COALESCE(i.has_no_middle_name, FALSE) = ?
              AND (? = TRUE OR LOWER(TRIM(COALESCE(i.middle_name, ''))) = LOWER(TRIM(COALESCE(?, ''))))
              AND TRIM(COALESCE(i.dob::text, '')) = TRIM(COALESCE(?, ''))
            ORDER BY i.created_at DESC
            LIMIT 10
        `;

        const infantProbableSql = `
            SELECT
                i.id,
                i.reference_id,
                i.status,
                i.barangay,
                i.created_at,
                i.first_name,
                COALESCE(i.has_no_middle_name, FALSE) AS has_no_middle_name,
                i.middle_name,
                i.last_name,
                i.dob,
                i.sex,
                'INFANT' AS source_table
            FROM infants i
            WHERE LOWER(TRIM(COALESCE(i.first_name, ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND LOWER(TRIM(COALESCE(i.last_name, ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND LOWER(TRIM(COALESCE(i.barangay, ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND NOT (
                  TRIM(COALESCE(i.dob::text, '')) = TRIM(COALESCE(?, ''))
                  AND COALESCE(i.has_no_middle_name, FALSE) = ?
                  AND (? = TRUE OR LOWER(TRIM(COALESCE(i.middle_name, ''))) = LOWER(TRIM(COALESCE(?, ''))))
              )
            ORDER BY i.created_at DESC
            LIMIT 10
        `;

        const crossBarangayRegistrationSql = `
            SELECT
                ir.id,
                ir.reference_id,
                ir.status,
                ir.barangay,
                ir.created_at,
                ir.registration_data->>'first_name' AS first_name,
                COALESCE(ir.has_no_middle_name, FALSE) AS has_no_middle_name,
                ir.registration_data->>'middle_name' AS middle_name,
                ir.registration_data->>'last_name' AS last_name,
                ir.registration_data->>'dob' AS dob,
                ir.registration_data->>'sex' AS sex,
                ir.promoted_infant_id,
                'REGISTRATION' AS source_table
            FROM infant_registrations ir
            WHERE LOWER(TRIM(COALESCE(ir.registration_data->>'first_name', ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND LOWER(TRIM(COALESCE(ir.registration_data->>'last_name', ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND TRIM(COALESCE(ir.registration_data->>'dob', '')) = TRIM(COALESCE(?, ''))
              AND LOWER(TRIM(COALESCE(ir.barangay, ''))) <> LOWER(TRIM(COALESCE(?, '')))
              AND UPPER(TRIM(COALESCE(ir.status, ''))) <> 'REJECTED'
              ${registrationExcludeClause}
            ORDER BY ir.created_at DESC
            LIMIT 10
        `;

        const crossBarangayInfantSql = `
            SELECT
                i.id,
                i.reference_id,
                i.status,
                i.barangay,
                i.created_at,
                i.first_name,
                COALESCE(i.has_no_middle_name, FALSE) AS has_no_middle_name,
                i.middle_name,
                i.last_name,
                i.dob,
                i.sex,
                'INFANT' AS source_table
            FROM infants i
            WHERE LOWER(TRIM(COALESCE(i.first_name, ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND LOWER(TRIM(COALESCE(i.last_name, ''))) = LOWER(TRIM(COALESCE(?, '')))
              AND TRIM(COALESCE(i.dob::text, '')) = TRIM(COALESCE(?, ''))
              AND LOWER(TRIM(COALESCE(i.barangay, ''))) <> LOWER(TRIM(COALESCE(?, '')))
            ORDER BY i.created_at DESC
            LIMIT 10
        `;

        const probableRegistrationParams = [firstName, lastName, actor?.assigned_barangay || data?.barangay || '', dob, hasNoMiddleName, hasNoMiddleName, middleName];
        if (excludeRegistrationId) probableRegistrationParams.push(excludeRegistrationId);
        const probableInfantParams = [firstName, lastName, actor?.assigned_barangay || data?.barangay || '', dob, hasNoMiddleName, hasNoMiddleName, middleName];
        const crossBarangayRegistrationParams = [firstName, lastName, dob, actor?.assigned_barangay || data?.barangay || ''];
        if (excludeRegistrationId) crossBarangayRegistrationParams.push(excludeRegistrationId);
        const crossBarangayInfantParams = [firstName, lastName, dob, actor?.assigned_barangay || data?.barangay || ''];

        console.log('[DUPLICATE_IDENTITY_CHECK]', {
            query_scope: 'INFANT_REGISTRATION',
            normalized_identity: {
                first_name: firstName,
                has_no_middle_name: hasNoMiddleName,
                middle_name: middleName,
                last_name: lastName,
                dob,
                barangay
            },
            registration_sql: registrationDuplicateSql,
            registration_params: registrationParams,
            infant_sql: infantDuplicateSql,
            infant_params: [firstName, lastName, hasNoMiddleName, hasNoMiddleName, middleName, dob],
            registration_probable_sql: registrationProbableSql,
            registration_probable_params: probableRegistrationParams,
            infant_probable_sql: infantProbableSql,
            infant_probable_params: probableInfantParams,
            cross_barangay_registration_sql: crossBarangayRegistrationSql,
            cross_barangay_registration_params: crossBarangayRegistrationParams,
            cross_barangay_infant_sql: crossBarangayInfantSql,
            cross_barangay_infant_params: crossBarangayInfantParams
        });

        const [registrationRows] = await this.db.execute(registrationDuplicateSql, registrationParams);
        const [infantRows] = await this.db.execute(infantDuplicateSql, [firstName, lastName, hasNoMiddleName, hasNoMiddleName, middleName, dob]);
        const [probableRegistrationRows] = await this.db.execute(registrationProbableSql, probableRegistrationParams);
        const [probableInfantRows] = await this.db.execute(infantProbableSql, probableInfantParams);
        const [crossBarangayRegistrationRows] = await this.db.execute(crossBarangayRegistrationSql, crossBarangayRegistrationParams);
        const [crossBarangayInfantRows] = await this.db.execute(crossBarangayInfantSql, crossBarangayInfantParams);

        const matches = [...(Array.isArray(registrationRows) ? registrationRows : []), ...(Array.isArray(infantRows) ? infantRows : [])]
            .filter(Boolean)
            .map((row) => ({
                id: row.id,
                reference_id: row.reference_id || null,
                status: row.status || null,
                barangay: row.barangay || null,
                created_at: row.created_at || null,
                first_name: row.first_name || null,
                has_no_middle_name: this._normalizeNoMiddleName(row.has_no_middle_name),
                middle_name: row.middle_name || null,
                last_name: row.last_name || null,
                dob: row.dob || null,
                sex: row.sex || null,
                promoted_infant_id: row.promoted_infant_id || null,
                source_table: row.source_table || 'REGISTRATION',
                match_type: 'EXACT'
            }));

        const strictMatches = matches.filter((row) => this._normalizeDuplicateText(row.barangay) === barangay);
        const crossBarangayMatches = [...(Array.isArray(crossBarangayRegistrationRows) ? crossBarangayRegistrationRows : []), ...(Array.isArray(crossBarangayInfantRows) ? crossBarangayInfantRows : [])]
            .filter(Boolean)
            .map((row) => ({
                id: row.id,
                reference_id: row.reference_id || null,
                status: row.status || null,
                barangay: row.barangay || null,
                created_at: row.created_at || null,
                first_name: row.first_name || null,
                has_no_middle_name: this._normalizeNoMiddleName(row.has_no_middle_name),
                middle_name: row.middle_name || null,
                last_name: row.last_name || null,
                dob: row.dob || null,
                sex: row.sex || null,
                promoted_infant_id: row.promoted_infant_id || null,
                source_table: row.source_table || 'REGISTRATION',
                match_type: 'TRANSFER_INQUIRY'
            }))
            .filter((row, index, source) => source.findIndex((candidate) => `${candidate.source_table}:${candidate.id}` === `${row.source_table}:${row.id}`) === index);
        const crossBarangayMatch = crossBarangayMatches[0] || matches.find((row) => this._normalizeDuplicateText(row.barangay) !== barangay) || null;
        const probableMatches = [...(Array.isArray(probableRegistrationRows) ? probableRegistrationRows : []), ...(Array.isArray(probableInfantRows) ? probableInfantRows : [])]
            .filter(Boolean)
            .map((row) => ({
                id: row.id,
                reference_id: row.reference_id || null,
                status: row.status || null,
                barangay: row.barangay || null,
                created_at: row.created_at || null,
                first_name: row.first_name || null,
                has_no_middle_name: this._normalizeNoMiddleName(row.has_no_middle_name),
                middle_name: row.middle_name || null,
                last_name: row.last_name || null,
                dob: row.dob || null,
                sex: row.sex || null,
                promoted_infant_id: row.promoted_infant_id || null,
                source_table: row.source_table || 'REGISTRATION',
                match_type: 'PROBABLE'
            }))
            .filter((row, index, source) => source.findIndex((candidate) => `${candidate.source_table}:${candidate.id}` === `${row.source_table}:${row.id}`) === index);

        return {
            strictMatches,
            probableMatches,
            crossBarangayAlert: crossBarangayMatch
                ? {
                    status: 'TRANSFER_POSSIBLE',
                    barangay: crossBarangayMatch.barangay || null,
                    source_table: crossBarangayMatch.source_table,
                    source_record_id: crossBarangayMatch.id,
                    reference_id: crossBarangayMatch.reference_id || null,
                    full_name: this._fullIdentityName(crossBarangayMatch)
                }
                : null,
            allMatches: [...matches, ...probableMatches, ...crossBarangayMatches]
        };
    }

    async deleteDraftRegistration(registrationId, actorOrUserId, legacyRole) {
        const actor = this._actor(actorOrUserId, legacyRole);
        this._requireRole(actor, [ROLES.BHW], 'Only BHWs can delete draft registrations.');

        if (!registrationId) {
            throw this._httpError('Registration ID is required.', 400);
        }

        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            const reg = await this._getRegistrationForActor(connection, registrationId, actor, true);
            if ((reg.status || '').toUpperCase() !== REGISTRATION_STATUS.DRAFT) {
                throw this._httpError('Only drafts can be deleted. Submitted records are permanently retained.', 403);
            }

            if (reg.created_by && reg.created_by !== actor.id) {
                throw this._httpError('Only drafts created by your account can be deleted.', 403);
            }

            await safeRecordAuditEvent({
                actor,
                action: 'REGISTRATION_DELETE_DRAFT',
                targetEntity: 'infant_registrations',
                targetRecordId: registrationId,
                targetName: this._registrationTargetName(reg.registration_data || reg),
                barangay: reg.barangay,
                oldValues: reg,
                newValues: null
            });

            await connection.execute('DELETE FROM infant_registrations WHERE id = ?', [registrationId]);
            await connection.commit();
            return { success: true, message: 'Draft discarded successfully' };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release?.();
        }
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
            query += ' AND UPPER(TRIM(ir.barangay)) = UPPER(TRIM(?))';
            params.push(normalizedBarangay);
        }

        query += ' ORDER BY ir.created_at ASC';
        
        const [rows] = await this.db.execute(query, params);
        return rows.map(row => {
            const data = typeof row.registration_data === 'string' 
                ? JSON.parse(row.registration_data) 
                : row.registration_data;
            
            return {
                ...data,
                id: row.id,
                reference_id: row.reference_id,
                status: row.status,
                registration_status: row.status,
                has_no_middle_name: this._normalizeNoMiddleName(row.has_no_middle_name ?? data.has_no_middle_name),
                correction_notes: row.correction_notes,
                barangay: row.barangay,
                created_by: row.created_by,
                promoted_infant_id: row.promoted_infant_id,
                correction_cycle_count: row.correction_cycle_count,
                review_history: row.review_history,
                created_at: row.created_at,
                updated_at: row.updated_at,
                submitted_by_name: row.submitted_by_name
            };
        });
    }

    async getValidationDetail(registrationId, actor = null) {
        this._requireRole(actor, [ROLES.MIDWIFE, ROLES.ADMIN, ROLES.SUPER_ADMIN], 'Only clinical reviewers can view validation details.');

        const [rows] = await this.db.execute(`
            SELECT
                ir.*,
                creator.full_name AS submitted_by_name,
                creator.role AS submitted_by_role,
                reviewer.full_name AS reviewed_by_name,
                reviewer.role AS reviewed_by_role
            FROM infant_registrations ir
            LEFT JOIN users creator ON creator.id = ir.created_by
            LEFT JOIN users reviewer ON reviewer.id = ir.reviewed_by
            WHERE ir.id = ?
            LIMIT 1
        `, [registrationId]);

        if (rows.length === 0) {
            throw this._httpError('Registration not found', 404);
        }

        const row = rows[0];
        if (!this._canAccessBarangay(actor, row.barangay)) {
            throw this._httpError('Registration not found', 404);
        }

        const data = typeof row.registration_data === 'string'
            ? JSON.parse(row.registration_data || '{}')
            : (row.registration_data || {});
        const legacyHistory = await this._enrichReviewHistory(this._parseHistory(row.review_history));
        const timelineEvents = await this._getValidationEvents(registrationId);
        const correctionHistory = timelineEvents.length > 0
            ? timelineEvents
            : legacyHistory.filter((item) => (
                String(item.action || '').toUpperCase().includes('CORRECTION')
                || String(item.action || '').toUpperCase().includes('REJECT')
                || item.correction_notes
                || item.rejection_reason
                || item.notes
            ));

        const registration = {
            ...data,
            id: row.id,
            reference_id: row.reference_id,
            status: row.status,
            registration_status: row.status,
            has_no_middle_name: this._normalizeNoMiddleName(row.has_no_middle_name ?? data.has_no_middle_name),
            barangay: row.barangay,
            created_by: row.created_by,
            reviewed_by: row.reviewed_by,
            submitted_by_name: row.submitted_by_name,
            submitted_by_role: row.submitted_by_role,
            reviewed_by_name: row.reviewed_by_name,
            reviewed_by_role: row.reviewed_by_role,
            rejection_reason: row.rejection_reason,
            rejection_notes: row.rejection_notes,
            correction_notes: row.correction_notes,
            correction_cycle_count: row.correction_cycle_count,
            promoted_infant_id: row.promoted_infant_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
            reviewed_at: row.reviewed_at,
            transfer_inquiry_notes: this._normalizeTransferInquiryNotes(data)
        };

        return {
            success: true,
            registration,
            infant_demographics: {
                first_name: data.first_name,
                has_no_middle_name: this._normalizeNoMiddleName(row.has_no_middle_name ?? data.has_no_middle_name),
                middle_name: data.middle_name,
                last_name: data.last_name,
                suffix: data.suffix,
                sex: data.sex,
                dob: data.dob,
                birth_weight: data.birth_weight,
                birth_weight_kg: data.birth_weight_kg,
                length_at_birth_cm: data.length_at_birth_cm,
                birth_status: data.birth_status,
                birth_setting: data.birth_setting
            },
            caregiver_profile: {
                mothers_maiden_name: data.mothers_maiden_name || data.mother_name,
                mother_name: data.mother_name || data.mothers_maiden_name,
                father_name: data.father_name || data.fathers_name,
                caregiver_name: data.caregiver_name || data.mothers_maiden_name || data.mother_name,
                caregiver_relationship: data.caregiver_relationship || 'Mother',
                caregiver_phone: data.caregiver_phone || data.contact_number,
                contact_number: data.contact_number || data.caregiver_phone,
                mother_tt_status: data.mother_tt_status,
                last_tt_date: data.last_tt_date,
                cpab_status: data.cpab_status
            },
            address_profile: {
                barangay: row.barangay || data.barangay,
                purok: data.purok,
                locality: data.locality,
                exact_address: data.exact_address,
                landmark: data.landmark
            },
            at_birth_immunizations: {
                bcg_status: data.bcg_status,
                bcg_date: data.bcg_date || data.bcg_date_given,
                hepatitis_b_status: data.hepatitis_b_status || data.hepa_b_status,
                hepatitis_b_date: data.hepatitis_b_date || data.hepa_b_date || data.hepa_b_date_given,
                initiated_breastfeeding: data.initiated_breastfeeding || data.breastfed_immediately_after_birth,
                at_birth_doses: Array.isArray(data.at_birth_doses) ? data.at_birth_doses : []
            },
            duplicate_review_context: {
                transfer_inquiry_notes: this._normalizeTransferInquiryNotes(data),
                duplicate_alert: data.duplicate_alert || null,
                duplicate_resolution: data.duplicate_resolution || null
            },
            correction_history: correctionHistory,
            review_history: legacyHistory
        };
    }

    /**
     * Duplicate Check: Multi-factor detection
     */
    async checkDuplicates(data, actor = null) {
        const actorContext = this._actor(actor);
        const result = await this._findDuplicateIdentitySignals(data || {}, actorContext || {}, data?.id || null);
        if (result.strictMatches.length > 0) {
            return this._shapeDuplicateCheckResponseForActor({
                type: 'STRICT_DUPLICATE',
                matches: result.strictMatches,
                duplicate_alert: this._buildDuplicateReviewAlert(result)
            }, actorContext);
        }

        if (result.probableMatches.length > 0) {
            return this._shapeDuplicateCheckResponseForActor({
                type: 'PROBABLE_DUPLICATE',
                matches: result.probableMatches,
                duplicate_alert: this._buildDuplicateReviewAlert(result)
            }, actorContext);
        }

        if (result.crossBarangayAlert) {
            return this._shapeDuplicateCheckResponseForActor({
                type: 'TRANSFER_POSSIBLE',
                matches: result.allMatches,
                duplicate_alert: result.crossBarangayAlert
            }, actorContext);
        }

        return {
            type: null,
            matches: [],
            duplicate_alert: null
        };
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
        this._requireRole(actor, [ROLES.MIDWIFE], 'Clinical validation actions are restricted to Midwife roles.');

        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Fetch registration
            const reg = await this._getRegistrationForActor(connection, registrationId, actor, true);
            const data = typeof reg.registration_data === 'string' ? JSON.parse(reg.registration_data) : reg.registration_data;

            if (reg.status !== REGISTRATION_STATUS.PENDING_VALIDATION) {
                throw new Error(`Forbidden: Cannot approve from ${reg.status}. Registration must be PENDING_VALIDATION.`);
            }

            const duplicateResult = await this._findDuplicateIdentitySignals({
                ...data,
                barangay: reg.barangay
            }, actor, registrationId);
            const reviewAlert = this._buildDuplicateReviewAlert(duplicateResult);
            const duplicateResolution = data?.duplicate_resolution || null;
            if (reviewAlert) {
                const resolutionMatchesCurrentAlert = duplicateResolution
                    && duplicateResolution.resolved === true
                    && duplicateResolution.signature
                    && duplicateResolution.signature === reviewAlert.signature;

                if (!resolutionMatchesCurrentAlert) {
                    const duplicateError = this._httpError('Duplicate review must be resolved before approval.', 409);
                    duplicateError.error_code = 'DUPLICATE_REVIEW_REQUIRED';
                    duplicateError.duplicate_alert = reviewAlert;
                    throw duplicateError;
                }
            }

            // CLINICAL VALIDATION GUARDRAILS
            // Verify vaccine dates against Date of Birth
            const dob = new Date(data.dob);
            const isGivenStatus = (status) => String(status || '').toUpperCase().includes('GIVEN');
            const classifyBirthDoseStatus = (status, administeredDate, fallbackDate) => {
                if (!isGivenStatus(status)) return status || 'Not Given';
                const normalized = String(status || '');
                if (normalized.toLowerCase().includes('within 24') || normalized.toLowerCase().includes('more than 24')) {
                    return normalized;
                }

                const doseDate = new Date(administeredDate || fallbackDate);
                const birthDate = new Date(fallbackDate);
                const hoursAfterBirth = (doseDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60);
                return hoursAfterBirth >= 0 && hoursAfterBirth <= 24
                    ? 'Given within 24 hours'
                    : 'Given more than 24 hours';
            };

            if (isGivenStatus(data.bcg_status) && data.bcg_date) {
                if (new Date(data.bcg_date) < dob) {
                    throw new Error("Clinical Error: BCG administration date cannot precede the infant's Date of Birth.");
                }
            }
            if (isGivenStatus(data.hepatitis_b_status) && data.hepatitis_b_date) {
                if (new Date(data.hepatitis_b_date) < dob) {
                    throw new Error("Clinical Error: Hepatitis B administration date cannot precede the infant's Date of Birth.");
                }
            }

            // 2. Map data to infants table
            const infantId = uuidv4();
            const referenceId = reg.reference_id;
            const assignedBarangay = this._normalizeBarangay(actor.assigned_barangay);

            if (!assignedBarangay) {
                throw this._httpError('Approving Midwife must have an assigned_barangay.', 400);
            }

            // Build review history for the registration record
            const history = this._parseHistory(reg.review_history);
            history.push({
                reviewer_id: actor.id,
                action: REGISTRATION_STATUS.APPROVED,
                notes: notes,
                barangay: assignedBarangay,
                timestamp: new Date().toISOString()
            });

            const sexValue = this._mapSexToInfantColumn(data.sex);
            const bcgStatusForStorage = classifyBirthDoseStatus(
                data.bcg_status || (data.bcg_given ? 'Given' : null),
                data.bcg_date || data.dob,
                data.dob
            );
            
            const promoQuery = `
                INSERT INTO infants 
                (id, reference_id, first_name, has_no_middle_name, middle_name, last_name, suffix, dob, sex, 
                 birth_weight, place_of_birth, mothers_maiden_name, father_name, caregiver_phone, caregiver_relationship, 
                 purok, barangay, current_address, last_tt_date, pregnancy_order, cpab_status,
                 bcg_date, hepatitis_b_date, birth_setting, mother_tt_status,
                 status, created_by, encoded_by_role, created_at, birth_status,
                 bcg_facility, hepa_b_facility, location, is_location_verified, exact_address,
                 landmark, length_at_birth_cm, initiated_breastfeeding, delivery_facility_name,
                 bcg_status, hepa_b_status, latitude, longitude, approved_registration_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await connection.execute(promoQuery, [
                infantId, referenceId, data.first_name, this._normalizeNoMiddleName(data.has_no_middle_name), this._normalizeNoMiddleName(data.has_no_middle_name) ? null : (data.middle_name || null), data.last_name, data.suffix || null, data.dob, sexValue,
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
                bcgStatusForStorage,
                data.hepatitis_b_status || data.hepa_b_status || 'Not Given',
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
                JSON.stringify({ status: REGISTRATION_STATUS.APPROVED, promoted_infant_id: infantId, barangay: assignedBarangay }),
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

            const atBirthVaccinationIds = [];
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
                const reportFields = buildVaccinationReportFields({
                    vaccine_code: dose.vaccine_code,
                    vaccine_name: dose.vaccine_name,
                    dose_number: dose.dose_number,
                    administered_date: dose.administered_date,
                    dob: data.dob,
                    barangay: data.barangay,
                    report_classification: null
                });
                await connection.execute(`
                    INSERT INTO vaccinations (
                        id, infant_id, schedule_id, vaccine_name, vaccine_code,
                        dose_number, batch_number, site_of_injection,
                        vaccinator_id, vaccinator_name, administered_date,
                        notes, validation_status, is_early_override,
                        report_antigen_code, report_dose_code, report_age_bucket,
                        report_classification, report_period_month, report_period_year,
                        barangay_at_administration,
                        recorded_by, recorded_by_role, recorded_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALIDATED', false, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
                    `${actor.role || 'Midwife'} (Approval)`,
                    dose.administered_date,
                    'Auto-logged at-birth dose upon clinical validation approval.',
                    reportFields.report_antigen_code,
                    reportFields.report_dose_code,
                    reportFields.report_age_bucket,
                    reportFields.report_classification,
                    reportFields.report_period_month,
                    reportFields.report_period_year,
                    reportFields.barangay_at_administration,
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

                atBirthVaccinationIds.push(vaccinationId);
                console.log(`[APPROVE] At-birth dose logged: ${dose.vaccine_code} on ${dose.administered_date} for infant ${infantId}`);
            }

            await connection.commit();
            const cleanReferenceId = referenceId.replace(/\s+/g, '-');
            const targetName = this._registrationTargetName(data);
            await safeRecordAuditEvent({
                actor,
                action: 'REGISTRATION_APPROVE',
                targetEntity: 'infant_registrations',
                targetRecordId: registrationId,
                targetName,
                barangay: assignedBarangay,
                oldValues: reg,
                newValues: {
                    ...reg,
                    status: REGISTRATION_STATUS.APPROVED,
                    promoted_infant_id: infantId
                }
            });
            await safeRecordAuditEvent({
                actor,
                action: 'INFANT_CREATE_APPROVED',
                targetEntity: 'infants',
                targetRecordId: infantId,
                targetName,
                barangay: assignedBarangay,
                oldValues: {},
                newValues: {
                    id: infantId,
                    reference_id: referenceId,
                    barangay: assignedBarangay,
                    registration_data: data
                }
            });
            for (const vaccinationId of atBirthVaccinationIds) {
                await safeRecordAuditEvent({
                    actor,
                    action: 'VACCINATION_RECORD',
                    targetEntity: 'vaccinations',
                    targetRecordId: vaccinationId,
                    targetName,
                    barangay: assignedBarangay,
                    oldValues: {},
                    newValues: {
                        id: vaccinationId,
                        infant_id: infantId
                    },
                    metadata: {
                        source: 'registration_approval_at_birth'
                    }
                });
            }
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
    async rejectRegistration(registrationId, actorOrReviewerId, legacyReasonOrPayload, legacyNotes) {
        const actor = this._actor(
            actorOrReviewerId,
            legacyNotes === undefined && typeof legacyReasonOrPayload !== 'string' ? null : legacyReasonOrPayload
        );
        const payload = typeof legacyReasonOrPayload === 'object' && legacyReasonOrPayload !== null
            ? legacyReasonOrPayload
            : {
                rejection_reason: legacyReasonOrPayload || legacyNotes,
                rejection_notes: legacyNotes
            };
        const rejectionReason = String(payload.rejection_reason || '').trim();
        const rejectionNotes = String(payload.rejection_notes || '').trim();
        this._requireRole(actor, [ROLES.MIDWIFE], 'Clinical validation actions are restricted to Midwife roles.');

        if (!rejectionReason) {
            throw this._httpError('A valid rejection rationale is required to proceed.', 400);
        }

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
                rejection_reason: rejectionReason,
                rejection_notes: rejectionNotes || null,
                timestamp: new Date().toISOString()
            });

            await connection.execute(
                `UPDATE infant_registrations
                 SET status = ?,
                     reviewed_by = ?,
                     reviewed_at = CURRENT_TIMESTAMP,
                     review_history = ?,
                     rejection_reason = ?,
                     rejection_notes = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                ['REJECTED', actor.id, JSON.stringify(history), rejectionReason, rejectionNotes || null, registrationId]
            );

            await this._insertValidationEvent(connection, {
                registrationId,
                eventType: 'REJECTED',
                reviewerUserId: actor.id,
                reason: rejectionReason,
                notes: rejectionNotes || null,
                metadata: {
                    source: 'validation_reject'
                }
            });

            await connection.execute(`
                INSERT INTO audit_trail (id, entity_type, entity_id, action_type, user_id, user_role, old_values, new_values, description)
                VALUES (?, 'infant', ?, 'status_change', ?, ?, ?, ?, ?)
            `, [
                uuidv4(),
                registrationId,
                actor.id,
                actor.role,
                JSON.stringify({ status: reg.status }),
                JSON.stringify({
                    status: REGISTRATION_STATUS.REJECTED,
                    rejection_reason: rejectionReason,
                    rejection_notes: rejectionNotes || null
                }),
                rejectionNotes || rejectionReason
            ]);

            await connection.commit();
            await safeRecordAuditEvent({
                actor,
                action: 'REGISTRATION_REJECT',
                targetEntity: 'infant_registrations',
                targetRecordId: registrationId,
                targetName: this._registrationTargetName(reg),
                barangay: reg.barangay,
                oldValues: reg,
                newValues: {
                    ...reg,
                    status: REGISTRATION_STATUS.REJECTED,
                    reviewed_by: actor.id,
                    rejection_reason: rejectionReason,
                    rejection_notes: rejectionNotes || null
                }
            });
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
    async returnForCorrection(registrationId, actorOrReviewerId, legacyNoteOrPayload, legacyNotes) {
        const actor = this._actor(
            actorOrReviewerId,
            legacyNotes === undefined && typeof legacyNoteOrPayload !== 'string' ? null : legacyNoteOrPayload
        );
        const payload = typeof legacyNoteOrPayload === 'object' && legacyNoteOrPayload !== null
            ? legacyNoteOrPayload
            : { correction_notes: legacyNoteOrPayload };
        const correctionNotes = String(payload.correction_notes || '').trim();
        this._requireRole(actor, [ROLES.MIDWIFE], 'Clinical validation actions are restricted to Midwife roles.');

        if (!correctionNotes) {
            throw this._httpError('correction_notes is required.', 400);
        }

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
                correction_notes: correctionNotes,
                timestamp: new Date().toISOString()
            });

            await connection.execute(`
                UPDATE infant_registrations 
                SET status = 'NEEDS_CORRECTION',
                    correction_cycle_count = correction_cycle_count + 1,
                    reviewed_by = ?,
                    reviewed_at = CURRENT_TIMESTAMP,
                    review_history = ?,
                    correction_notes = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [actor.id, JSON.stringify(history), correctionNotes, registrationId]);

            await this._insertValidationEvent(connection, {
                registrationId,
                eventType: 'RETURNED_FOR_CORRECTION',
                reviewerUserId: actor.id,
                notes: correctionNotes,
                metadata: {
                    source: 'validation_return_for_correction'
                }
            });

            await connection.execute(`
                INSERT INTO audit_trail (id, entity_type, entity_id, action_type, user_id, user_role, old_values, new_values, description)
                VALUES (?, 'infant', ?, 'status_change', ?, ?, ?, ?, ?)
            `, [
                uuidv4(),
                registrationId,
                actor.id,
                actor.role,
                JSON.stringify({ status: reg.status }),
                JSON.stringify({ status: REGISTRATION_STATUS.NEEDS_CORRECTION, correction_notes: correctionNotes }),
                correctionNotes
            ]);

            await connection.commit();
            await safeRecordAuditEvent({
                actor,
                action: 'REGISTRATION_RETURN_FOR_CORRECTION',
                targetEntity: 'infant_registrations',
                targetRecordId: registrationId,
                targetName: this._registrationTargetName(reg),
                barangay: reg.barangay,
                oldValues: reg,
                newValues: {
                    ...reg,
                    status: REGISTRATION_STATUS.NEEDS_CORRECTION,
                    reviewed_by: actor.id,
                    correction_notes: correctionNotes
                }
            });
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
        this._requireRole(actor, [ROLES.MIDWIFE, ROLES.ADMIN, ROLES.SUPER_ADMIN], 'Only Midwives, Admins, and Super Admins can directly correct pending registrations.');

        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            const reg = await this._getRegistrationForActor(connection, registrationId, actor, true);

            if (reg.status !== REGISTRATION_STATUS.PENDING_VALIDATION) {
                throw new Error(`Forbidden: Direct corrections only allowed during PENDING_VALIDATION.`);
            }

            const oldData = typeof reg.registration_data === 'string' ? JSON.parse(reg.registration_data) : reg.registration_data;
            if (Object.prototype.hasOwnProperty.call(updatedData, 'sex')) {
                updatedData.sex = this._normalizeSex(updatedData.sex);
            }
            
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

            await this._insertValidationEvent(connection, {
                registrationId,
                eventType: 'DIRECT_CORRECTION',
                reviewerUserId: actor.id,
                notes: `Direct correction of: ${Object.keys(diff).join(', ')}`,
                metadata: {
                    diff
                }
            });

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
            await safeRecordAuditEvent({
                actor,
                action: 'REGISTRATION_CORRECT',
                targetEntity: 'infant_registrations',
                targetRecordId: registrationId,
                targetName: this._registrationTargetName(updatedData) || this._registrationTargetName(oldData),
                barangay: reg.barangay,
                oldValues: { registration_data: oldData },
                newValues: { registration_data: updatedData, diff }
            });
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
    async getRegistrationStateStats(actor) {
        const isSuperAdmin = actor?.role === ROLES.SUPER_ADMIN;
        const scopedBarangay = (actor?.assigned_barangay || '').trim();

        if (!isSuperAdmin && !scopedBarangay) {
            throw this._httpError('Assigned barangay is required to load registration statistics.', 400);
        }

        const query = `
            SELECT
                status,
                COUNT(*)::int AS count
            FROM infant_registrations
            ${isSuperAdmin ? '' : 'WHERE UPPER(TRIM(barangay)) = UPPER(TRIM(?))'}
            GROUP BY status
        `;
        const params = isSuperAdmin ? [] : [scopedBarangay];
        const [rows] = await this.db.execute(query, params);

        const stats = {
            drafts: 0,
            pending: 0,
            approved: 0,
            validated: 0,
            rejected: 0,
            needs_correction: 0
        };

        for (const row of rows) {
            const normalizedStatus = String(row?.status || '').trim().toUpperCase();
            const count = Number(row?.count || 0);

            if (normalizedStatus === 'DRAFT') stats.drafts = count;
            else if (normalizedStatus === 'PENDING_VALIDATION') stats.pending = count;
            else if (normalizedStatus === 'APPROVED' || normalizedStatus === 'VALIDATED') {
                stats.approved += count;
                stats.validated += count;
            } else if (normalizedStatus === 'REJECTED') stats.rejected = count;
            else if (normalizedStatus === 'NEEDS_CORRECTION') stats.needs_correction = count;
        }

        return {
            scope_barangay: isSuperAdmin ? null : scopedBarangay,
            stats,
            sql: query.replace(/\s+/g, ' ').trim()
        };
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
                COALESCE(has_no_middle_name, FALSE) as has_no_middle_name,
                registration_data->>'middle_name' as middle_name,
                registration_data->>'last_name' as last_name,
                registration_data->>'dob' as dob,
                registration_data->>'sex' as sex,
                registration_data->'duplicate_alert' as duplicate_alert
            FROM infant_registrations
            WHERE created_by = ?
            ORDER BY updated_at DESC
        `;
        const [rows] = await this.db.execute(query, [userId]);
        return rows;
    }

    async getRegistrationById(registrationId, actor) {
        const [rows] = await this.db.execute(`
            SELECT
                id,
                reference_id,
                registration_data,
                status,
                barangay,
                created_by,
                submitted_at,
                reviewed_by,
                reviewed_at,
                COALESCE(has_no_middle_name, FALSE) as has_no_middle_name,
                correction_notes,
                rejection_reason,
                rejection_notes,
                promoted_infant_id,
                correction_cycle_count,
                review_history,
                created_at,
                updated_at
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

        const registrationData = typeof reg.registration_data === 'string'
            ? JSON.parse(reg.registration_data)
            : reg.registration_data;

        return {
            ...reg,
            status: reg.status,
            has_no_middle_name: this._normalizeNoMiddleName(reg.has_no_middle_name ?? registrationData?.has_no_middle_name),
            correction_notes: reg.correction_notes || null,
            rejection_reason: reg.rejection_reason || null,
            rejection_notes: reg.rejection_notes || null,
            review_history: reg.review_history || [],
            registration_data: registrationData
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
                name: actorOrUserId.name || actorOrUserId.full_name || null,
                full_name: actorOrUserId.full_name || actorOrUserId.name || null,
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

    _shapeDuplicateCheckResponseForActor(result = {}, actor = {}) {
        if (actor?.role !== ROLES.BHW) {
            return result;
        }

        const shapeMatch = (match = {}) => ({
            id: match.id || null,
            first_name: match.first_name || null,
            middle_name: match.middle_name || null,
            last_name: match.last_name || null,
            dob: match.dob || null,
            barangay: match.barangay || null,
            status: match.status || null,
            match_type: match.match_type || null
        });

        return {
            ...result,
            matches: Array.isArray(result.matches) ? result.matches.map(shapeMatch) : [],
            duplicate_alert: result.duplicate_alert
                ? {
                    status: result.duplicate_alert.status || null,
                    barangay: result.duplicate_alert.barangay || null,
                    full_name: result.duplicate_alert.full_name || null,
                    message: result.duplicate_alert.message || null,
                    signature: result.duplicate_alert.signature || null
                }
                : null
        };
    }

    _validateSaveRegistrationPayload(data) {
        this._requireNonEmptyString(data.first_name, 'first_name is required.');
        const hasNoMiddleName = this._normalizeNoMiddleName(data.has_no_middle_name);
        if (!hasNoMiddleName) {
            this._requireNonEmptyString(data.middle_name, 'middle_name is required unless No Middle Name is selected.');
        }
        this._requireNonEmptyString(data.last_name, 'last_name is required.');
        this._requireNonEmptyString(data.dob, 'dob is required.');
        this._requireNonEmptyString(data.sex, 'sex is required and must be exactly M or F.');
        this._requireNonEmptyString(data.exact_address, 'exact_address is required.');
        this._requireNonEmptyString(data.landmark, 'landmark is required.');

        const dobValue = String(data.dob).trim();
        const dob = new Date(`${dobValue}T00:00:00`);
        if (Number.isNaN(dob.getTime())) {
            throw this._httpError('Invalid dob value. Use YYYY-MM-DD format.', 400);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dob > today) {
            throw this._httpError('dob must not be in the future.', 400);
        }
    }

    _requireNonEmptyString(value, message) {
        if (typeof value !== 'string' || value.trim() === '') {
            throw this._httpError(message, 400);
        }
    }

    _normalizeSex(sex) {
        const value = String(sex || '').trim().toUpperCase();
        if (value === 'M') return 'M';
        if (value === 'F') return 'F';
        throw this._httpError('Invalid sex value. Sex must be exactly M or F.', 400);
    }

    _mapSexToInfantColumn(sex) {
        return this._normalizeSex(sex);
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

    async _enrichReviewHistory(history = []) {
        const reviewerIds = Array.from(new Set(history
            .map((item) => item.reviewer_id || item.user_id || item.actor_user_id)
            .filter(Boolean)));

        if (reviewerIds.length === 0) return history;

        const [users] = await this.db.execute(
            'SELECT id, full_name, role FROM users WHERE id = ANY(?::varchar[])',
            [reviewerIds]
        );
        const userMap = new Map(users.map((user) => [user.id, user]));

        return history.map((item) => {
            const reviewerId = item.reviewer_id || item.user_id || item.actor_user_id;
            const reviewer = userMap.get(reviewerId) || {};
            return {
                ...item,
                reviewer_id: reviewerId,
                reviewer_name: reviewer.full_name || item.reviewer_name || null,
                reviewer_role: reviewer.role || item.reviewer_role || null
            };
        });
    }

    async _getValidationEvents(registrationId) {
        const [rows] = await this.db.execute(`
            SELECT
                rve.id,
                rve.registration_id,
                rve.event_type,
                rve.reason,
                rve.notes,
                rve.metadata,
                rve.created_at,
                reviewer.id AS reviewer_id,
                reviewer.full_name AS reviewer_name,
                reviewer.role AS reviewer_role
            FROM registration_validation_events rve
            LEFT JOIN users reviewer ON reviewer.id = rve.reviewer_user_id
            WHERE rve.registration_id = ?
            ORDER BY rve.created_at DESC, rve.id DESC
        `, [registrationId]);

        return rows.map((row) => ({
            id: row.id,
            registration_id: row.registration_id,
            action: row.event_type,
            event_type: row.event_type,
            reason: row.reason,
            notes: row.notes,
            metadata: row.metadata,
            created_at: row.created_at,
            timestamp: row.created_at,
            reviewer_id: row.reviewer_id,
            reviewer_name: row.reviewer_name,
            reviewer_role: row.reviewer_role
        }));
    }

    _normalizeValidationEventType(eventType, metadata = {}) {
        const normalized = String(eventType || '').trim().toUpperCase().replace(/\s+/g, '_');
        const aliasMap = {
            APPROVED: 'APPROVED',
            REJECTED: 'REJECTED',
            RETURNED_FOR_CORRECTION: 'RETURNED_FOR_CORRECTION',
            DIRECT_CORRECTION: 'DIRECT_CORRECTION',
            TRANSFER_CONFIRMED: 'APPROVED',
            MERGE_TRANSFER: 'APPROVED'
        };

        const mapped = aliasMap[normalized];
        if (!mapped) {
            throw this._httpError(`Unsupported validation event type: ${eventType || '(empty)'}`, 500);
        }

        return {
            eventType: mapped,
            metadata: {
                ...(metadata && typeof metadata === 'object' ? metadata : {}),
                requested_event_type: normalized || null,
                recorded_event_type: mapped
            }
        };
    }

    async _insertValidationEvent(connection, { registrationId, eventType, reviewerUserId = null, reason = null, notes = null, metadata = {} }) {
        const normalizedEvent = this._normalizeValidationEventType(eventType, metadata);
        await connection.execute(`
            INSERT INTO registration_validation_events (
                id,
                registration_id,
                event_type,
                reviewer_user_id,
                reason,
                notes,
                metadata,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            uuidv4(),
            registrationId,
            normalizedEvent.eventType,
            reviewerUserId,
            reason,
            notes,
            JSON.stringify(normalizedEvent.metadata)
        ]);
    }

    _registrationTargetName(value = {}) {
        let data = value.registration_data || value;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data || '{}');
            } catch {
                data = {};
            }
        }
        return [data.first_name, data.has_no_middle_name ? '' : data.middle_name, data.last_name]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(' ') || data.infant_name || data.name || null;
    }

    _normalizeTransferInquiryNotes(data = {}) {
        return String(
            data?.transfer_inquiry_notes
            || data?.override_reason
            || data?.duplicate_resolution?.notes
            || ''
        ).trim() || null;
    }

    async mergeTransferRegistration(registrationId, actorOrReviewerId, notes = 'Transfer confirmed during validation.') {
        const actor = this._actor(actorOrReviewerId);
        this._requireRole(actor, [ROLES.MIDWIFE], 'Clinical validation actions are restricted to Midwife roles.');

        const connection = await this.db.getConnection();
        let notificationPayload = null;
        try {
            await connection.beginTransaction();
            const reg = await this._getRegistrationForActor(connection, registrationId, actor, true);
            const data = typeof reg.registration_data === 'string' ? JSON.parse(reg.registration_data || '{}') : (reg.registration_data || {});

            if (reg.status !== REGISTRATION_STATUS.PENDING_VALIDATION) {
                throw this._httpError(`Forbidden: Cannot transfer from ${reg.status}. Registration must be PENDING_VALIDATION.`, 409);
            }

            const duplicateResult = await this._findDuplicateIdentitySignals({
                ...data,
                barangay: reg.barangay
            }, actor, registrationId);

            const transferAlert = duplicateResult.crossBarangayAlert;
            if (!transferAlert || transferAlert.status !== 'TRANSFER_POSSIBLE') {
                throw this._httpError('No cross-barangay duplicate record is available for transfer.', 400);
            }

            let targetInfantId = null;
            if (transferAlert.source_table === 'INFANT') {
                targetInfantId = transferAlert.source_record_id;
            } else if (transferAlert.source_table === 'REGISTRATION' && transferAlert.reference_id) {
                const [linkedRows] = await connection.execute(
                    'SELECT promoted_infant_id FROM infant_registrations WHERE id = ? LIMIT 1',
                    [transferAlert.source_record_id]
                );
                targetInfantId = linkedRows[0]?.promoted_infant_id || null;
            }

            if (!targetInfantId) {
                throw this._httpError('The matched record is not yet transferable into the current barangay.', 409);
            }

            const [beforeInfantRows] = await connection.execute(`
                SELECT
                    id,
                    reference_id,
                    first_name,
                    middle_name,
                    last_name,
                    suffix,
                    dob,
                    sex,
                    barangay,
                    current_address,
                    exact_address,
                    landmark,
                    status,
                    updated_at
                FROM infants
                WHERE id = ?
                FOR UPDATE
            `, [targetInfantId]);

            const targetInfantBefore = beforeInfantRows[0] || null;

            if (!targetInfantBefore) {
                throw this._httpError('The matched infant record could not be loaded for transfer.', 404);
            }

            await connection.execute(`
                UPDATE infants
                SET barangay = ?,
                    current_address = COALESCE(?, current_address),
                    exact_address = COALESCE(?, exact_address),
                    landmark = COALESCE(?, landmark)
                WHERE id = ?
            `, [
                this._normalizeBarangay(reg.barangay),
                data.current_address || data.exact_address || null,
                data.exact_address || null,
                data.landmark || null,
                targetInfantId
            ]);

            const [afterInfantRows] = await connection.execute(`
                SELECT
                    id,
                    reference_id,
                    first_name,
                    middle_name,
                    last_name,
                    suffix,
                    dob,
                    sex,
                    barangay,
                    current_address,
                    exact_address,
                    landmark,
                    status,
                    updated_at
                FROM infants
                WHERE id = ?
                LIMIT 1
            `, [targetInfantId]);

            const targetInfantAfter = afterInfantRows[0] || {
                ...targetInfantBefore,
                barangay: this._normalizeBarangay(reg.barangay),
                current_address: data.current_address || data.exact_address || targetInfantBefore.current_address || null,
                exact_address: data.exact_address || targetInfantBefore.exact_address || null,
                landmark: data.landmark || targetInfantBefore.landmark || null
            };

            const history = this._parseHistory(reg.review_history);
            history.push({
                reviewer_id: actor.id,
                action: 'TRANSFER_CONFIRMED',
                notes,
                barangay: reg.barangay,
                timestamp: new Date().toISOString()
            });

            const updatedRegistrationData = {
                ...data,
                duplicate_alert: null,
                duplicate_resolution: {
                    disposition: 'TRANSFER_CONFIRMED',
                    resolved: true,
                    resolved_by: actor.id,
                    resolved_at: new Date().toISOString(),
                    signature: this._duplicateAlertSignature('TRANSFER_POSSIBLE', [transferAlert]),
                    notes
                }
            };

            await connection.execute(`
                UPDATE infant_registrations
                SET status = 'APPROVED',
                    promoted_infant_id = ?,
                    reviewed_by = ?,
                    reviewed_at = CURRENT_TIMESTAMP,
                    review_history = ?,
                    registration_data = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                targetInfantId,
                actor.id,
                JSON.stringify(history),
                JSON.stringify(updatedRegistrationData),
                registrationId
            ]);

            await this._insertValidationEvent(connection, {
                registrationId,
                eventType: 'APPROVED',
                reviewerUserId: actor.id,
                notes,
                metadata: {
                    review_outcome: 'TRANSFER_CONFIRMED',
                    target_infant_id: targetInfantId,
                    transfer_inquiry_notes: this._normalizeTransferInquiryNotes(data),
                    previous_barangay: transferAlert.barangay,
                    current_barangay: reg.barangay
                }
            });

            await connection.commit();

            notificationPayload = {
                originatingBarangay: transferAlert.barangay,
                newBarangay: reg.barangay,
                infantIdentity: {
                    first_name: data.first_name,
                    middle_name: data.middle_name,
                    last_name: data.last_name,
                    has_no_middle_name: data.has_no_middle_name,
                    dob: data.dob
                },
                transferDate: new Date().toISOString(),
                sourceRegistrationId: registrationId,
                targetInfantId: targetInfantId,
                triggeredByUserId: actor.id
            };

            try {
                await this.notificationService.createTransferNotification(notificationPayload);
            } catch (notificationError) {
                console.warn('[Transfer Notification] Failed to create handoff notice:', notificationError.message);
            }

            await safeRecordAuditEvent({
                actor,
                action: 'TRANSFER_MERGE',
                targetEntity: 'infants',
                targetRecordId: targetInfantId,
                targetName: this._registrationTargetName(data),
                barangay: reg.barangay,
                oldValues: targetInfantBefore,
                newValues: targetInfantAfter,
                metadata: {
                    source_registration_id: registrationId,
                    target_infant_id: targetInfantId,
                    from_barangay: transferAlert.barangay,
                    to_barangay: reg.barangay,
                    previous_barangay: transferAlert.barangay,
                    new_barangay: reg.barangay,
                    review_outcome: 'TRANSFER_CONFIRMED',
                    transfer_inquiry_notes: this._normalizeTransferInquiryNotes(data),
                    notes
                }
            });

            return {
                success: true,
                infantId: targetInfantId,
                referenceId: reg.reference_id,
                status: REGISTRATION_STATUS.APPROVED
            };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
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
