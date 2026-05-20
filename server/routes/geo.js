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

const BRGY_ALIASES = [
    'LANGGAM',
    'CALENDOLA',
    'GSIS',
    'MAGSAYSAY',
    'SAMPAGUITA',
    'UBL',
    'UB',
    'LARAM',
    'ESTRELLA',
    'BAGONG SILANG',
    'RIVERSIDE',
    'NARRA'
];

const normalize = (value) => (value || '').toString().trim().toUpperCase();

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
    return BRGY_ALIASES.find((barangay) => normalized.includes(barangay)) || null;
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

    if (deduped.length > 0) {
        return deduped;
    }

    if (barangayGuess) {
        const center = BARANGAY_CENTERS[barangayGuess.replaceAll(' ', '_')];
        if (center) {
            const cleaned = stripMunicipalityTokens(q).replace(/\s*,\s*/g, ', ').trim();
            const label = cleaned && !normalize(cleaned).includes(barangayGuess)
                ? `${cleaned}, ${barangayGuess}, San Pedro, Laguna`
                : `${barangayGuess}, San Pedro, Laguna`;
            return [{
                display_name: label,
                lat: center.lat.toString(),
                lon: center.lng.toString(),
                address: {
                    barangay: barangayGuess
                }
            }];
        }
    }

    const cleaned = stripMunicipalityTokens(q).replace(/\s*,\s*/g, ', ').trim();
    if (cleaned) {
        return [{
            display_name: `${cleaned}, San Pedro, Laguna`,
            lat: '14.3325',
            lon: '121.0205',
            address: {
                barangay: barangayGuess
            }
        }];
    }

    return [];
};

const localReverse = async (lat, lon) => {
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
            address: {
                barangay: row.barangay,
                exact_address: row.exact_address,
                current_address: row.current_address,
                landmark: row.landmark,
                purok: row.purok
            }
        };
    }

    const barangayName = nearestBarangay(numericLat, numericLon);
    return {
        display_name: barangayName
            ? `Selected location near ${barangayName}, San Pedro, Laguna`
            : `Selected location, San Pedro, Laguna`,
        lat: numericLat.toString(),
        lon: numericLon.toString(),
        address: {
            barangay: barangayName || null
        }
    };
};

// GET /api/geo/search - Local-first autocomplete with external fallback
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Query parameter q is required' });
        }

        const localResults = await localSearch(q);
        if (localResults.length > 0) {
            return res.json(localResults);
        }

        try {
            const response = await axios.get('https://nominatim.openstreetmap.org/search', {
                params: {
                    q,
                    format: 'jsonv2',
                    addressdetails: 1,
                    limit: 5,
                    countrycodes: 'ph'
                },
                timeout: 4000,
                headers: {
                    'User-Agent': 'ImmuniCare-Thesis-App/1.0 (contact: support@immunicare.com)'
                }
            });

            return res.json(response.data || []);
        } catch (externalError) {
            console.warn('[GEO] External search unavailable, returning local fallback:', externalError.message);
            return res.json([]);
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
            const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                params: {
                    lat,
                    lon,
                    format: 'jsonv2',
                    addressdetails: 1
                },
                timeout: 4000,
                headers: {
                    'User-Agent': 'ImmuniCare-Thesis-App/1.0 (contact: support@immunicare.com)'
                }
            });

            return res.json(response.data || {});
        } catch (externalError) {
            console.warn('[GEO] External reverse unavailable, returning fallback:', externalError.message);
            return res.json(await localReverse(lat, lon));
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
