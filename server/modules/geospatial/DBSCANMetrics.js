'use strict';

const EPS = 1e-9;
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const UTM_K0 = 0.9996;
const UTM_ZONE_51_CENTRAL_MERIDIAN = (51 - 1) * 6 - 180 + 3;

const isFiniteNumber = (value) => Number.isFinite(Number(value));

function toRadians(degrees) {
    return (Number(degrees) * Math.PI) / 180;
}

function toUtm51(point) {
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const latRad = toRadians(lat);
    const lonRad = toRadians(lng);
    const lonOriginRad = toRadians(UTM_ZONE_51_CENTRAL_MERIDIAN);
    const ePrimeSq = WGS84_E2 / (1 - WGS84_E2);
    const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(latRad) ** 2);
    const t = Math.tan(latRad) ** 2;
    const c = ePrimeSq * Math.cos(latRad) ** 2;
    const a = Math.cos(latRad) * (lonRad - lonOriginRad);

    const m = WGS84_A * (
        (1 - WGS84_E2 / 4 - 3 * WGS84_E2 ** 2 / 64 - 5 * WGS84_E2 ** 3 / 256) * latRad
        - (3 * WGS84_E2 / 8 + 3 * WGS84_E2 ** 2 / 32 + 45 * WGS84_E2 ** 3 / 1024) * Math.sin(2 * latRad)
        + (15 * WGS84_E2 ** 2 / 256 + 45 * WGS84_E2 ** 3 / 1024) * Math.sin(4 * latRad)
        - (35 * WGS84_E2 ** 3 / 3072) * Math.sin(6 * latRad)
    );

    const easting = UTM_K0 * n * (
        a
        + (1 - t + c) * a ** 3 / 6
        + (5 - 18 * t + t ** 2 + 72 * c - 58 * ePrimeSq) * a ** 5 / 120
    ) + 500000;

    let northing = UTM_K0 * (
        m
        + n * Math.tan(latRad) * (
            a ** 2 / 2
            + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24
            + (61 - 58 * t + t ** 2 + 600 * c - 330 * ePrimeSq) * a ** 6 / 720
        )
    );

    if (lat < 0) northing += 10000000;
    return { x: easting, y: northing };
}

function euclidean(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function normalizeLabels(points = []) {
    return points
        .map((point) => ({
            ...point,
            label: point.label === null || point.label === undefined || point.label === 'NOISE'
                ? -1
                : Number(point.label)
        }))
        .filter((point) => Number.isFinite(point.label));
}

function prepare(points = []) {
    const projected = normalizeLabels(points)
        .map((point, index) => {
            const metric = toUtm51(point);
            if (!metric) return null;
            return { ...point, index, x: metric.x, y: metric.y };
        })
        .filter(Boolean);

    const distances = projected.map((a) => projected.map((b) => euclidean(a, b)));
    return { points: projected, distances };
}

function clusterLabels(points) {
    return [...new Set(points.filter((p) => p.label !== -1).map((p) => p.label))];
}

function validClusterGroups(points) {
    const groups = new Map();
    points.forEach((point, index) => {
        if (point.label === -1) return;
        if (!groups.has(point.label)) groups.set(point.label, []);
        groups.get(point.label).push(index);
    });
    return groups;
}

function safeInvalidMetric(reason) {
    return { value: null, status: reason };
}

function average(values) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateClusterCoverage(points = []) {
    const eligible = points.length;
    if (eligible === 0) return 0;
    const clustered = points.filter((point) => point.label !== -1 && point.label !== 'NOISE' && point.label !== null && point.label !== undefined).length;
    return (clustered / eligible) * 100;
}

function calculateSilhouette(points = []) {
    const { points: prepared, distances } = prepare(points);
    const groups = validClusterGroups(prepared);
    if (prepared.length < 3 || groups.size < 2) return safeInvalidMetric('requires_at_least_two_clusters');

    const scores = [];
    prepared.forEach((point, index) => {
        if (point.label === -1) return;
        const own = groups.get(point.label).filter((other) => other !== index);
        if (own.length === 0) return;

        const a = average(own.map((other) => distances[index][other])) ?? 0;
        let b = Infinity;
        groups.forEach((indices, label) => {
            if (label === point.label) return;
            const candidate = average(indices.map((other) => distances[index][other]));
            if (candidate !== null && candidate < b) b = candidate;
        });

        if (!Number.isFinite(b)) return;
        const denominator = Math.max(a, b);
        scores.push(denominator <= EPS ? 0 : (b - a) / denominator);
    });

    return scores.length ? { value: average(scores), status: 'ok' } : safeInvalidMetric('no_valid_cluster_members');
}

function calculateDaviesBouldin(points = []) {
    const { points: prepared, distances } = prepare(points);
    const groups = validClusterGroups(prepared);
    if (prepared.length < 3 || groups.size < 2) return safeInvalidMetric('requires_at_least_two_clusters');

    const centroids = new Map();
    const scatter = new Map();

    groups.forEach((indices, label) => {
        const cx = average(indices.map((index) => prepared[index].x));
        const cy = average(indices.map((index) => prepared[index].y));
        centroids.set(label, { x: cx, y: cy });
        scatter.set(label, average(indices.map((index) => euclidean(prepared[index], { x: cx, y: cy }))) || 0);
    });

    const labels = [...groups.keys()];
    const ratios = labels.map((label) => {
        let worst = -Infinity;
        labels.forEach((otherLabel) => {
            if (otherLabel === label) return;
            const centerDistance = euclidean(centroids.get(label), centroids.get(otherLabel));
            if (centerDistance <= EPS) return;
            const ratio = (scatter.get(label) + scatter.get(otherLabel)) / centerDistance;
            if (ratio > worst) worst = ratio;
        });
        return worst;
    }).filter(Number.isFinite);

    return ratios.length ? { value: average(ratios), status: 'ok' } : safeInvalidMetric('centroids_not_separated');
}

function calculateCalinskiHarabasz(points = []) {
    const { points: prepared } = prepare(points);
    const clustered = prepared.filter((point) => point.label !== -1);
    const groups = validClusterGroups(prepared);
    const n = clustered.length;
    const k = groups.size;
    if (n <= k || k < 2) return safeInvalidMetric('requires_more_points_than_clusters');

    const overall = {
        x: average(clustered.map((point) => point.x)),
        y: average(clustered.map((point) => point.y))
    };

    let between = 0;
    let within = 0;
    groups.forEach((indices) => {
        const centroid = {
            x: average(indices.map((index) => prepared[index].x)),
            y: average(indices.map((index) => prepared[index].y))
        };
        between += indices.length * euclidean(centroid, overall) ** 2;
        indices.forEach((index) => {
            within += euclidean(prepared[index], centroid) ** 2;
        });
    });

    if (within <= EPS) return safeInvalidMetric('zero_within_cluster_dispersion');
    return { value: (between / (k - 1)) / (within / (n - k)), status: 'ok' };
}

function kNearestCoreDistance(index, candidateIndices, distances, minPts) {
    const neighbors = candidateIndices
        .filter((candidate) => candidate !== index)
        .map((candidate) => distances[index][candidate])
        .sort((a, b) => a - b);

    if (!neighbors.length) return Infinity;
    const neighborRank = Math.max(1, Math.min(minPts - 1, neighbors.length));
    return neighbors[neighborRank - 1];
}

function calculateDBCV(points = [], minPts = 3) {
    const { points: prepared, distances } = prepare(points);
    const groups = validClusterGroups(prepared);
    if (prepared.length < minPts || groups.size < 2) return safeInvalidMetric('requires_at_least_two_clusters');

    const clusteredIndices = prepared.map((point, index) => point.label !== -1 ? index : null).filter((index) => index !== null);
    if (clusteredIndices.length < minPts) return safeInvalidMetric('insufficient_clustered_points');

    const coreDistances = new Map();
    clusteredIndices.forEach((index) => {
        coreDistances.set(index, kNearestCoreDistance(index, clusteredIndices, distances, Math.max(2, minPts)));
    });

    const mutualReachability = (a, b) => Math.max(
        coreDistances.get(a) || 0,
        coreDistances.get(b) || 0,
        distances[a][b]
    );

    const clusterScores = [];
    let totalClustered = 0;

    groups.forEach((indices) => {
        if (indices.length < 2) return;
        totalClustered += indices.length;

        let densitySparseness = 0;
        for (let i = 0; i < indices.length; i += 1) {
            for (let j = i + 1; j < indices.length; j += 1) {
                densitySparseness = Math.max(densitySparseness, mutualReachability(indices[i], indices[j]));
            }
        }

        let densitySeparation = Infinity;
        groups.forEach((otherIndices) => {
            if (otherIndices === indices) return;
            indices.forEach((a) => {
                otherIndices.forEach((b) => {
                    densitySeparation = Math.min(densitySeparation, mutualReachability(a, b));
                });
            });
        });

        if (!Number.isFinite(densitySeparation) || Math.max(densitySparseness, densitySeparation) <= EPS) return;
        const validity = (densitySeparation - densitySparseness) / Math.max(densitySeparation, densitySparseness);
        clusterScores.push({ validity, size: indices.length });
    });

    if (!clusterScores.length || totalClustered === 0) return safeInvalidMetric('no_valid_density_separation');

    const weighted = clusterScores.reduce((sum, item) => sum + item.validity * (item.size / totalClustered), 0);
    const noisePenalty = prepared.length > 0 ? totalClustered / prepared.length : 0;
    return {
        value: weighted * noisePenalty,
        status: 'ok'
    };
}

function calculateAll(points = [], minPts = 3) {
    const normalized = normalizeLabels(points);
    const labels = clusterLabels(normalized);
    const noiseCount = normalized.filter((point) => point.label === -1).length;
    const coverage = calculateClusterCoverage(normalized);
    const dbcv = calculateDBCV(normalized, minPts);
    const silhouette = calculateSilhouette(normalized);
    const daviesBouldin = calculateDaviesBouldin(normalized);
    const calinskiHarabasz = calculateCalinskiHarabasz(normalized);

    return {
        number_of_eligible_records: normalized.length,
        number_of_mappable_records: normalized.length,
        number_of_clusters: labels.length,
        number_of_noise_points: noiseCount,
        cluster_coverage_percent: coverage,
        dbcv_score: dbcv.value,
        dbcv_status: dbcv.status,
        silhouette_score: silhouette.value,
        silhouette_status: silhouette.status,
        davies_bouldin_index: daviesBouldin.value,
        davies_bouldin_status: daviesBouldin.status,
        calinski_harabasz_index: calinskiHarabasz.value,
        calinski_harabasz_status: calinskiHarabasz.status
    };
}

module.exports = {
    calculateAll,
    calculateCalinskiHarabasz,
    calculateClusterCoverage,
    calculateDBCV,
    calculateDaviesBouldin,
    calculateSilhouette,
    normalizeLabels,
    toUtm51,
    isFiniteNumber
};
