export const BARANGAY_COORDINATES = {
    'LANGGAM': { lat: 14.3261, lng: 121.0179, zoom: 17 },
    'CALENDOLA': { lat: 14.3416, lng: 121.0345, zoom: 17 },
    'GSIS': { lat: 14.3504, lng: 121.0399, zoom: 17 },
    'MAGSAYSAY': { lat: 14.3372, lng: 121.0332, zoom: 17 },
    'SAMPAGUITA': { lat: 14.3443, lng: 121.0353, zoom: 17 },
    'UBL': { lat: 14.3325, lng: 121.0205, zoom: 17 },
    'UB': { lat: 14.3335, lng: 121.0245, zoom: 17 },
    'LARAM': { lat: 14.3293, lng: 121.0232, zoom: 17 },
    'ESTRELLA': { lat: 14.3350, lng: 121.0195, zoom: 17 },
    'BAGONG SILANG': { lat: 14.3357, lng: 121.0265, zoom: 17 },
    'RIVERSIDE': { lat: 14.3290, lng: 121.0270, zoom: 17 },
    'NARRA': { lat: 14.3312, lng: 121.0259, zoom: 17 },
    'MUNICIPALITY': { lat: 14.3596, lng: 121.0426, zoom: 14 }
};

export const DEFAULT_MUNICIPAL_CENTER = BARANGAY_COORDINATES['MUNICIPALITY'];

export const getBarangayCenter = (barangayName) => {
    if (!barangayName) return DEFAULT_MUNICIPAL_CENTER;
    const normalized = barangayName.toUpperCase();
    return BARANGAY_COORDINATES[normalized] || DEFAULT_MUNICIPAL_CENTER;
};
