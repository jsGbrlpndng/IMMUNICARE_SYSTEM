// Populate this map with official barangay GeoJSON Feature or FeatureCollection
// records when the political boundary dataset is available. Until then, map
// components intentionally render no fake rectangle boundary.
export const BARANGAY_BOUNDARY_GEOJSON = {};

export const getBarangayBoundaryGeoJson = (barangay) => {
    if (!barangay) return null;
    const key = barangay.toString().trim().toUpperCase();
    return BARANGAY_BOUNDARY_GEOJSON[key] || null;
};

export const barangayBoundaryStyle = {
    color: '#166534',
    weight: 3,
    fillColor: '#16a34a',
    fillOpacity: 0.04
};
