'use strict';

const InfantService = require('../infants/InfantService');
const DBSCANMetrics = require('./DBSCANMetrics');
const { MIN_CLUSTER_INFANTS } = require('../../config/constants/domain');

const DEFAULT_EPSILON_VALUES = Object.freeze([100, 150, 200, 250, 300, 350, 400, 450, 500]);

const clampMinPts = (value) => Math.max(parseInt(value, 10) || MIN_CLUSTER_INFANTS, MIN_CLUSTER_INFANTS);

const parseEpsilonValues = (values) => {
    if (!values) return [...DEFAULT_EPSILON_VALUES];
    const raw = Array.isArray(values) ? values : String(values).split(',');
    const parsed = raw
        .map((value) => parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0 && value <= 5000);
    return parsed.length ? [...new Set(parsed)].sort((a, b) => a - b) : [...DEFAULT_EPSILON_VALUES];
};

const roundMetric = (value, decimals = 4) => {
    if (!Number.isFinite(Number(value))) return null;
    const factor = 10 ** decimals;
    return Math.round(Number(value) * factor) / factor;
};

class DBSCANEvaluationService {
    constructor(db) {
        this.db = db;
        this.infantService = new InfantService(db);
    }

    async getCurrentSettings() {
        const settings = {
            epsilon_meters: 300,
            minPts: MIN_CLUSTER_INFANTS,
            distance_model: 'PostGIS ST_ClusterDBSCAN over ST_Transform(location, 32651)',
            production_behavior_changed: false
        };

        try {
            const [rows] = await this.db.execute(`
                SELECT setting_key, setting_value
                FROM system_settings
                WHERE setting_key IN ('dbscan_epsilon_meters', 'dbscan_min_points')
            `);

            (rows || []).forEach((row) => {
                if (row.setting_key === 'dbscan_epsilon_meters') {
                    settings.epsilon_meters = parseInt(row.setting_value, 10) || settings.epsilon_meters;
                }
                if (row.setting_key === 'dbscan_min_points') {
                    settings.minPts = clampMinPts(row.setting_value);
                }
            });
        } catch (error) {
            settings.settings_warning = `Unable to read system settings: ${error.message}`;
        }

        return settings;
    }

    labelsFromSpatialTriage(spatialData = {}) {
        const labeled = [];
        const seen = new Set();

        (spatialData.clusters || []).forEach((cluster, index) => {
            const label = Number.isInteger(Number(cluster.clusterId?.replace?.('CL-', '')))
                ? Number(cluster.clusterId.replace('CL-', ''))
                : index;

            (cluster.points || []).forEach((point) => {
                seen.add(point.id);
                labeled.push({
                    id: point.id,
                    lat: Number(point.lat),
                    lng: Number(point.lng),
                    label
                });
            });
        });

        (spatialData.noise || []).forEach((point) => {
            if (seen.has(point.id)) return;
            labeled.push({
                id: point.id,
                lat: Number(point.lat),
                lng: Number(point.lng),
                label: -1
            });
        });

        return labeled.filter((point) =>
            point.id &&
            Number.isFinite(point.lat) &&
            Number.isFinite(point.lng)
        );
    }

    interpret(row) {
        if (row.number_of_mappable_records < row.minPts) {
            return 'Insufficient mappable defaulter records for DBSCAN evaluation.';
        }
        if (row.number_of_clusters === 0) {
            return 'All eligible points were treated as noise; not useful for hotspot planning.';
        }
        if (row.number_of_clusters === 1 && row.cluster_coverage_percent >= 90) {
            return 'One broad cluster covers nearly all mappable records; separation may be weak.';
        }
        if (row.dbcv_score === null) {
            return `DBCV unavailable (${row.dbcv_status}); use only as an operational preview.`;
        }
        if (row.dbcv_score >= 0.5) {
            return 'Strong density separation with potentially useful outreach areas.';
        }
        if (row.dbcv_score >= 0.2) {
            return 'Moderate density separation; review map usefulness before adoption.';
        }
        if (row.dbcv_score >= 0) {
            return 'Weak density separation; use cautiously.';
        }
        return 'Poor density separation; clusters may not be defensible.';
    }

    scoreCandidate(row) {
        if (row.number_of_clusters === 0) return Number.NEGATIVE_INFINITY;
        if (row.number_of_mappable_records < row.minPts) return Number.NEGATIVE_INFINITY;

        const coverage = Number(row.cluster_coverage_percent || 0);
        const noisePercent = 100 - coverage;
        const dbcv = Number.isFinite(Number(row.dbcv_score)) ? Number(row.dbcv_score) : -0.5;
        const clusterCount = Number(row.number_of_clusters || 0);

        let score = dbcv * 100;
        score += Math.min(coverage, 80) * 0.25;
        score -= Math.max(0, noisePercent - 60) * 0.5;

        if (clusterCount >= 2 && clusterCount <= 8) score += 15;
        if (clusterCount === 1 && coverage >= 90) score -= 40;
        if (coverage >= 98 && clusterCount === 1) score -= 30;

        return score;
    }

    chooseRecommendation(rows) {
        let best = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        rows.forEach((row) => {
            const score = this.scoreCandidate(row);
            row._recommendation_score = roundMetric(score, 3);
            if (score > bestScore) {
                bestScore = score;
                best = row;
            }
        });

        rows.forEach((row) => {
            row.is_recommended = best ? row.epsilon_meters === best.epsilon_meters && row.minPts === best.minPts : false;
            row.is_stable = row.dbcv_score !== null && row.dbcv_score >= 0.2 && row.number_of_clusters > 0;
        });

        if (!best || !Number.isFinite(bestScore)) {
            return {
                best: null,
                explanation: 'No defensible DBSCAN configuration was found for the current eligible dataset.'
            };
        }

        return {
            best,
            explanation: `Selected ${best.epsilon_meters}m / MinPts ${best.minPts} because it balanced DBCV (${best.dbcv_score ?? 'n/a'}), ${best.number_of_clusters} cluster(s), ${best.number_of_noise_points} noise point(s), and ${best.cluster_coverage_percent}% cluster coverage.`
        };
    }

    async evaluate(params = {}) {
        const minPts = clampMinPts(params.minPts);
        const epsilonValues = parseEpsilonValues(params.epsilonValues || params.epsilons);
        const barangay = params.barangay && String(params.barangay).toLowerCase() !== 'all'
            ? String(params.barangay)
            : null;
        const currentSettings = await this.getCurrentSettings();

        const rows = [];
        let latestDatasetSummary = {
            barangay,
            scope: 'defaulter',
            number_of_eligible_records: 0,
            number_of_mappable_records: 0,
            notes: []
        };

        for (const epsilon of epsilonValues) {
            const spatialData = await this.infantService.getSpatialTriage({
                eps: epsilon,
                minPts,
                barangay,
                scope: 'defaulter',
                persistResults: false
            });

            const labeledPoints = this.labelsFromSpatialTriage(spatialData);
            const metrics = DBSCANMetrics.calculateAll(labeledPoints, minPts);
            const row = {
                epsilon_meters: epsilon,
                minPts,
                min_samples: minPts,
                ...metrics
            };

            row.cluster_coverage_percent = roundMetric(row.cluster_coverage_percent, 2);
            row.dbcv_score = roundMetric(row.dbcv_score, 4);
            row.silhouette_score = roundMetric(row.silhouette_score, 4);
            row.davies_bouldin_index = roundMetric(row.davies_bouldin_index, 4);
            row.calinski_harabasz_index = roundMetric(row.calinski_harabasz_index, 4);
            row.noise_percentage = roundMetric(
                row.number_of_mappable_records > 0
                    ? (row.number_of_noise_points / row.number_of_mappable_records) * 100
                    : 0,
                2
            );
            row.interpretation = this.interpret(row);
            rows.push(row);

            latestDatasetSummary = {
                barangay: spatialData.barangay || barangay,
                scope: spatialData.scope || 'defaulter',
                number_of_eligible_records: spatialData.counts?.total_defaulters || row.number_of_eligible_records,
                number_of_mappable_records: spatialData.counts?.mapped_defaulters || row.number_of_mappable_records,
                unmapped_defaulters: spatialData.counts?.unmapped_defaulters || 0,
                notes: []
            };
        }

        if (latestDatasetSummary.number_of_mappable_records < minPts) {
            latestDatasetSummary.notes.push('Too few mappable defaulter records for reliable DBSCAN/DBCV evaluation.');
        }
        if (rows.every((row) => row.dbcv_score === null)) {
            latestDatasetSummary.notes.push('DBCV was unavailable for every trial, usually because results had all noise or fewer than two valid clusters.');
        }

        const recommendation = this.chooseRecommendation(rows);

        return {
            success: true,
            current_production_settings: currentSettings,
            dataset_summary: latestDatasetSummary,
            parameter_sweep: rows,
            best_recommendation: recommendation.best
                ? {
                    epsilon_meters: recommendation.best.epsilon_meters,
                    minPts: recommendation.best.minPts,
                    dbcv_score: recommendation.best.dbcv_score,
                    number_of_clusters: recommendation.best.number_of_clusters,
                    number_of_noise_points: recommendation.best.number_of_noise_points,
                    cluster_coverage_percent: recommendation.best.cluster_coverage_percent
                }
                : null,
            recommendation_explanation: recommendation.explanation,
            warnings: latestDatasetSummary.notes,
            read_only: true
        };
    }
}

DBSCANEvaluationService.DEFAULT_EPSILON_VALUES = DEFAULT_EPSILON_VALUES;

module.exports = DBSCANEvaluationService;
