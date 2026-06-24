/**
 * DBSCAN Spatial Clustering Service
 * 
 * Implements the DBSCAN (Density-Based Spatial Clustering of Applications with Noise)
 * algorithm to identify geographic clusters of under-immunized infants based on
 * Haversine distance.
 */

const { MIN_CLUSTER_INFANTS } = require('../../config/constants/domain');

class DBSCANService {
    /**
     * @param {number} epsilonMeters - Maximum distance between two points to be considered neighbors (in meters)
     * @param {number} minPts - Minimum number of points to form a dense region
     * @param {object} db - Database connection client
     */
    constructor(epsilonMeters = 300, minPts = 3, db = null) {
        this.epsilonMeters = parseInt(epsilonMeters, 10) || 300;
        this.epsilonKm = this.epsilonMeters / 1000;
        this.minPts = Math.max(parseInt(minPts, 10) || MIN_CLUSTER_INFANTS, MIN_CLUSTER_INFANTS);
        this.db = db;
    }

    /**
     * Calculate Haversine distance between two points in kilometers
     * Deprecated for main clustering but preserved for medoid calculation
     */
    static getDistance(pt1, pt2) {
        const R = 6371; // Earth's radius in km
        const dLat = (pt2.lat - pt1.lat) * (Math.PI / 180);
        const dLon = (pt2.lng - pt1.lng) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(pt1.lat * (Math.PI / 180)) * Math.cos(pt2.lat * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Run DBSCAN clustering using PostGIS ST_ClusterDBSCAN in the database.
     * Evaluates clusters at a global/municipal level first to prevent the boundary blindspot,
     * or restricts to a specific barangay if parameter is provided.
     *
     * @param {object} dbConnection - Active database connection client
     * @param {Array} points - Array of objects with {id, lat, lng, ...otherData}
     * @param {string|null} barangay - Optional barangay filter to enforce local-only clustering
     * @returns {Promise<Array>} - Array of clusters
     */
    async cluster(dbConnection, points = null, barangay = null) {
        const conn = dbConnection || this.db;
        if (!conn) {
            console.warn('[DBSCAN] No DB connection. Falling back to empty clusters.');
            return [];
        }

        try {
            if (!points || points.length <= 1) return [];

            let epsVal = this.epsilonMeters;
            let minPtsVal = this.minPts;

            // 1. Fetch dynamic settings
            const [settings] = await conn.execute(`
                SELECT setting_key, setting_value 
                FROM system_settings 
                WHERE setting_key IN ('dbscan_epsilon_meters', 'dbscan_min_points')
            `);

            const settingsMap = {};
            if (Array.isArray(settings)) {
                settings.forEach(s => {
                    settingsMap[s.setting_key] = s.setting_value;
                });
            }

            // Only use database settings if parameters were not custom overridden
            if (this.epsilonMeters === 300 && settingsMap['dbscan_epsilon_meters']) {
                epsVal = parseInt(settingsMap['dbscan_epsilon_meters'], 10) || 300;
            }
            if (this.minPts === 3 && settingsMap['dbscan_min_points']) {
                minPtsVal = parseInt(settingsMap['dbscan_min_points'], 10) || 3;
            }

            // Filter out invalid coordinates
            const validPoints = points.filter(p =>
                p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
            );

            if (validPoints.length <= 1) return [];

            // 2. Execute global or barangay-scoped PostGIS DBSCAN clustering.
            // Performs ST_ClusterDBSCAN at a global/municipal level or barangay-scoped level.
            const dbscanQuery = `
                WITH map_defaulters AS (
                    SELECT 
                        i.id,
                        i.location
                    FROM infants i
                    LEFT JOIN infant_schedules s ON i.id = s.infant_id
                        AND s.status::text NOT IN ('COMPLETED', 'INELIGIBLE', 'EXPIRED', 'PENDING_VALIDATION')
                    WHERE i.status = 'Active'
                      AND i.latitude IS NOT NULL
                      AND i.longitude IS NOT NULL
                      ${barangay ? 'AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))' : ''}
                    GROUP BY i.id, i.location
                    HAVING COALESCE(
                        MAX(CASE WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date < CURRENT_DATE THEN 'DEFAULTER' END),
                        'COMPLETED'
                    ) = 'DEFAULTER'
                ),
                clustered_defaulters AS (
                    SELECT 
                        id,
                        ST_ClusterDBSCAN(ST_Transform(location, 32651), ?, ?) OVER () AS cluster_id
                    FROM map_defaulters
                )
                SELECT id, cluster_id 
                FROM clustered_defaulters
            `;

            const queryParams = [];
            if (barangay) {
                queryParams.push(barangay);
            }
            queryParams.push(epsVal, minPtsVal);

            const [dbscanRows] = await conn.execute(dbscanQuery, queryParams);

            const clusterMap = new Map();
            if (Array.isArray(dbscanRows)) {
                dbscanRows.forEach(row => {
                    clusterMap.set(row.id, row.cluster_id);
                });
            }

            // Map database cluster IDs back to the passed points
            const dataset = validPoints.map(p => {
                const cid = clusterMap.get(p.id);
                return {
                    ...p,
                    clusterId: (cid !== undefined && cid !== null) ? cid : (clusterMap.has(p.id) ? 'NOISE' : null)
                };
            });

            // Group into actual cluster arrays
            const clusters = {};
            for (const p of dataset) {
                if (p.clusterId !== null && p.clusterId !== 'NOISE' && p.clusterId !== undefined) {
                    if (!clusters[p.clusterId]) clusters[p.clusterId] = [];
                    clusters[p.clusterId].push(p);
                }
            }

            return Object.values(clusters);
        } catch (error) {
            console.error('[DBSCAN PostGIS Error]', error);
            return [];
        }
    }

    /**
     * Compute cluster metadata (medoid, count, risks)
     */
    static getClusterMetadata(cluster) {
        if (!cluster || cluster.length === 0) return null;

        let zeroDose = 0;
        let underImmunized = 0;

        // Find Medoid
        let minTotalDistance = Infinity;
        let medoid = null;

        for (let i = 0; i < cluster.length; i++) {
            const pt1 = cluster[i];

            if (pt1.is_zero_dose || pt1.is_zero_dose === true) zeroDose++;
            if (pt1.is_under_immunized || pt1.is_under_immunized === true) underImmunized++;

            let totalDistance = 0;
            for (let j = 0; j < cluster.length; j++) {
                if (i === j) continue;
                totalDistance += DBSCANService.getDistance(pt1, cluster[j]);
            }

            if (totalDistance < minTotalDistance) {
                minTotalDistance = totalDistance;
                medoid = pt1;
            }
        }

        if (!medoid) medoid = cluster[0];

        return {
            medoid_lat: medoid.lat,
            medoid_lng: medoid.lng,
            medoid_infant_id: medoid.id,
            medoid_patient_name: medoid.patient_name || `${medoid.first_name} ${medoid.last_name}`.trim(),
            pointCount: cluster.length,
            zeroDoseCount: zeroDose,
            underImmunizedCount: underImmunized,
            totalRiskScore: zeroDose * 2 + underImmunized
        };
    }
}

module.exports = DBSCANService;
