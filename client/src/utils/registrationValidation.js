/**
 * Validation rules for Infant Registration Form
 */

export const TT_STATUS_OPTIONS = {
    NO_HISTORY: '0',
    TT1: '1',
    TT2: '2',
    TT3: '3',
    TT4: '4',
    TT5: '5'
};

export const GIVEN_WITHIN_24_HOURS = 'Given within 24 hours';
export const GIVEN_MORE_THAN_24_HOURS = 'Given more than 24 hours';
export const NOT_GIVEN = 'Not Given';
export const UNKNOWN = 'Unknown';

export const formatTTStatus = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return 'Select TT status';
    if (['0', 'NO_TT_HISTORY', 'NO TT HISTORY', 'NONE'].includes(normalized)) return 'No TT history';
    if (/^TT[1-5]$/.test(normalized)) return normalized;
    if (/^[1-5]$/.test(normalized)) return `TT${normalized}`;
    return value || 'Select TT status';
};

export const normalizeTTStatus = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return '';
    if (['0', 'NO_TT_HISTORY', 'NO TT HISTORY', 'UNKNOWN', 'UNKNOWN / NO HISTORY', 'NONE'].includes(normalized)) return '0';
    if (/^TT[1-5]$/.test(normalized)) return normalized.replace(/^TT/, '');
    if (/^[1-5]$/.test(normalized)) return normalized;
    return '';
};

const parseLocalDate = (value) => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const isDateOnlyValue = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());

export const classifyBirthDoseStatus = (dateGiven, dob) => {
    const doseValue = String(dateGiven || '').trim();
    const dobValue = String(dob || '').trim();
    if (isDateOnlyValue(doseValue) && isDateOnlyValue(dobValue)) {
        if (doseValue < dobValue) return '';
        return doseValue === dobValue ? GIVEN_WITHIN_24_HOURS : GIVEN_MORE_THAN_24_HOURS;
    }

    const doseDate = parseLocalDate(doseValue);
    const birthDate = parseLocalDate(dobValue);
    if (!doseDate || !birthDate) return '';
    const hoursAfterBirth = (doseDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60);
    if (hoursAfterBirth < 0) return '';
    return hoursAfterBirth >= 0 && hoursAfterBirth <= 24
        ? GIVEN_WITHIN_24_HOURS
        : GIVEN_MORE_THAN_24_HOURS;
};

export const normalizeBirthDoseSelection = ({ status, date, dob }) => {
    const rawStatus = String(status || '').trim();
    if (!rawStatus) return { status: '', date: date || '' };
    if ([NOT_GIVEN, UNKNOWN].includes(rawStatus)) return { status: rawStatus, date: '' };
    if (!rawStatus.startsWith('Given')) return { status: rawStatus, date: date || '' };

    const correctedStatus = date ? classifyBirthDoseStatus(date, dob) : '';
    return {
        status: correctedStatus || rawStatus,
        date: date || ''
    };
};

export const deriveBirthStatus = (birthWeight) => {
    const weight = Number.parseFloat(birthWeight);
    if (!String(birthWeight || '').trim() || !Number.isFinite(weight)) return 'Pending birth weight';
    return weight < 2.5 ? 'Low Birth Weight' : weight > 4.0 ? 'Macrosomia' : 'Normal';
};

const isWholePositiveInteger = (value) => /^[1-9]\d*$/.test(String(value || '').trim());

const hasMeaningfulText = (value, minLength = 8) => {
    const text = String(value || '').trim();
    return text.length >= minLength && /[A-Za-zÀ-ÿ]/.test(text);
};

export const validateField = (name, value, formData = {}) => {
    const nameRegex = /[^a-zA-Z\s\-ñÑ.']/;
    const phoneRegex = /^(09|\+639)\d{9}$/;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inputDate = parseLocalDate(value);
    const dobDate = parseLocalDate(formData.dob);

    switch (name) {
        case 'first_name':
        case 'middle_name':
            if (formData?.has_no_middle_name === true) return null;
            if (!value) return "Required";
            if (nameRegex.test(value)) return "Invalid characters";
            return null;
        case 'last_name':
            if (!value) return "Required";
            if (nameRegex.test(value)) return "Invalid characters";
            return null;
        case 'suffix':
            if (formData?.suffix_is_other === true && !String(value || '').trim()) {
                return "Custom suffix is required";
            }
            if (String(value || '').trim().toUpperCase() === 'OTHER') {
                return "Enter the custom suffix instead of Other";
            }
            return null;
        case 'dob':
            if (!value) return "Required";
            if (inputDate > today) return "Future dates not allowed";
            return null;
        case 'caregiver_phone':
            if (!value) return "Required";
            if (!phoneRegex.test(value)) return "Invalid format (09XXXXXXXXX)";
            return null;
        case 'pregnancy_order':
            if (!value) return "Required";
            if (!isWholePositiveInteger(value)) return "Must be a positive whole number";
            if (parseInt(value, 10) < 1 || parseInt(value, 10) > 20) return "pregnancy_order must be between 1 and 20.";
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
            if (!hasMeaningfulText(value)) return "Add meaningful house or landmark details";
            return null;
        case 'exact_address':
            if (!value) return "Required";
            if (!hasMeaningfulText(value, 10)) return "Enter house number, block/lot, street, purok, sitio, or landmark details";
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
            if (dobDate && inputDate > dobDate) return "Must not be after date of birth";
            return null;
        case 'bcg_date':
        case 'hepatitis_b_date':
            if (!value) return null; // Mandatory check handled in isStepValid
            if (inputDate > today) return "Future dates not allowed";
            if (dobDate && inputDate < dobDate) return "Must not be before date of birth";
            return null;
        case 'mother_tt_status':
            if (value === '' || value === undefined || value === null) return "Select TT status";
            if (!['0', '1', '2', '3', '4', '5', 'TT1', 'TT2', 'TT3', 'TT4', 'TT5'].includes(String(value))) return "Invalid TT status";
            return null;
        default:
            return null;
    }
};

export const isStepValid = (step, formData, errors) => {
    const fieldsByStep = {
        1: ['first_name', 'middle_name', 'last_name', 'dob', 'sex', 'barangay', 'locality', 'exact_address', 'landmark'],
        2: ['mothers_maiden_name', 'caregiver_relationship', 'caregiver_phone', 'pregnancy_order'],
        3: ['mother_tt_status', 'last_tt_date', 'birth_weight', 'length_at_birth_cm', 'birth_status', 'birth_setting', 'initiated_breastfeeding'],
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
        if (errors.exact_address || errors.suffix) return false;
        if (formData.suffix_is_other === true && !String(formData.suffix || '').trim()) return false;
        if (formData.out_of_barangay_exception_confirmed === true && !String(formData.out_of_barangay_exception_reason || '').trim()) return false;
        if (formData.has_no_middle_name !== true && (!formData.middle_name || errors.middle_name)) return false;
        
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
        const ttStatus = String(formData.mother_tt_status || '').trim().toUpperCase().replace(/^TT/, '');
        const requiresLastTtDate = ['1', '2', '3', '4', '5'].includes(ttStatus);
        if (!['0', '1', '2', '3', '4', '5'].includes(ttStatus)) return false;
        if (ttStatus === '0' && formData.last_tt_date) return false;
        if (requiresLastTtDate && !formData.last_tt_date) {
            return false;
        }
        if (formData.last_tt_date) {
            const ttDate = new Date(formData.last_tt_date);
            ttDate.setHours(0, 0, 0, 0);
            if (ttDate > today) return false;
            if (dob && ttDate > dob) return false;
        }

        if (!formData.birth_weight || !formData.length_at_birth_cm) return false;
        if (formData.birth_setting === 'FACILITY') {
            if (!formData.delivery_facility_name || errors.delivery_facility_name) return false;
        }
        
        const hasErrors = stepFields.some(field => {
            if (field === 'last_tt_date' && !requiresLastTtDate) return false;
            return !!errors[field];
        });
        if (hasErrors) return false;
        return true;
    }

    if (step === 4) {
        if (!formData.bcg_status || !formData.hepatitis_b_status) return false;
        
        // BCG Validation
        if (formData.bcg_status?.startsWith('Given')) {
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
