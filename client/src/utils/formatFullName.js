const sanitizeNamePart = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (['NONE', 'N/A', 'NA', 'NULL'].includes(normalized.toUpperCase())) {
        return '';
    }
    return normalized;
};

export const formatFullName = (firstName, middleName, lastName, hasNoMiddleName = false, suffix = '') =>
    [sanitizeNamePart(firstName), hasNoMiddleName ? '' : sanitizeNamePart(middleName), sanitizeNamePart(lastName), sanitizeNamePart(suffix)]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ');

export const formatFullNameFromObject = (person = {}) =>
    formatFullName(
        person.first_name,
        person.middle_name,
        person.last_name,
        person.has_no_middle_name === true,
        person.suffix
    );
