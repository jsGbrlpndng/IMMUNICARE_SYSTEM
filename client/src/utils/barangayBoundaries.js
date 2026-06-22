import { normalizeBarangayKey } from './barangayCanonical';

// Approximate prototype polygons only. Replace with official LGU/RHU GeoJSON/KML/shapefile data before claiming production-level boundary accuracy.
const createBoundaryFeature = (name, coordinates) => ({
    type: 'Feature',
    properties: { name },
    geometry: {
        type: 'Polygon',
        coordinates: [coordinates]
    }
});

export const BARANGAY_BOUNDARY_GEOJSON = {
    'BAGONG SILANG': createBoundaryFeature('BAGONG SILANG', [
        [121.0242, 14.3327],
        [121.0290, 14.3329],
        [121.0304, 14.3350],
        [121.0291, 14.3384],
        [121.0247, 14.3386],
        [121.0228, 14.3359],
        [121.0242, 14.3327]
    ]),
    CALENDOLA: createBoundaryFeature('CALENDOLA', [
        [121.0314, 14.3387],
        [121.0372, 14.3390],
        [121.0391, 14.3417],
        [121.0368, 14.3450],
        [121.0320, 14.3448],
        [121.0298, 14.3415],
        [121.0314, 14.3387]
    ]),
    ESTRELLA: createBoundaryFeature('ESTRELLA', [
        [121.0168, 14.3322],
        [121.0219, 14.3324],
        [121.0234, 14.3351],
        [121.0211, 14.3379],
        [121.0165, 14.3377],
        [121.0147, 14.3350],
        [121.0168, 14.3322]
    ]),
    GSIS: createBoundaryFeature('GSIS', [
        [121.0365, 14.3473],
        [121.0437, 14.3475],
        [121.0456, 14.3508],
        [121.0431, 14.3540],
        [121.0369, 14.3537],
        [121.0348, 14.3505],
        [121.0365, 14.3473]
    ]),
    LANGGAM: createBoundaryFeature('LANGGAM', [
        [121.0110, 14.3219],
        [121.0216, 14.3223],
        [121.0250, 14.3268],
        [121.0211, 14.3312],
        [121.0127, 14.3308],
        [121.0086, 14.3264],
        [121.0110, 14.3219]
    ]),
    LARAM: createBoundaryFeature('LARAM', [
        [121.0199, 14.3262],
        [121.0268, 14.3265],
        [121.0285, 14.3294],
        [121.0264, 14.3324],
        [121.0201, 14.3321],
        [121.0180, 14.3291],
        [121.0199, 14.3262]
    ]),
    MAGSAYSAY: createBoundaryFeature('MAGSAYSAY', [
        [121.0300, 14.3342],
        [121.0362, 14.3345],
        [121.0380, 14.3374],
        [121.0357, 14.3405],
        [121.0304, 14.3401],
        [121.0282, 14.3371],
        [121.0300, 14.3342]
    ]),
    NARRA: createBoundaryFeature('NARRA', [
        [121.0227, 14.3284],
        [121.0288, 14.3287],
        [121.0304, 14.3314],
        [121.0280, 14.3344],
        [121.0228, 14.3341],
        [121.0208, 14.3311],
        [121.0227, 14.3284]
    ]),
    RIVERSIDE: createBoundaryFeature('RIVERSIDE', [
        [121.0242, 14.3261],
        [121.0303, 14.3264],
        [121.0318, 14.3290],
        [121.0295, 14.3318],
        [121.0240, 14.3315],
        [121.0223, 14.3288],
        [121.0242, 14.3261]
    ]),
    SAMPAGUITA: createBoundaryFeature('SAMPAGUITA', [
        [121.0322, 14.3412],
        [121.0389, 14.3415],
        [121.0406, 14.3445],
        [121.0384, 14.3476],
        [121.0327, 14.3473],
        [121.0304, 14.3441],
        [121.0322, 14.3412]
    ]),
    UB: createBoundaryFeature('UB', [
        [121.0213, 14.3306],
        [121.0273, 14.3309],
        [121.0290, 14.3336],
        [121.0267, 14.3365],
        [121.0212, 14.3362],
        [121.0194, 14.3333],
        [121.0213, 14.3306]
    ]),
    UBL: createBoundaryFeature('UBL', [
        [121.0173, 14.3295],
        [121.0237, 14.3298],
        [121.0254, 14.3327],
        [121.0231, 14.3356],
        [121.0175, 14.3354],
        [121.0153, 14.3323],
        [121.0173, 14.3295]
    ])
};

export const getBarangayBoundaryGeoJson = (barangay) => {
    if (!barangay) return null;
    const key = normalizeBarangayKey(barangay);
    const feature = BARANGAY_BOUNDARY_GEOJSON[key];
    if (!feature?.geometry?.coordinates?.[0]?.length) return null;
    return feature;
};

export const isPointInBarangayBoundary = (lat, lng, barangay) => {
    const feature = getBarangayBoundaryGeoJson(barangay);
    const polygon = feature?.geometry?.coordinates?.[0];
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!polygon?.length || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return false;
    }

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];
        const intersects = ((yi > latitude) !== (yj > latitude)) &&
            (longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi);

        if (intersects) inside = !inside;
    }

    return inside;
};

export const getBarangayNameForPoint = (lat, lng) => {
    const entries = Object.keys(BARANGAY_BOUNDARY_GEOJSON);
    return entries.find((barangay) => isPointInBarangayBoundary(lat, lng, barangay)) || null;
};

export const barangayBoundaryStyle = {
    color: '#059669',
    weight: 2,
    opacity: 1,
    fillColor: '#10b981',
    fillOpacity: 0.1
};
