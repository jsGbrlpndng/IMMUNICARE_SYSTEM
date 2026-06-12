/**
 * ValidationService - Centralized validation logic for infant registration
 * Used by both client and server to ensure consistent validation rules
 * 
 * This service implements all validation rules identically for BHW and Clinical Staff
 */

class ValidationService {
    /**
     * Validate all required fields
     * @param {Object} data - Registration form data
     * @returns {Object} - Validation errors object
     */
    static validateRequired(data) {
        const errors = {};

        if (!data.first_name || !data.first_name.trim()) {
            errors.first_name = 'First name is required';
        }

        if (!data.last_name || !data.last_name.trim()) {
            errors.last_name = 'Last name is required';
        }

        if (!data.dob) {
            errors.dob = 'Date of birth is required';
        }

        if (!data.sex) {
            errors.sex = 'Sex is required';
        }

        if (!data.mothers_maiden_name || !data.mothers_maiden_name.trim()) {
            errors.mothers_maiden_name = 'Mother\'s maiden name is required';
        }

        if (!data.caregiver_phone || !data.caregiver_phone.trim()) {
            errors.caregiver_phone = 'Caregiver phone number is required';
        }

        if (!data.caregiver_relationship || !data.caregiver_relationship.trim()) {
            errors.caregiver_relationship = 'Caregiver relationship is required';
        }

        if (!data.barangay || !data.barangay.trim()) {
            errors.barangay = 'Barangay is required';
        }

        // Purok is required UNLESS spatial coordinates are present (Pillar 2: Spatial Record)
        const hasSpatial = data.latitude && data.longitude;
        if (!hasSpatial && (!data.purok || !data.purok.trim())) {
            errors.purok = 'Purok is required if location is not pinned on the map';
        }

        if (!data.exact_address || !data.exact_address.trim()) {
            errors.exact_address = 'Full address is required';
        }

        if (!data.landmark || !data.landmark.trim()) {
            errors.landmark = 'Landmark is required for field navigation';
        }

        if (data.length_at_birth_cm === null || data.length_at_birth_cm === undefined || data.length_at_birth_cm === '') {
            errors.length_at_birth_cm = 'Length at birth is required';
        } else if (parseFloat(data.length_at_birth_cm) < 10 || parseFloat(data.length_at_birth_cm) > 100) {
            errors.length_at_birth_cm = 'Length must be between 10cm and 100cm';
        }

        return errors;
    }

    /**
     * Validate date fields (PILLAR 1: Temporal Validation)
     */
    static validateDates(data) {
        const errors = {};
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (data.dob) {
            const dobDate = new Date(data.dob);
            if (dobDate > today) {
                errors.dob = 'Date of birth cannot be in the future';
            }
        }

        // At-birth vaccinations validation - Updated to support natural language strings
        const isBcgGiven = String(data.bcg_status || '').startsWith('Given') || data.bcg_given;
        const isHepBGiven = data.hepatitis_b_status?.startsWith('Given') || data.hepatitis_b_given;

        if (isBcgGiven && !data.bcg_date) {
            errors.bcg_date = 'BCG date is required if marked as given';
        }
        if (isHepBGiven && !data.hepatitis_b_date) {
            errors.hepatitis_b_date = 'Hepa B date is required if marked as given';
        }

        return errors;
    }

    /**
     * Validate phone number format (PILLAR 3: Communication Validation)
     */
    static validatePhone(phone) {
        if (!phone) return false;
        const phoneRegex = /^(09|\+639)\d{9}$/;
        return phoneRegex.test(phone);
    }

    /**
     * Validate string for allowed clinical name characters
     */
    static validateNameStrings(name) {
        if (!name) return true;
        const nameRegex = /[^a-zA-Z\s\-ñÑ.']/; 
        return !nameRegex.test(name);
    }

    /**
     * Validate birth weight
     */
    static validateBirthWeight(weight) {
        const errors = {};
        const warnings = [];

        if (weight !== null && weight !== undefined && weight !== '') {
            const weightNum = parseFloat(weight);
            if (isNaN(weightNum)) {
                errors.birth_weight = 'Birth weight must be a valid number';
            } else if (weightNum < 0.5 || weightNum > 25.0) {
                errors.birth_weight = 'Birth weight must be between 0.5kg and 25kg';
            } else if (weightNum < 2.5) {
                warnings.push({
                    field: 'birth_weight',
                    message: `Low Birth Weight Warning: ${weightNum}kg`,
                    severity: 'warning',
                    code: 'LBW_ALERT'
                });
            }
        }
        return { errors, warnings };
    }

    /**
     * Validate last_tt_date and TT history consistency
     */
    static validateLastTTDate(data) {
        const errors = {};
        const { last_tt_date, mother_tt_status, tt_history_unknown, dob } = data;

        // Convert to string for consistent comparison
        const ttStatusStr = String(mother_tt_status || '0');
        const ttStatusInt = parseInt(ttStatusStr, 10);

        // Enforce 0-5 mapping
        if (isNaN(ttStatusInt) || ttStatusInt < 0 || ttStatusInt > 5) {
            errors.mother_tt_status = 'Mother TT status must be between 0 and 5';
            return errors;
        }

        if (tt_history_unknown) {
            if (ttStatusInt !== 0) {
                errors.mother_tt_status = 'Status must be "Unknown" (0) if TT History is Unknown';
            }
            if (last_tt_date && last_tt_date.trim() !== '') {
                errors.last_tt_date = 'Last TT Date must be empty if TT History is Unknown';
            }
            return errors;
        }

        const statusRequiresDate = ['2', '3', '4', '5'].includes(ttStatusStr);
        if (statusRequiresDate && !last_tt_date) {
            errors.last_tt_date = 'Date of last TT dose is required for TT2–TT5 status';
            return errors;
        }

        if (last_tt_date) {
            const ttDate = new Date(last_tt_date);
            const today = new Date();
            today.setHours(23, 59, 59, 999);

            if (ttDate > today) {
                errors.last_tt_date = 'TT date cannot be in the future';
            }

            if (dob) {
                const dobDate = new Date(dob);
                if (ttDate > dobDate) {
                    errors.last_tt_date = 'Maternal TT date should be prior to or on delivery date';
                }
            }
        }

        return errors;
    }

    /**
     * Comprehensive validation
     */
    static validate(data) {
        const errors = {};
        const warnings = [];
        const isDraft = data.registration_status === 'DRAFT';

        if (!isDraft) {
            Object.assign(errors, this.validateRequired(data));
        } else if (!data.first_name && !data.last_name && !data.dob) {
            errors.draft = 'Draft requires at least a name or date of birth';
        }

        const nameFields = ['first_name', 'last_name', 'middle_name', 'mothers_maiden_name', 'father_name'];
        nameFields.forEach(field => {
            if (data[field] && !this.validateNameStrings(data[field])) {
                errors[field] = 'Invalid characters in name';
            }
        });

        Object.assign(errors, this.validateDates(data));

        if (data.caregiver_phone && !this.validatePhone(data.caregiver_phone)) {
            errors.caregiver_phone = 'Invalid phone format (09XXXXXXXXX)';
        }

        const weightResult = this.validateBirthWeight(data.birth_weight);
        Object.assign(errors, weightResult.errors);
        warnings.push(...weightResult.warnings);

        Object.assign(errors, this.validateLastTTDate(data));

        const validBarangays = ['BAGONG SILANG', 'CALENDOLA', 'ESTRELLA', 'GSIS', 'LANGGAM', 'LARAM', 'MAGSAYSAY', 'NARRA', 'RIVERSIDE', 'SAMPAGUITA', 'UB', 'UBL'];
        if (data.barangay && !validBarangays.includes(data.barangay.toUpperCase())) {
            errors.barangay = 'Invalid barangay selection';
        }

        return {
            valid: Object.keys(errors).length === 0,
            errors,
            warnings
        };
    }
}

module.exports = ValidationService;
