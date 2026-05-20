/**
 * Spatial Utilities for Heatmap Rendering
 */

/**
 * Computes the Convex Hull of a set of points using the Monotone Chain algorithm.
 * @param {Array} points - Array of {lat, lng} objects
 * @returns {Array} - Array of [lat, lng] coordinates forming the hull
 */
export function computeConvexHull(points) {
    if (!points || points.length < 3) return points.map(p => [p.lat, p.lng]);

    // Sort points by longitude (x), then latitude (y)
    const sorted = [...points].sort((a, b) => a.lng !== b.lng ? a.lng - b.lng : a.lat - b.lat);

    const crossProduct = (a, b, c) => {
        return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
    };

    // Build lower hull
    const lower = [];
    for (const p of sorted) {
        while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }

    // Build upper hull
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }

    // Concatenate lower and upper hull (remove last point of each as it's repeated)
    lower.pop();
    upper.pop();
    return lower.concat(upper).map(p => [p.lat, p.lng]);
}

/**
 * Computes the distance between two points in meters using Haversine formula
 */
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}
