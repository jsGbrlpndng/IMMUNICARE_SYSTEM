/**
 * Validation rules for Infant Registration Form
 */

export const validateField = (name, value) => {
    const nameRegex = /[^a-zA-Z\s\-ñÑ.']/;
    const phoneRegex = /^(09|\+639)\d{9}$/;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inputDate = value ? new Date(value) : null;
    if (inputDate) inputDate.setHours(0, 0, 0, 0);

    switch (name) {
        case 'first_name':
        case 'last_name':
            if (!value) return "Required";
            if (nameRegex.test(value)) return "Invalid characters";
            return null;
        case 'dob':
            if (!value) return "Required";
            if (inputDate > today) return "Future dates not allowed";
            return null;
        case 'caregiver_phone':
            if (!value) return "Required";
            if (!phoneRegex.test(value)) return "Invalid format (09XXXXXXXXX)";
            return null;
        case 'birth_weight':
            if (!value) return "Required";
            const weight = parseFloat(value);
            if (isNaN(weight)) return "Invalid number";
            if (weight < 1.0 || weight > 6.0) return "Invalid birth weight. Must be between 1.0 and 6.0 kg.";
            return null;
        case 'length_at_birth_cm':
            if (!value) return "Required";
            const length = parseFloat(value);
            if (isNaN(length)) return "Invalid number";
            if (length < 35.0 || length > 60.0) return "Invalid birth length. Must be between 35.0 and 60.0 cm.";
            return null;
        case 'delivery_facility_name':
            if (!value) return "Required";
            if (/^\d+$/.test(value)) return "Must contain alphabetical characters";
            return null;
        case 'landmark':
            if (!value || !value.trim()) return "Required";
            return null;
        case 'exact_address':
            if (!value) return "Required";
            return null;
        case 'locality':
            if (!value) return "Required";
            return null;
        case 'purok':
            if (!value) return "Required (if location not pinned)";
            return null;
        case 'mothers_maiden_name':
            if (!value) return "Required";
            if (nameRegex.test(value)) return "Invalid characters";
            return null;
        case 'caregiver_relationship':
            if (!value) return "Required";
            return null;
        case 'last_tt_date':
            if (!value) return null; // Mandatory check handled in isStepValid
            if (inputDate > today) return "Future dates not allowed";
            return null;
        case 'bcg_date':
        case 'hepatitis_b_date':
            if (!value) return null; // Mandatory check handled in isStepValid
            if (inputDate > today) return "Future dates not allowed";
            return null;
        default:
            return null;
    }
};

export const isStepValid = (step, formData, errors) => {
    const fieldsByStep = {
        1: ['first_name', 'last_name', 'dob', 'sex', 'barangay', 'locality', 'exact_address', 'landmark'],
        2: ['mothers_maiden_name', 'caregiver_relationship', 'caregiver_phone'],
        3: ['birth_weight', 'length_at_birth_cm', 'birth_status', 'birth_setting', 'initiated_breastfeeding'],
        4: ['bcg_status', 'hepatitis_b_status'] 
    };

    const stepFields = fieldsByStep[step] || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dob = formData.dob ? new Date(formData.dob) : null;
    if (dob) dob.setHours(0, 0, 0, 0);
    
    if (step === 1) {
        // Step 1: Spatial Integrity - Must have address OR coordinates
        const hasGeo = formData.latitude && formData.longitude && formData.is_location_verified;
        const hasAddress = formData.exact_address && formData.landmark;
        
        // Purok is mandatory if geo is missing
        if (!hasGeo && !formData.purok) return false;

        if (!hasAddress) return false;
        
        // Basic identity fields check
        const basicFields = ['first_name', 'last_name', 'dob', 'sex'];
        const hasMissingBasic = basicFields.some(field => !formData[field] || errors[field]);
        if (hasMissingBasic) return false;
        
        return true;
    }

    if (step === 2) {
        const hasErrors = stepFields.some(field => !!errors[field]);
        if (hasErrors) return false;
        const hasMissing = stepFields.some(field => !formData[field]);
        return !hasMissing;
    }

    if (step === 3) {
        // Tetanus Validation
        if (!formData.tt_history_unknown && ['TT2', 'TT3', 'TT4', 'TT5'].includes(formData.mother_tt_status) && !formData.last_tt_date) {
            return false;
        }
        if (formData.last_tt_date) {
            const ttDate = new Date(formData.last_tt_date);
            ttDate.setHours(0, 0, 0, 0);
            if (ttDate > today) return false;
        }

        if (!formData.birth_weight || !formData.length_at_birth_cm) return false;
        if (formData.birth_setting === 'FACILITY') {
            if (!formData.delivery_facility_name || errors.delivery_facility_name) return false;
        }
        
        const hasErrors = stepFields.some(field => !!errors[field]);
        if (hasErrors) return false;
        return true;
    }

    if (step === 4) {
        if (!formData.bcg_status || !formData.hepatitis_b_status) return false;
        
        // BCG Validation
        if (formData.bcg_status === 'Given') {
            if (!formData.bcg_date) return false;
            const bcgDate = new Date(formData.bcg_date);
            bcgDate.setHours(0, 0, 0, 0);
            if (bcgDate > today || (dob && bcgDate < dob)) return false;
        }

        // Hep B Validation
        if (formData.hepatitis_b_status?.startsWith('Given')) {
            if (!formData.hepatitis_b_date) return false;
            const hepaDate = new Date(formData.hepatitis_b_date);
            hepaDate.setHours(0, 0, 0, 0);
            if (hepaDate > today || (dob && hepaDate < dob)) return false;
        }
        
        const hasErrors = stepFields.some(field => !!errors[field]);
        if (hasErrors) return false;
        return true;
    }

    return true;
};
