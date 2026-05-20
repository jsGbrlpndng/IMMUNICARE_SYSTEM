const DBSCANService = require('./DBSCANService');

class DBSCANOptimizer {
    constructor(points) {
        this.points = points;
    }

    /**
     * Compute approximate silhouette score for clusters
     * Adapt for DBSCAN by assigning penalty to noise
     */
    computeSilhouette(clusters, noisePoints) {
        let totalScore = 0;
        let totalPointsInClusters = 0;

        for (let i = 0; i < clusters.length; i++) {
            const cluster = clusters[i];
            if (cluster.length <= 1) continue;
            
            for (const pt of cluster) {
                // a: avg distance to other points in SAME cluster
                let sumA = 0;
                for (const other of cluster) {
                    if (pt !== other) sumA += DBSCANService.getDistance(pt, other);
                }
                const a = sumA / (cluster.length - 1);

                // b: min avg distance to points in OTHER clusters
                let minB = Infinity;
                for (let j = 0; j < clusters.length; j++) {
                    if (i === j) continue;
                    let sumB = 0;
                    for (const other of clusters[j]) {
                        sumB += DBSCANService.getDistance(pt, other);
                    }
                    const b = sumB / clusters[j].length;
                    if (b < minB) minB = b;
                }
                
                if (minB === Infinity) minB = a; // Only one cluster

                const s = (minB - a) / Math.max(a, minB) || 0;
                totalScore += s;
                totalPointsInClusters++;
            }
        }

        const avgS = totalPointsInClusters > 0 ? totalScore / totalPointsInClusters : -1;
        
        // Noise penalty
        const noiseRatio = this.points.length > 0 ? noisePoints / this.points.length : 0;
        
        // Adjust score down based on noise ratio
        return avgS * (1 - noiseRatio);
    }

    sweep(epsilons = [50, 100, 150, 200, 300], minPtsArr = [2, 3, 5, 10]) {
        const results = [];
        
        const validPointsCount = this.points.filter(p => 
            p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
        ).length;

        for (const eps of epsilons) {
            for (const minPts of minPtsArr) {
                const dbscan = new DBSCANService(eps, minPts);
                
                const clusters = dbscan.cluster(this.points);
                let clusteredPointsCount = 0;
                clusters.forEach(c => clusteredPointsCount += c.length);
                
                const noisePoints = validPointsCount - clusteredPointsCount;
                const noiseRatio = validPointsCount > 0 ? (noisePoints / validPointsCount) * 100 : 0;
                
                const silhouette = this.computeSilhouette(clusters, noisePoints);

                results.push({
                    epsilon_meters: eps,
                    min_samples: minPts,
                    num_clusters: clusters.length,
                    noise_percentage: noiseRatio,
                    silhouette_score: silhouette,
                    is_stable: false, // Will calculate below
                    is_recommended: false
                });
            }
        }

        // Stability Check: Evaluate sensitivity by comparing adjacent parameters
        for (let i = 0; i < results.length; i++) {
            const current = results[i];
            
            // Find neighbors with same min_samples but adjacent epsilon
            const lowerEps = results.find(r => r.min_samples === current.min_samples && r.epsilon_meters < current.epsilon_meters);
            const higherEps = results.find(r => r.min_samples === current.min_samples && r.epsilon_meters > current.epsilon_meters);
            
            // Stable if changing eps slightly doesn't fracture/merge clusters drastically
            let isStable = true;
            if (lowerEps && Math.abs(current.num_clusters - lowerEps.num_clusters) > 2) isStable = false;
            if (higherEps && Math.abs(current.num_clusters - higherEps.num_clusters) > 2) isStable = false;
            
            // If the noise is above 70%, it's mostly noise, consider unstable/brittle
            if (current.noise_percentage > 70) isStable = false;
            
            current.is_stable = isStable;
        }

        // Sort by silhouette, prioritizing stable configurations
        results.sort((a, b) => {
            if (a.is_stable && !b.is_stable) return -1;
            if (!a.is_stable && b.is_stable) return 1;
            return b.silhouette_score - a.silhouette_score;
        });
        
        let recommended = results.find(r => r.noise_percentage < 50 && r.num_clusters > 0 && r.is_stable);
        if (!recommended && results.length > 0) recommended = results[0]; // fallback

        if (recommended) {
            recommended.is_recommended = true;
        }

        return results;
    }
}

module.exports = DBSCANOptimizer;
