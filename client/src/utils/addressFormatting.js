const DEFAULT_CITY = 'San Pedro';
const DEFAULT_PROVINCE = 'Laguna';

const MUNICIPAL_TOKENS = new Set([
    'SAN PEDRO',
    'CITY OF SAN PEDRO',
    'LAGUNA',
    'CALABARZON',
    'REGION IV-A',
    'REGION IVA',
    'PHILIPPINES'
]);

const normalizeKey = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const isPostalCode = (value) => /^\d{4,5}$/.test(String(value || '').trim());

const smartTitle = (value) => {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    if (/[a-z]/.test(text)) return text;

    return text.toLowerCase().replace(/\b([a-z])([a-z0-9.'-]*)/g, (_, first, rest) => (
        first.toUpperCase() + rest
    ));
};

const splitAddressParts = (value) => String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const removeDuplicateParts = (parts) => {
    const seen = new Set();
    const output = [];

    parts.forEach((part) => {
        const key = normalizeKey(part);
        if (!key || seen.has(key)) return;
        seen.add(key);
        output.push(smartTitle(part));
    });

    return output;
};

const isNoisePart = (part, { barangay, city, province } = {}) => {
    const key = normalizeKey(part);
    if (!key) return true;
    if (isPostalCode(part)) return true;
    if (MUNICIPAL_TOKENS.has(key)) return true;
    if (city && key === normalizeKey(city)) return true;
    if (province && key === normalizeKey(province)) return true;
    if (barangay && key === normalizeKey(barangay)) return true;
    return false;
};

export const formatExactAddress = (value, options = {}) => {
    const parts = splitAddressParts(value)
        .filter((part) => !isNoisePart(part, {
            barangay: options.barangay,
            city: options.city || DEFAULT_CITY,
            province: options.province || DEFAULT_PROVINCE
        }));

    return removeDuplicateParts(parts).join(', ');
};

export const formatFullAddress = ({
    exactAddress,
    barangay,
    city = DEFAULT_CITY,
    province = DEFAULT_PROVINCE
} = {}) => {
    const cleanExact = formatExactAddress(exactAddress, { barangay, city, province });
    const parts = [
        cleanExact,
        barangay,
        city,
        province
    ].filter(Boolean);

    return removeDuplicateParts(parts).join(', ');
};

export const formatDisplayAddress = (record = {}) => formatFullAddress({
    exactAddress: record.exact_address || record.current_address || record.address || '',
    barangay: record.barangay || record.current_barangay || record.locality || '',
    city: record.city || DEFAULT_CITY,
    province: record.province || DEFAULT_PROVINCE
});
