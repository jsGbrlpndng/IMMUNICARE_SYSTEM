const { IMMUNIZATION_STATUS } = require('../constants/domain');

const CLINICAL_STATUS = Object.freeze({
    FULLY_IMMUNIZED: IMMUNIZATION_STATUS.FULLY_IMMUNIZED,
    UP_TO_DATE: IMMUNIZATION_STATUS.UP_TO_DATE,
    DUE_SOON: IMMUNIZATION_STATUS.DUE_SOON,
    OVERDUE: IMMUNIZATION_STATUS.OVERDUE,
    DEFAULTED: IMMUNIZATION_STATUS.DEFAULTED,
    INCOMPLETE: IMMUNIZATION_STATUS.INCOMPLETE
});

function upper(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizeClinicalStatus({
    computedStatus,
    urgency,
    immunizationStatus,
    registrationStatus
} = {}) {
    const registration = upper(registrationStatus);
    if (['DRAFT', 'PENDING_VALIDATION', 'NEEDS_CORRECTION'].includes(registration)) {
        return CLINICAL_STATUS.INCOMPLETE;
    }

    const raw = upper(computedStatus || immunizationStatus || urgency);

    if (['DEFAULTER', 'DEFAULTED'].includes(raw) || urgency === 'defaulter') {
        return CLINICAL_STATUS.DEFAULTED;
    }

    if (raw === 'OVERDUE' || urgency === 'overdue') {
        return CLINICAL_STATUS.OVERDUE;
    }

    if (
        ['DUE', 'DUE_TODAY', 'DUE_SOON', 'PENDING_VALIDATION'].includes(raw) ||
        ['due_today', 'due_soon', 'pending_validation'].includes(String(urgency || '').trim().toLowerCase())
    ) {
        return CLINICAL_STATUS.DUE_SOON;
    }

    if (['FIC', 'CIC', 'COMPLETED', 'FULLY_IMMUNIZED'].includes(raw) || urgency === 'completed') {
        return CLINICAL_STATUS.FULLY_IMMUNIZED;
    }

    if (
        ['ON_TRACK', 'UP_TO_DATE', 'UPCOMING', 'NOT_YET_DUE', 'SCHEDULED', 'ADMINISTERED'].includes(raw) ||
        ['on_track', 'upcoming', 'scheduled', 'administered'].includes(String(urgency || '').trim().toLowerCase())
    ) {
        return CLINICAL_STATUS.UP_TO_DATE;
    }

    return CLINICAL_STATUS.INCOMPLETE;
}

module.exports = {
    CLINICAL_STATUS,
    normalizeClinicalStatus
};
