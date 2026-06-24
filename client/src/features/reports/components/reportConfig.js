export const SAN_PEDRO_GREEN = '#064E3B';
export const ALL_MONTH_VALUE = 'ALL';

export const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];

export const formatReportingPeriodLabel = (month, year) => {
    if (month === ALL_MONTH_VALUE || month === null || month === undefined) {
        return `Whole Year ${year}`;
    }
    const monthIndex = Number(month) - 1;
    return `${MONTHS[monthIndex] || 'Selected Month'} ${year}`;
};

export const RHU2_BARANGAYS = [
    'BAGONG SILANG',
    'CALENDOLA',
    'ESTRELLA',
    'GSIS',
    'LANGGAM',
    'LARAM',
    'MAGSAYSAY',
    'NARRA',
    'RIVERSIDE',
    'SAMPAGUITA',
    'UB',
    'UBL'
];

export const SAN_PEDRO_BARANGAYS = RHU2_BARANGAYS;

export const MASTER_COLUMNS = [
    { key: 'barangay', label: 'Barangay', type: 'text', sticky: true },
    { key: 'bcg', label: 'BCG' },
    { key: 'hepb', label: 'Hep B' },
    { key: 'penta1', label: 'Penta 1' },
    { key: 'penta2', label: 'Penta 2' },
    { key: 'penta3', label: 'Penta 3' },
    { key: 'opv1', label: 'OPV 1' },
    { key: 'opv2', label: 'OPV 2' },
    { key: 'opv3', label: 'OPV 3' },
    { key: 'ipv1', label: 'IPV 1' },
    { key: 'ipv2', label: 'IPV 2' },
    { key: 'pcv1', label: 'PCV 1' },
    { key: 'pcv2', label: 'PCV 2' },
    { key: 'pcv3', label: 'PCV 3' },
    { key: 'mcv1', label: 'MCV 1' },
    { key: 'mcv2', label: 'MCV 2' },
    { key: 'fic', label: 'FIC' },
    { key: 'cic', label: 'CIC' }
];

export const MONTHLY_GROUPS = [
    {
        label: 'Birth Doses',
        columns: [
            { key: 'bcg_at_birth', label: 'BCG @ Birth' },
            { key: 'bcg_after_24_hours', label: 'BCG After 24h' },
            { key: 'hepb_at_birth', label: 'Hep B @ Birth' },
            { key: 'hepb_after_24_hours', label: 'Hep B After 24h' }
        ]
    },
    ...['penta1', 'penta2', 'penta3'].map((key, index) => ({
        label: `PENTA ${index + 1}`,
        columns: [
            { key: `${key}_0_12`, label: '0-12m' },
            { key: `${key}_13_23`, label: '13-23m' },
            { key: `${key}_catch_up`, label: 'Catch-up' }
        ]
    })),
    ...['opv1', 'opv2', 'opv3'].map((key, index) => ({
        label: `OPV ${index + 1}`,
        columns: [
            { key: `${key}_0_12`, label: '0-12m' },
            { key: `${key}_13_23`, label: '13-23m' },
            { key: `${key}_catch_up`, label: 'Catch-up' }
        ]
    })),
    ...['ipv1', 'ipv2'].map((key, index) => ({
        label: `IPV ${index + 1}`,
        columns: [
            { key: `${key}_0_12`, label: '0-12m' },
            { key: `${key}_13_23`, label: '13-23m' },
            { key: `${key}_catch_up`, label: 'Catch-up' }
        ]
    })),
    ...['pcv1', 'pcv2', 'pcv3'].map((key, index) => ({
        label: `PCV ${index + 1}`,
        columns: [
            { key: `${key}_0_12`, label: '0-12m' },
            { key: `${key}_13_23`, label: '13-23m' },
            { key: `${key}_catch_up`, label: 'Catch-up' }
        ]
    })),
    {
        label: 'MCV 1',
        columns: [
            { key: 'mcv1_0_12', label: '9-12m' },
            { key: 'mcv1_13_23', label: '13-23m' },
            { key: 'mcv1_catch_up', label: '24-59m / Catch-up' }
        ]
    },
    {
        label: 'MCV 2',
        columns: [
            { key: 'mcv2_0_12', label: '12m' },
            { key: 'mcv2_13_23', label: '13-23m' },
            { key: 'mcv2_catch_up', label: '24-59m / Catch-up' }
        ]
    },
    {
        label: 'Completion',
        columns: [
            { key: 'fic', label: 'FIC' },
            { key: 'cic', label: 'CIC' }
        ]
    }
];

export const DOH_TARGET_COLUMNS = [
    { key: 'total_population', label: 'Population' },
    { key: 'eligible_population_0_11_months', label: 'EP 0-11 months' },
    { key: 'eligible_population_0_12_months', label: 'EP 0-12 months' },
    { key: 'eligible_population_13_23_months', label: 'EP 13-23 months' },
    { key: 'actual_population', label: 'Actual Population' }
];

export const MONTHLY_COLUMNS = MONTHLY_GROUPS.flatMap((group) => group.columns);

export const formatCount = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed.toLocaleString() : '0';
};

export const formatPercent = (value, digits = 1) => {
    const parsed = Number(value || 0);
    return `${Number.isFinite(parsed) ? parsed.toFixed(digits) : '0.0'}%`;
};
