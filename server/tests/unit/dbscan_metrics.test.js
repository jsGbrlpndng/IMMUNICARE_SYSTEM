const Metrics = require('../../modules/geospatial/DBSCANMetrics');

const clearClusters = [
    { id: 'a1', lat: 14.30000, lng: 121.00000, label: 0 },
    { id: 'a2', lat: 14.30008, lng: 121.00004, label: 0 },
    { id: 'a3', lat: 14.30004, lng: 121.00009, label: 0 },
    { id: 'b1', lat: 14.32000, lng: 121.03000, label: 1 },
    { id: 'b2', lat: 14.32008, lng: 121.03004, label: 1 },
    { id: 'b3', lat: 14.32004, lng: 121.03009, label: 1 }
];

describe('DBSCANMetrics', () => {
    test('normalizes noise labels to -1', () => {
        const labels = Metrics.normalizeLabels([
            { id: 'p1', lat: 14.3, lng: 121.0, label: null },
            { id: 'p2', lat: 14.3, lng: 121.0, label: 'NOISE' },
            { id: 'p3', lat: 14.3, lng: 121.0, label: 0 }
        ]).map((point) => point.label);

        expect(labels).toEqual([-1, -1, 0]);
    });

    test('calculates cluster coverage from clustered versus eligible mappable points', () => {
        const coverage = Metrics.calculateClusterCoverage([
            { label: 0 },
            { label: 0 },
            { label: 1 },
            { label: -1 }
        ]);

        expect(coverage).toBeCloseTo(75);
    });

    test('DBCV returns a positive value for clear separated clusters', () => {
        const result = Metrics.calculateDBCV(clearClusters, 3);

        expect(result.status).toBe('ok');
        expect(result.value).toBeGreaterThan(0);
        expect(result.value).toBeLessThanOrEqual(1);
    });

    test('DBCV returns safe null status for invalid cases', () => {
        expect(Metrics.calculateDBCV([
            { id: 'n1', lat: 14.3, lng: 121.0, label: -1 },
            { id: 'n2', lat: 14.31, lng: 121.01, label: -1 }
        ], 3).value).toBeNull();

        expect(Metrics.calculateDBCV([
            { id: 'a1', lat: 14.3, lng: 121.0, label: 0 },
            { id: 'a2', lat: 14.3001, lng: 121.0001, label: 0 },
            { id: 'a3', lat: 14.3002, lng: 121.0002, label: 0 }
        ], 3).value).toBeNull();
    });

    test('supporting metrics return values for clear clusters', () => {
        const all = Metrics.calculateAll(clearClusters, 3);

        expect(all.silhouette_score).toBeGreaterThan(0);
        expect(all.davies_bouldin_index).toBeGreaterThanOrEqual(0);
        expect(all.calinski_harabasz_index).toBeGreaterThan(0);
    });

    test('supporting metrics return safe null statuses for invalid cases', () => {
        const invalid = [
            { id: 'a1', lat: 14.3, lng: 121.0, label: 0 },
            { id: 'a2', lat: 14.3001, lng: 121.0001, label: 0 },
            { id: 'a3', lat: 14.3002, lng: 121.0002, label: 0 }
        ];

        expect(Metrics.calculateSilhouette(invalid).value).toBeNull();
        expect(Metrics.calculateDaviesBouldin(invalid).value).toBeNull();
        expect(Metrics.calculateCalinskiHarabasz(invalid).value).toBeNull();
    });
});
