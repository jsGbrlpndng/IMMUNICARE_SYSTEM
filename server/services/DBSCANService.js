/**
 * DBSCAN Spatial Clustering Service
 * 
 * Implements the DBSCAN (Density-Based Spatial Clustering of Applications with Noise)
 * algorithm to identify geographic clusters of under-immunized infants based on
 * Haversine distance.
 */

class DBSCANService {
    /**
     * @param {number} epsilonMeters - Maximum distance between two points to be considered neighbors (in meters)
     * @param {number} minPts - Minimum number of points to form a dense region
     */
    constructor(epsilonMeters = 300, minPts = 3) {
        this.epsilonMeters = epsilonMeters;
        this.epsilonKm = epsilonMeters / 1000;
        this.minPts = minPts;
    }

    /**
     * Calculate Haversine distance between two points in kilometers
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
     * Run DBSCAN clustering on an array of points
     * @param {Array} points - Array of objects with {lat, lng, ...otherData}
     * @returns {Array} - Array of clusters
     */
    cluster(points) {
        try {
            if (!points || points.length <= 1) return []; // Robustness: return empty for small datasets
            
            let currentCluster = 0;
            
            // Filter out invalid coordinates
            const validPoints = points.filter(p => 
                p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
            );

            if (validPoints.length <= 1) return [];

            const dataset = validPoints.map(p => ({
                ...p,
                visited: false,
                clusterId: null,
                isCore: false
            }));

            const getNeighbors = (pointIndex) => {
                const neighbors = [];
                for (let i = 0; i < dataset.length; i++) {
                    if (i === pointIndex) continue;
                    if (DBSCANService.getDistance(dataset[pointIndex], dataset[i]) <= this.epsilonKm) {
                        neighbors.push(i);
                    }
                }
                return neighbors;
            };

            for (let i = 0; i < dataset.length; i++) {
                const p = dataset[i];
                if (p.visited) continue;

                p.visited = true;
                const neighbors = getNeighbors(i);

                if (neighbors.length >= this.minPts - 1) { // Neighbors doesn't include self, so -1
                    currentCluster++;
                    p.clusterId = currentCluster;
                    p.isCore = true;
                    this._expandCluster(dataset, neighbors, currentCluster, getNeighbors);
                } else {
                    p.clusterId = 'NOISE';
                }
            }

            // Group into actual cluster arrays
            const clusters = {};
            for (const p of dataset) {
                if (p.clusterId !== null && p.clusterId !== 'NOISE') {
                    if (!clusters[p.clusterId]) clusters[p.clusterId] = [];
                    clusters[p.clusterId].push(p);
                }
            }

            return Object.values(clusters);
        } catch (error) {
            console.error('[DBSCAN Error]', error);
            return []; // Graceful fallback
        }
    }

    _expandCluster(dataset, neighbors, clusterId, getNeighbors) {
        for (let i = 0; i < neighbors.length; i++) {
            const neighborIdx = neighbors[i];
            const np = dataset[neighborIdx];
            
            if (!np.visited) {
                np.visited = true;
                const newNeighbors = getNeighbors(neighborIdx);
                if (newNeighbors.length >= this.minPts - 1) {
                    np.isCore = true;
                    for (const n of newNeighbors) {
                        if (!neighbors.includes(n)) {
                            neighbors.push(n);
                        }
                    }
                }
            }
            
            if (np.clusterId === null || np.clusterId === 'NOISE') {
                np.clusterId = clusterId;
            }
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
            
            if (pt1.is_zero_dose) zeroDose++;
            if (pt1.is_under_immunized) underImmunized++;

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


module.exports = DBSCANService;
