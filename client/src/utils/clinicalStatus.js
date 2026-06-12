export const CLINICAL_STATUS = Object.freeze({
    FULLY_IMMUNIZED: 'FULLY_IMMUNIZED',
    UP_TO_DATE: 'UP_TO_DATE',
    DUE_SOON: 'DUE_SOON',
    OVERDUE: 'OVERDUE',
    DEFAULTED: 'DEFAULTED',
    INCOMPLETE: 'INCOMPLETE'
});

export const CLINICAL_STATUS_ORDER = [
    CLINICAL_STATUS.FULLY_IMMUNIZED,
    CLINICAL_STATUS.UP_TO_DATE,
    CLINICAL_STATUS.DUE_SOON,
    CLINICAL_STATUS.OVERDUE,
    CLINICAL_STATUS.DEFAULTED,
    CLINICAL_STATUS.INCOMPLETE
];

export const CLINICAL_STATUS_CONFIG = Object.freeze({
    [CLINICAL_STATUS.FULLY_IMMUNIZED]: {
        label: 'Fully Immunized',
        shortLabel: 'Fully Immunized',
        badgeClassName: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        emphasisBadgeClassName: 'bg-emerald-600 text-white border border-emerald-700',
        panelClassName: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        iconToneClassName: 'bg-emerald-100 text-emerald-700',
        textClassName: 'text-emerald-700',
        dotClassName: 'bg-emerald-500',
        colorHex: '#059669',
        icon: 'check'
    },
    [CLINICAL_STATUS.UP_TO_DATE]: {
        label: 'Up-to-Date',
        shortLabel: 'Up-to-Date',
        badgeClassName: 'bg-sky-50 text-sky-700 border border-sky-200',
        emphasisBadgeClassName: 'bg-sky-600 text-white border border-sky-700',
        panelClassName: 'bg-sky-50 border-sky-200 text-sky-800',
        iconToneClassName: 'bg-sky-100 text-sky-700',
        textClassName: 'text-sky-700',
        dotClassName: 'bg-sky-500',
        colorHex: '#0284C7',
        icon: 'activity'
    },
    [CLINICAL_STATUS.DUE_SOON]: {
        label: 'Due Soon',
        shortLabel: 'Due Soon',
        badgeClassName: 'bg-amber-50 text-amber-700 border border-amber-200',
        emphasisBadgeClassName: 'bg-amber-500 text-white border border-amber-600',
        panelClassName: 'bg-amber-50 border-amber-200 text-amber-800',
        iconToneClassName: 'bg-amber-100 text-amber-700',
        textClassName: 'text-amber-700',
        dotClassName: 'bg-amber-500',
        colorHex: '#D97706',
        icon: 'clock'
    },
    [CLINICAL_STATUS.OVERDUE]: {
        label: 'Overdue',
        shortLabel: 'Overdue',
        badgeClassName: 'bg-orange-50 text-orange-700 border border-orange-200',
        emphasisBadgeClassName: 'bg-orange-600 text-white border border-orange-700',
        panelClassName: 'bg-orange-50 border-orange-200 text-orange-800',
        iconToneClassName: 'bg-orange-100 text-orange-700',
        textClassName: 'text-orange-700',
        dotClassName: 'bg-orange-500',
        colorHex: '#EA580C',
        icon: 'alert'
    },
    [CLINICAL_STATUS.DEFAULTED]: {
        label: 'Defaulted',
        shortLabel: 'Defaulted',
        badgeClassName: 'bg-rose-50 text-rose-700 border border-rose-200',
        emphasisBadgeClassName: 'bg-rose-600 text-white border border-rose-700',
        panelClassName: 'bg-rose-50 border-rose-200 text-rose-800',
        iconToneClassName: 'bg-rose-100 text-rose-700',
        textClassName: 'text-rose-700',
        dotClassName: 'bg-rose-500',
        colorHex: '#DC2626',
        icon: 'alert-octagon'
    },
    [CLINICAL_STATUS.INCOMPLETE]: {
        label: 'Incomplete',
        shortLabel: 'Incomplete',
        badgeClassName: 'bg-slate-100 text-slate-700 border border-slate-200',
        emphasisBadgeClassName: 'bg-slate-600 text-white border border-slate-700',
        panelClassName: 'bg-slate-50 border-slate-200 text-slate-800',
        iconToneClassName: 'bg-slate-100 text-slate-700',
        textClassName: 'text-slate-700',
        dotClassName: 'bg-slate-500',
        colorHex: '#64748B',
        icon: 'file-warning'
    }
});

function extractRawStatus(input) {
    if (!input) return '';
    if (typeof input === 'string') return input;
    return (
        input.clinical_status ||
        input.computed_schedule_status ||
        input.computed_map_status ||
        input.immunization_status ||
        input.scheduleStatus ||
        input.original_schedule_status ||
        input.status ||
        input.urgency ||
        ''
    );
}

export function normalizeClinicalStatus(input) {
    const registrationStatus = String(
        typeof input === 'object' && input?.registration_status ? input.registration_status : ''
    ).trim().toUpperCase();

    if (['DRAFT', 'PENDING_VALIDATION', 'NEEDS_CORRECTION'].includes(registrationStatus)) {
        return CLINICAL_STATUS.INCOMPLETE;
    }

    const raw = String(extractRawStatus(input)).trim().toUpperCase();
    const urgency = String(typeof input === 'object' ? input?.urgency || '' : '').trim().toLowerCase();

    if (['DEFAULTER', 'DEFAULTED'].includes(raw) || urgency === 'defaulter') {
        return CLINICAL_STATUS.DEFAULTED;
    }

    if (raw === 'OVERDUE' || urgency === 'overdue') {
        return CLINICAL_STATUS.OVERDUE;
    }

    if (['DUE', 'DUE_TODAY', 'DUE_SOON', 'PENDING_VALIDATION'].includes(raw) || ['due_today', 'due_soon', 'pending_validation'].includes(urgency)) {
        return CLINICAL_STATUS.DUE_SOON;
    }

    if (['FIC', 'CIC', 'COMPLETED', 'FULLY_IMMUNIZED'].includes(raw) || urgency === 'completed') {
        return CLINICAL_STATUS.FULLY_IMMUNIZED;
    }

    if (['ON_TRACK', 'UP_TO_DATE', 'UPCOMING', 'NOT_YET_DUE', 'SCHEDULED', 'ADMINISTERED'].includes(raw) || ['on_track', 'upcoming', 'scheduled', 'administered'].includes(urgency)) {
        return CLINICAL_STATUS.UP_TO_DATE;
    }

    return CLINICAL_STATUS.INCOMPLETE;
}

export function getClinicalStatusMeta(input) {
    const code = normalizeClinicalStatus(input);
    return {
        code,
        ...CLINICAL_STATUS_CONFIG[code]
    };
}
