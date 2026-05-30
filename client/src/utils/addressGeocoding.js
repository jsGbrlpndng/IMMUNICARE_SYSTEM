const SAN_PEDRO_BOUNDS = {
    minLat: 14.30,
    maxLat: 14.39,
    minLng: 120.99,
    maxLng: 121.08
};

export const SAN_PEDRO_SYSTEM_BARANGAYS = [
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

const BARANGAY_ALIASES = [
    { canonical: 'LANGGAM', aliases: ['LANGGAM', 'LANNGAM'] },
    { canonical: 'UBL', aliases: ['UBL', 'UNITED BAYANIHAN', 'UNITED BETTER LIVING'] },
    { canonical: 'UB', aliases: ['UB', 'UNITED BAYANIHAN'] },
    { canonical: 'SAN ANTONIO', aliases: ['SAN ANTONIO'] },
    { canonical: 'SAN VICENTE', aliases: ['SAN VICENTE'] },
    { canonical: 'PACITA', aliases: ['PACITA'] },
    { canonical: 'NUEVA', aliases: ['NUEVA'] },
    { canonical: 'LANDAYAN', aliases: ['LANDAYAN'] },
    { canonical: 'CUYAB', aliases: ['CUYAB'] },
    { canonical: 'SAMPAGUITA', aliases: ['SAMPAGUITA'] },
    { canonical: 'ROSARIO', aliases: ['ROSARIO'] },
    { canonical: 'CALENDOLA', aliases: ['CALENDOLA'] },
    { canonical: 'MAGSAYSAY', aliases: ['MAGSAYSAY'] },
    { canonical: 'NARRA', aliases: ['NARRA'] },
    { canonical: 'CHRYSANTHEMUM', aliases: ['CHRYSANTHEMUM'] },
    { canonical: 'FATIMA', aliases: ['FATIMA'] },
    { canonical: 'GSIS', aliases: ['GSIS'] },
    { canonical: 'MAHARLIKA', aliases: ['MAHARLIKA'] },
    { canonical: 'RIVERSIDE', aliases: ['RIVERSIDE'] },
    { canonical: 'SAN LORENZO RUIZ', aliases: ['SAN LORENZO RUIZ'] },
    { canonical: 'SANTO NINO', aliases: ['SANTO NINO', 'SANTO NIÑO'] },
    { canonical: 'LARAM', aliases: ['LARAM'] },
    { canonical: 'ESTRELLA', aliases: ['ESTRELLA'] },
    { canonical: 'BAGONG SILANG', aliases: ['BAGONG SILANG'] }
];

const normalizeText = (value) => (value || '').toString().trim().toUpperCase();

const findBarangayAlias = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) return null;

    const match = BARANGAY_ALIASES.find(({ aliases }) => (
        aliases.some((alias) => normalized.includes(normalizeText(alias)))
    ));

    return match?.canonical || null;
};

const getAddressText = (address) => {
    if (!address) return '';
    if (typeof address === 'string') return address;

    return [
        address.display_name,
        address.address?.barangay,
        address.address?.suburb,
        address.address?.village,
        address.address?.neighbourhood,
        address.address?.quarter,
        address.address?.road,
        address.address?.exact_address,
        address.address?.current_address,
        address.address?.landmark,
        address.address?.purok,
        address.address?.city,
        address.address?.town,
        address.address?.municipality,
        address.address?.county,
        address.address?.state,
        address.address?.region,
        address.address?.country
    ].filter(Boolean).join(' ');
};

const hasStreetLikeText = (value) => {
    const text = normalizeText(value);
    return /\b(ST|STREET|ROAD|RD|AVENUE|AVE|DRIVE|DR|LANE|LN|BOULEVARD|BLVD|HIGHWAY|HWY|PHASE|BLOCK|BLK|LOT|PUROK|SITIO|SUBDIVISION|SUBD|VILLAGE|COMPOUND)\b/.test(text) ||
        /\b(BLOCK|BLK|LOT)\s*[0-9A-Z-]+/.test(text);
};

export const getAddressPrecision = (result, { clicked = false } = {}) => {
    const address = result?.address || {};
    const displayName = result?.display_name || '';
    const addressText = getAddressText(result);
    const type = normalizeText(result?.type || result?.class || result?.addresstype);

    if (address.house_number || address.house || /\b(HOUSE|LOT)\s*[0-9A-Z-]+/.test(normalizeText(displayName))) {
        return 'exact';
    }

    if (address.road || address.pedestrian || address.footway || address.path || hasStreetLikeText(addressText)) {
        return 'street';
    }

    if (
        address.amenity ||
        address.shop ||
        address.tourism ||
        address.leisure ||
        address.building ||
        ['AMENITY', 'SHOP', 'TOURISM', 'LEISURE', 'BUILDING', 'PLACE'].includes(type)
    ) {
        return clicked ? 'approximate' : 'street';
    }

    const barangay = getBarangayFromAddress(result);
    const compactParts = displayName.split(',').map((part) => normalizeText(part)).filter(Boolean);
    const isBarangayOnly = barangay && compactParts.length <= 6 && compactParts.some((part) => part === barangay);

    if (isBarangayOnly || result?.precision === 'barangay') {
        return clicked ? 'approximate' : 'barangay';
    }

    return clicked ? 'approximate' : 'approximate';
};

export const getBarangayFromAddress = (result) => {
    return findBarangayAlias(getAddressText(result));
};

export const isInsideSanPedro = (latOrResult, lngValue, addressValue) => {
    const resultMode = typeof latOrResult === 'object' && latOrResult !== null;
    const lat = Number(resultMode ? latOrResult.lat : latOrResult);
    const lng = Number(resultMode ? (latOrResult.lon ?? latOrResult.lng) : lngValue);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    const isInsideBounds =
        lat >= SAN_PEDRO_BOUNDS.minLat &&
        lat <= SAN_PEDRO_BOUNDS.maxLat &&
        lng >= SAN_PEDRO_BOUNDS.minLng &&
        lng <= SAN_PEDRO_BOUNDS.maxLng;

    if (!isInsideBounds) return false;

    const label = normalizeText(resultMode ? getAddressText(latOrResult) : addressValue);
    if (!label) return true;

    const hasSanPedroContext =
        label.includes('SAN PEDRO') ||
        label.includes('LAGUNA') ||
        label.includes('CALABARZON') ||
        label.includes('PHILIPPINES') ||
        Boolean(findBarangayAlias(label));

    return hasSanPedroContext || isInsideBounds;
};

export const normalizeAddressResult = (result) => {
    if (!result) return null;

    const lat = Number(result.lat);
    const lon = Number(result.lon ?? result.lng);
    const address = result.address || {};
    const displayName = result.display_name || [
        address.house_number,
        address.road,
        address.neighbourhood,
        address.suburb || address.village,
        address.city || address.town || address.municipality || 'San Pedro',
        address.state || 'Laguna',
        address.country || 'Philippines'
    ].filter(Boolean).join(', ');

    if (!displayName || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }

    return {
        ...result,
        display_name: displayName,
        lat,
        lon,
        barangay: getBarangayFromAddress(result),
        precision: result.precision || getAddressPrecision({ ...result, display_name: displayName })
    };
};

export const rankSuggestions = (results, query = '', assignedBarangay = '') => {
    const normalizedQuery = normalizeText(query);
    const assigned = normalizeText(assignedBarangay);

    return [...results]
        .filter(isInsideSanPedro)
        .sort((a, b) => {
            const aBarangay = normalizeText(a.barangay || getBarangayFromAddress(a));
            const bBarangay = normalizeText(b.barangay || getBarangayFromAddress(b));
            const aLabel = normalizeText(a.display_name);
            const bLabel = normalizeText(b.display_name);

            const score = (result, barangay, label) => {
                const insideAssigned = assigned && barangay === assigned;
                const exactMatch = normalizedQuery && label.includes(normalizedQuery);
                const precisionScore = {
                    exact: 0,
                    street: 1,
                    approximate: 2,
                    barangay: 3
                }[result.precision] ?? 2;

                return (insideAssigned ? 0 : 10) + (exactMatch ? 0 : 2) + precisionScore;
            };

            return score(a, aBarangay, aLabel) - score(b, bBarangay, bLabel);
        });
};

export const reverseGeocodeLatLng = async ({ apiClient, lat, lng, signal, clicked = false }) => {
    const response = await apiClient.get(`/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`, { signal });
    if (!response.ok) return null;

    const result = normalizeAddressResult(await response.json());
    return result && isInsideSanPedro(result)
        ? { ...result, precision: getAddressPrecision(result, { clicked }) }
        : null;
};
