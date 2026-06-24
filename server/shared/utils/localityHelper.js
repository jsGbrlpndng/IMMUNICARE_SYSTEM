/**
 * shared locality-mapping function used across all relevant backend/dashboard routes
 * Standardizes brittle address strings like "SJV", "St Joseph", "Saint Joseph" into "St. Joseph"
 */

const LOCALITY_MAP = {
    'st joseph': 'St. Joseph',
    'st. joseph': 'St. Joseph',
    'saint joseph': 'St. Joseph',
    'sjv': 'St. Joseph',
    'st. joseph village': 'St. Joseph',
    'genesis': 'Genesis',
    'filinvest': 'Filinvest',
    'holiday hills': 'Holiday Hills'
};

/**
 * Normalizes a locality name or extracts it from an address string
 * @param {string} locality - Raw locality field
 * @param {string} address - Optional address string to extract from
 * @returns {string} Normalized locality
 */
function normalizeLocality(locality, address = '') {
    const rawLocality = (locality || '').toLowerCase().trim();
    
    // 1. Check direct map
    if (LOCALITY_MAP[rawLocality]) {
        return LOCALITY_MAP[rawLocality];
    }

    // 2. Extract from address if locality is generic or empty
    const addr = (address || '').toLowerCase();
    for (const [key, normalized] of Object.entries(LOCALITY_MAP)) {
        if (addr.includes(key)) {
            return normalized;
        }
    }

    // 3. Handle Purok patterns
    if (rawLocality.includes('purok')) {
        const match = rawLocality.match(/purok\s*(\d+)/);
        if (match) return `Purok ${match[1]}`;
    }

    // 4. Default fallbacks
    if (rawLocality) {
        return rawLocality.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    return 'Langgam Proper';
}

/**
 * SQL snippet for consistent locality normalization in PostgreSQL
 */
const getLocalitySQL = (exactAddressField = 'exact_address', purokField = 'purok') => {
    return `
        CASE 
            WHEN ${exactAddressField} ILIKE '%St. Joseph%' OR ${exactAddressField} ILIKE '%SJV%' OR ${exactAddressField} ILIKE '%Saint Joseph%' THEN 'St. Joseph'
            WHEN ${exactAddressField} ILIKE '%Genesis%' THEN 'Genesis'
            WHEN ${exactAddressField} ILIKE '%Filinvest%' THEN 'Filinvest'
            WHEN ${exactAddressField} ILIKE '%Holiday Hills%' THEN 'Holiday Hills'
            WHEN ${purokField} IS NOT NULL AND ${purokField}::text ~ '^\\d+$' THEN 'Purok ' || ${purokField}
            WHEN ${purokField} IS NOT NULL THEN ${purokField}
            ELSE 'Langgam Proper'
        END
    `;
};

// ─── Private helpers for dose-weighted cluster label derivation ───────────────

/**
 * Extracts a specific street-level label from an address string.
 * Returns null if the best candidate is only a sub-locality/zone identifier
 * (e.g. "Saint Joseph 9" ends in a digit → treated as sub-locality, not a street).
 */
function _extractStreetLabel(pt) {
    if (!pt.exact_address) return null;
    const parts = pt.exact_address.split(',').map(s => s.trim()).filter(s => s);
    for (const part of parts) {
        let clean = part
            .replace(/^(blk|block|lot|b|l)\.?\s*\d+(\s*(and|&|\/|-)\s*(lot|l)\.?\s*\d+)?\s*/i, '')
            .replace(/^\d+[a-z]?\s+/i, '')
            .trim();
        const lower = clean.toLowerCase();
        if (!clean || clean.length <= 2) continue;
        if (lower === 'langgam' || lower.includes('san pedro') ||
            lower === 'laguna' || lower === 'philippines') continue;
        // Sub-locality zone identifiers end in a bare digit — skip for street ranking
        if (/\d+$/.test(clean)) continue;
        return clean;
    }
    return null;
}

/** Haversine distance in km between two lat/lng coordinate pairs */
function _haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Medoid: the cluster member with minimum total Haversine distance to all others */
function _findMedoid(points) {
    const valid = points.filter(p => p.lat != null && p.lng != null && p.lat !== 0);
    if (valid.length === 0) return null;
    if (valid.length === 1) return valid[0];
    let medoid = null, minTotal = Infinity;
    for (const p of valid) {
        const total = valid.reduce((sum, o) => sum + _haversineKm(p.lat, p.lng, o.lat, o.lng), 0);
        if (total < minTotal) { minTotal = total; medoid = p; }
    }
    return medoid;
}

/**
 * Sub-locality fallback: used when no specific street names are parseable.
 * Picks the sub-locality with the highest total overdue dose burden.
 */
function _subLocalityFallback(clusterPoints) {
    const tally = {};
    clusterPoints.forEach(pt => {
        if (!pt.exact_address) return;
        const parts = pt.exact_address.split(',').map(s => s.trim()).filter(s => s);
        for (let i = 1; i < parts.length; i++) {
            const p = parts[i], lower = p.toLowerCase();
            if (lower.includes('langgam') || lower.includes('laguna') ||
                lower.includes('san pedro') || lower.includes('philippines') ||
                /^\d{4}$/.test(p)) continue;
            if (p.length > 2) {
                tally[p] = (tally[p] || 0) + (pt.vaccination_needs || []).length;
                break;
            }
        }
    });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : 'Priority Outreach Area';
}

// ─── Public labeling function (Strategy 1: Dose-Weighted Top-2) ──────────────

/**
 * Derives a clinically meaningful cluster label using dose-weighted street ranking.
 *
 * Algorithm:
 *  1. Extract specific street name from each cluster member's exact_address.
 *     Sub-locality identifiers (e.g. "Saint Joseph 9") are excluded from street ranking.
 *  2. Sum the total number of overdue/defaulter doses per street (via vaccination_needs).
 *  3. Sort streets: total dose burden DESC, then distance to cluster medoid ASC (tie-break only).
 *  4. Return "Near [Street1] & [Street2]" for the top two dose-burden streets.
 *  5. If only one street is found, return "Near [Street1]".
 *  6. If no street names are parseable, fall back to sub-locality by dose burden.
 *
 * No alphabetical ordering is used at any stage.
 *
 * @param {Array} clusterPoints - Enriched infant objects with exact_address, vaccination_needs, lat, lng
 * @returns {string} Human-readable, clinically grounded cluster label
 */
function deriveClusterLabel(clusterPoints) {
    if (!clusterPoints || clusterPoints.length === 0) return 'Priority Outreach Area';

    const medoid = _findMedoid(clusterPoints);
    const streetMap = {};

    clusterPoints.forEach(pt => {
        const street = _extractStreetLabel(pt);
        if (!street) return;

        const doses = (pt.vaccination_needs || []).length;
        if (!streetMap[street]) {
            streetMap[street] = { street, totalDoses: 0, minDistToMedoidKm: Infinity };
        }
        streetMap[street].totalDoses += doses;

        // Track minimum distance of any member on this street to the medoid (for tie-breaking)
        if (medoid && pt.lat != null && pt.lng != null && medoid.lat != null && medoid.lng != null) {
            const dist = _haversineKm(pt.lat, pt.lng, medoid.lat, medoid.lng);
            if (dist < streetMap[street].minDistToMedoidKm) {
                streetMap[street].minDistToMedoidKm = dist;
            }
        }
    });

    const streets = Object.values(streetMap);

    // No extractable street names → fall back to sub-locality
    if (streets.length === 0) return _subLocalityFallback(clusterPoints);

    // Sort: dose burden DESC, then proximity to medoid ASC (no alphabetical tie-break)
    streets.sort((a, b) => {
        if (b.totalDoses !== a.totalDoses) return b.totalDoses - a.totalDoses;
        return a.minDistToMedoidKm - b.minDistToMedoidKm;
    });

    if (streets.length === 1) return `Near ${streets[0].street}`;
    return `Near ${streets[0].street} & ${streets[1].street}`;
}

/**
 * Formats a granular locality string combining street/sitio and broad zone.
 * @param {Object} infant - Infant object with exact_address and purok
 * @returns {string} Granular locality string
 */
function formatGranularLocality(infant) {
    const address = infant.exact_address || '';
    const zone = normalizeLocality(infant.purok, infant.exact_address);
    
    // Aggressive extraction: Take the first part of the address as the "street/sitio"
    const parts = address.split(',').map(s => s.trim()).filter(s => s);
    const street = parts.length > 0 ? parts[0] : null;

    // Concatenate if street exists and isn't identical to the zone
    if (street && street.toLowerCase() !== zone.toLowerCase()) {
        return `${street}, ${zone}`;
    }
    
    return zone;
}

module.exports = {
    normalizeLocality,
    getLocalitySQL,
    deriveClusterLabel,
    formatGranularLocality,
    LOCALITY_MAP
};
