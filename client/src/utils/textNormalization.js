const PRESERVED_ACRONYMS = new Set([
    'RHU',
    'BHW',
    'MMR',
    'OPV',
    'IPV',
    'PCV',
    'BCG'
]);

const normalizeWord = (word) => {
    const upper = word.toUpperCase();
    if (PRESERVED_ACRONYMS.has(upper)) return upper;
    if (/^[IVX]+$/i.test(word)) return upper;

    return word
        .split('-')
        .map((part) => {
            if (!part) return part;
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join('-');
};

export const normalizeDisplayText = (value) => {
    const compact = String(value || '').trim().replace(/\s+/g, ' ');
    if (!compact) return '';

    return compact
        .split(' ')
        .map(normalizeWord)
        .join(' ');
};
