export const RHU2_BARANGAY_KEYS = [
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

const normalizeBarangayText = (value) => (
    (value || '')
        .toString()
        .trim()
        .toUpperCase()
        .replace(/[._-]+/g, ' ')
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
);

const hasAlias = (normalizedValue, alias) => {
    const normalizedAlias = normalizeBarangayText(alias);
    if (!normalizedValue || !normalizedAlias) return false;

    return ` ${normalizedValue} `.includes(` ${normalizedAlias} `);
};

const BARANGAY_ALIASES = [
    { canonical: 'UB', aliases: ['UB', 'U B', 'UNITED BAYANIHAN', 'UNITED BAYANIHAN BARANGAY', 'BARANGAY UNITED BAYANIHAN'] },
    { canonical: 'UBL', aliases: ['UBL', 'UNITED BETTER LIVING', 'UNITED BETTER LIVING BARANGAY', 'BARANGAY UNITED BETTER LIVING'] },
    { canonical: 'BAGONG SILANG', aliases: ['BAGONG SILANG'] },
    { canonical: 'CALENDOLA', aliases: ['CALENDOLA'] },
    { canonical: 'ESTRELLA', aliases: ['ESTRELLA'] },
    { canonical: 'GSIS', aliases: ['GSIS'] },
    { canonical: 'LANGGAM', aliases: ['LANGGAM', 'LANNGAM'] },
    { canonical: 'LARAM', aliases: ['LARAM'] },
    { canonical: 'MAGSAYSAY', aliases: ['MAGSAYSAY'] },
    { canonical: 'NARRA', aliases: ['NARRA'] },
    { canonical: 'RIVERSIDE', aliases: ['RIVERSIDE'] },
    { canonical: 'SAMPAGUITA', aliases: ['SAMPAGUITA'] }
];

export const normalizeBarangayKey = (value) => {
    const normalized = normalizeBarangayText(value);
    if (!normalized) return null;

    const match = BARANGAY_ALIASES.find(({ aliases }) => (
        aliases.some((alias) => hasAlias(normalized, alias))
    ));

    return match?.canonical || null;
};

export const normalizeBarangayDisplay = (value) => (
    normalizeBarangayKey(value) || normalizeBarangayText(value)
);
