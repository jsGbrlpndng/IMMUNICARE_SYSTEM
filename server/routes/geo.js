const express = require('express');
const axios = require('axios');
const db = require('../db');

const router = express.Router();

const BARANGAY_CENTERS = {
    LANGGAM: { lat: 14.3261, lng: 121.0179 },
    CALENDOLA: { lat: 14.3416, lng: 121.0345 },
    GSIS: { lat: 14.3504, lng: 121.0399 },
    MAGSAYSAY: { lat: 14.3372, lng: 121.0332 },
    SAMPAGUITA: { lat: 14.3443, lng: 121.0353 },
    UBL: { lat: 14.3325, lng: 121.0205 },
    UB: { lat: 14.3335, lng: 121.0245 },
    LARAM: { lat: 14.3293, lng: 121.0232 },
    ESTRELLA: { lat: 14.3350, lng: 121.0195 },
    BAGONG_SILANG: { lat: 14.3357, lng: 121.0265 },
    RIVERSIDE: { lat: 14.3290, lng: 121.0270 },
    NARRA: { lat: 14.3312, lng: 121.0259 }
};

const SYSTEM_BARANGAYS = [
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

const BRGY_ALIASES = [
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

const SAN_PEDRO_BOUNDS = {
    minLat: 14.30,
    maxLat: 14.39,
    minLon: 120.99,
    maxLon: 121.08
};

const normalize = (value) => (value || '').toString().trim().toUpperCase();

const findBarangayAlias = (value) => {
    const normalized = normalize(value);
    if (!normalized) return null;

    const match = BRGY_ALIASES.find(({ aliases }) => (
        aliases.some((alias) => normalized.includes(normalize(alias)))
    ));

    return match?.canonical || null;
};

const normalizeBarangayName = (value) => {
    const normalized = normalize(value).replace(/_/g, ' ');
    return findBarangayAlias(normalized) || normalized || null;
};

const getAddressText = (result) => {
    if (!result) return '';
    if (typeof result === 'string') return result;

    const address = result.address || {};
    return [
        result.display_name,
        address.barangay,
        address.suburb,
        address.village,
        address.neighbourhood,
        address.quarter,
        address.road,
        address.exact_address,
        address.current_address,
        address.landmark,
        address.purok,
        address.city,
        address.town,
        address.municipality,
        address.county,
        address.state,
        address.region,
        address.country
    ].filter(Boolean).join(' ');
};

const getBarangayFromAddress = (result) => {
    return findBarangayAlias(getAddressText(result));
};

const hasStreetLikeText = (value) => {
    const text = normalize(value);
    return /\b(ST|STREET|ROAD|RD|AVENUE|AVE|DRIVE|DR|LANE|LN|BOULEVARD|BLVD|HIGHWAY|HWY|PHASE|BLOCK|BLK|LOT|PUROK|SITIO|SUBDIVISION|SUBD|VILLAGE|COMPOUND)\b/.test(text) ||
        /\b(BLOCK|BLK|LOT)\s*[0-9A-Z-]+/.test(text);
};

const getAddressPrecision = (result, { clicked = false } = {}) => {
    const address = result?.address || {};
    const displayName = result?.display_name || '';
    const addressText = getAddressText(result);
    const type = normalize(result?.type || result?.class || result?.addresstype);

    if (address.house_number || address.house || /\b(HOUSE|LOT)\s*[0-9A-Z-]+/.test(normalize(displayName))) {
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
    const compactParts = displayName.split(',').map((part) => normalize(part)).filter(Boolean);
    const isBarangayOnly = barangay && compactParts.length <= 6 && compactParts.some((part) => part === barangay);

    if (isBarangayOnly || result?.precision === 'barangay') {
        return clicked ? 'approximate' : 'barangay';
    }

    return clicked ? 'approximate' : 'approximate';
};

const isInsideSanPedro = (latOrResult, lonValue, addressValue) => {
    const resultMode = typeof latOrResult === 'object' && latOrResult !== null;
    const lat = Number(resultMode ? latOrResult.lat : latOrResult);
    const lon = Number(resultMode ? latOrResult.lon : lonValue);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

    const isInsideBounds =
        lat >= SAN_PEDRO_BOUNDS.minLat &&
        lat <= SAN_PEDRO_BOUNDS.maxLat &&
        lon >= SAN_PEDRO_BOUNDS.minLon &&
        lon <= SAN_PEDRO_BOUNDS.maxLon;

    if (!isInsideBounds) return false;

    const label = normalize(resultMode ? getAddressText(latOrResult) : addressValue);
    if (!label) return true;

    const hasSanPedroContext =
        label.includes('SAN PEDRO') ||
        label.includes('LAGUNA') ||
        label.includes('CALABARZON') ||
        label.includes('PHILIPPINES') ||
        Boolean(findBarangayAlias(label));

    return hasSanPedroContext || isInsideBounds;
};

const normalizeAddressResult = (result) => {
    if (!result) return null;
    const lat = Number(result.lat);
    const lon = Number(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return {
        ...result,
        lat: lat.toString(),
        lon: lon.toString(),
        display_name: result.display_name,
        address: {
            ...(result.address || {}),
            barangay: getBarangayFromAddress(result)
        },
        precision: result.precision || getAddressPrecision(result)
    };
};

const rankSuggestions = (results, query = '', assignedBarangay = '') => {
    const normalizedQuery = normalize(stripMunicipalityTokens(query));
    const assigned = normalizeBarangayName(assignedBarangay);

    return [...results]
        .filter(isInsideSanPedro)
        .sort((a, b) => {
            const score = (result) => {
                const barangay = getBarangayFromAddress(result);
                const label = normalize(result.display_name);
                const inAssigned = assigned && barangay === assigned;
                const exactMatch = normalizedQuery && label.includes(normalizedQuery);
                const precisionScore = {
                    exact: 0,
                    street: 1,
                    approximate: 2,
                    barangay: 3
                }[result.precision] ?? 2;

                return (inAssigned ? 0 : 10) + (exactMatch ? 0 : 2) + precisionScore;
            };

            return score(a) - score(b);
        });
};

const stripMunicipalityTokens = (value) => (
    value
        .replace(/\bSAN PEDRO\b/gi, '')
        .replace(/\bLAGUNA\b/gi, '')
        .replace(/\bPHILIPPINES\b/gi, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+,/g, ',')
        .trim()
);

const buildSearchVariants = (query) => {
    const cleaned = stripMunicipalityTokens(query || '');
    const compact = cleaned.replace(/,/g, ' ').trim();
    const tokens = compact
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

    return Array.from(new Set([
        cleaned,
        compact,
        ...tokens
    ].filter(Boolean)));
};

const buildDisplayName = (row, fallbackBarangay = null) => {
    const pieces = [
        row.exact_address,
        row.current_address,
        row.landmark,
        row.purok ? `Purok ${row.purok}` : null,
        row.barangay || fallbackBarangay,
        'San Pedro, Laguna'
    ].filter(Boolean);

    return pieces.join(', ');
};

const guessBarangay = (query) => {
    const normalized = normalize(query);
    return findBarangayAlias(normalized);
};

const nearestBarangay = (lat, lng) => {
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [name, center] of Object.entries(BARANGAY_CENTERS)) {
        const distance = Math.hypot(lat - center.lat, lng - center.lng);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = name.replaceAll('_', ' ');
        }
    }

    return best;
};

const localSearch = async (q) => {
    const variants = buildSearchVariants(q);
    const barangayGuess = guessBarangay(q);

    if (variants.length === 0) {
        return [];
    }

    const variantTerms = variants.map((variant) => `%${variant}%`);
    const variantClause = variants.map(() => `
        COALESCE(exact_address, '') ILIKE ?
        OR COALESCE(current_address, '') ILIKE ?
        OR COALESCE(landmark, '') ILIKE ?
        OR COALESCE(purok, '') ILIKE ?
        OR COALESCE(barangay, '') ILIKE ?
    `).join(' OR ');
    const variantParams = variantTerms.flatMap((term) => [term, term, term, term, term]);

    const [rows] = await db.execute(
        `
        SELECT DISTINCT
            exact_address,
            current_address,
            landmark,
            purok,
            barangay,
            latitude,
            longitude
        FROM infants
        WHERE (${variantClause})
        ORDER BY barangay ASC, exact_address ASC
        LIMIT 10
        `,
        variantParams
    );

    const results = rows
        .map((row) => {
            const barangay = row.barangay || barangayGuess;
            const fallbackCenter = barangay ? BARANGAY_CENTERS[barangay.replaceAll(' ', '_')] : null;
            const lat = row.latitude || fallbackCenter?.lat || null;
            const lon = row.longitude || fallbackCenter?.lng || null;

            return {
            display_name: buildDisplayName(row),
            lat: lat != null ? lat.toString() : null,
            lon: lon != null ? lon.toString() : null,
            address: {
                barangay,
                exact_address: row.exact_address,
                current_address: row.current_address,
                landmark: row.landmark,
                purok: row.purok
            }
            };
        })
        .filter((row) => row.lat && row.lon);

    const deduped = [];
    const seen = new Set();
    for (const row of results) {
        const key = `${row.display_name}|${row.lat}|${row.lon}`;
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(row);
        }
    }

    if (deduped.length > 0) return deduped;

    if (barangayGuess && SYSTEM_BARANGAYS.includes(barangayGuess)) {
        const center = BARANGAY_CENTERS[barangayGuess.replaceAll(' ', '_')];
        if (center) {
            return [{
                display_name: `${barangayGuess}, San Pedro, Laguna, Calabarzon, Philippines`,
                lat: center.lat.toString(),
                lon: center.lng.toString(),
                precision: 'barangay',
                address: {
                    barangay: barangayGuess,
                    city: 'San Pedro',
                    state: 'Laguna',
                    country: 'Philippines'
                }
            }];
        }
    }

    return [];
};

const localReverse = async (lat, lon, { allowFallback = false } = {}) => {
    const numericLat = Number(lat);
    const numericLon = Number(lon);

    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLon)) {
        return null;
    }

    const [rows] = await db.execute(
        `
        SELECT
            exact_address,
            current_address,
            landmark,
            purok,
            barangay,
            latitude,
            longitude
        FROM infants
        WHERE ABS(latitude - ?) < 0.0005
          AND ABS(longitude - ?) < 0.0005
        ORDER BY ABS(latitude - ?) + ABS(longitude - ?) ASC
        LIMIT 1
        `,
        [numericLat, numericLon, numericLat, numericLon]
    );

    if (rows.length > 0) {
        const row = rows[0];
        return {
            display_name: buildDisplayName(row),
            lat: row.latitude?.toString() || numericLat.toString(),
            lon: row.longitude?.toString() || numericLon.toString(),
            precision: getAddressPrecision({
                display_name: buildDisplayName(row),
                address: {
                    barangay: row.barangay,
                    exact_address: row.exact_address,
                    current_address: row.current_address,
                    landmark: row.landmark,
                    purok: row.purok
                }
            }),
            address: {
                barangay: row.barangay,
                exact_address: row.exact_address,
                current_address: row.current_address,
                landmark: row.landmark,
                purok: row.purok
            }
        };
    }

    if (!allowFallback) return null;

    const barangayName = nearestBarangay(numericLat, numericLon);
    return {
        display_name: barangayName
            ? `Unnamed location, ${barangayName}, San Pedro, Laguna, Philippines`
            : `Unnamed location, San Pedro, Laguna, Philippines`,
        lat: numericLat.toString(),
        lon: numericLon.toString(),
        precision: 'approximate',
        address: {
            barangay: barangayName || null,
            city: 'San Pedro',
            state: 'Laguna',
            country: 'Philippines'
        }
    };
};

const externalSearch = async (q, assignedBarangay = '', scope = {}) => {
    const cleaned = stripMunicipalityTokens(q);
    const barangay = normalizeBarangayName(assignedBarangay);
    const city = scope.city || 'San Pedro';
    const state = scope.state || 'Laguna';
    const country = scope.country || 'Philippines';
    const addressdetails = scope.addressdetails || 1;
    const baseQueries = Array.from(new Set([
        cleaned,
        cleaned && !/\bSTREET\b/i.test(cleaned) ? `${cleaned} Street` : null
    ].filter(Boolean)));

    const scopedQueries = baseQueries.flatMap((baseQuery) => {
        const cityQuery = baseQuery;
        return barangay
            ? [[baseQuery, barangay].join(', '), cityQuery]
            : [cityQuery];
    });

    const results = [];
    for (const query of Array.from(new Set(scopedQueries))) {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                street: query,
                city,
                state,
                country,
                format: 'jsonv2',
                addressdetails,
                limit: 10,
                countrycodes: 'ph',
                viewbox: `${SAN_PEDRO_BOUNDS.minLon},${SAN_PEDRO_BOUNDS.maxLat},${SAN_PEDRO_BOUNDS.maxLon},${SAN_PEDRO_BOUNDS.minLat}`,
                bounded: 1
            },
            timeout: 4000,
            headers: {
                'User-Agent': 'ImmuniCare-Thesis-App/1.0 (contact: support@immunicare.com)'
            }
        });

        results.push(...(response.data || []));
    }

    const seen = new Set();
    return results.filter((result) => {
        const key = `${result.place_id || ''}|${result.display_name}|${result.lat}|${result.lon}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const externalReverse = async (lat, lon) => {
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
            lat,
            lon,
            format: 'jsonv2',
            addressdetails: 1,
            zoom: 18
        },
        timeout: 4000,
        headers: {
            'User-Agent': 'ImmuniCare-Thesis-App/1.0 (contact: support@immunicare.com)'
        }
    });

    const result = normalizeAddressResult(response.data);
    return result ? { ...result, precision: getAddressPrecision(result, { clicked: true }) } : null;
};

// GET /api/geo/search - Local-first autocomplete with external fallback
router.get('/search', async (req, res) => {
    try {
        const { q, barangay, city = 'San Pedro', state = 'Laguna', country = 'Philippines', addressdetails = '1' } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Query parameter q is required' });
        }

        const localResults = await localSearch(q);

        try {
            const externalResults = await externalSearch(q, barangay, { city, state, country, addressdetails });
            const merged = [...localResults, ...externalResults]
                .map(normalizeAddressResult)
                .filter(Boolean);
            const ranked = rankSuggestions(merged, q, barangay);

            return res.json(ranked);
        } catch (externalError) {
            console.warn('[GEO] External search unavailable, returning local matches only:', externalError.message);
            return res.json(rankSuggestions(localResults.map(normalizeAddressResult).filter(Boolean), q, barangay));
        }
    } catch (error) {
        console.error('[GEO ERROR]', error.message);
        res.status(500).json({
            success: false,
            error: 'Geocoding service error',
            details: error.message
        });
    }
});

// GET /api/geo/reverse - Local-first reverse geocoding with external fallback
router.get('/reverse', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Parameters lat and lon are required' });
        }

        const localResult = await localReverse(lat, lon);
        if (localResult) {
            return res.json(localResult);
        }

        try {
            const externalResult = await externalReverse(lat, lon);
            if (externalResult && isInsideSanPedro(externalResult)) {
                return res.json(externalResult);
            }

            const fallback = await localReverse(lat, lon, { allowFallback: true });
            return res.json(fallback);
        } catch (externalError) {
            console.warn('[GEO] External reverse unavailable, returning fallback:', externalError.message);
            return res.json(await localReverse(lat, lon, { allowFallback: true }));
        }
    } catch (error) {
        console.error('[GEO REVERSE ERROR]', error.message);
        res.status(500).json({
            success: false,
            error: 'Reverse geocoding service error',
            details: error.message
        });
    }
});

module.exports = router;
