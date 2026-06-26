describe('DBSCANEvaluationService', () => {
    let getSpatialTriage;
    let DBSCANEvaluationService;

    const makePoint = (id, lat, lng, extra = {}) => ({
        id,
        lat,
        lng,
        exact_address: 'Should not be used',
        current_address: 'Should not be used',
        barangay: 'LANGGAM',
        patient_name: `Infant ${id}`,
        ...extra
    });

    beforeEach(() => {
        jest.resetModules();
        getSpatialTriage = jest.fn(({ eps }) => {
            if (eps === 100) {
                return Promise.resolve({
                    barangay: 'LANGGAM',
                    scope: 'defaulter',
                    clusters: [],
                    noise: [
                        makePoint('n1', 14.30000, 121.00000),
                        makePoint('n2', 14.30020, 121.00020),
                        makePoint('n3', 14.30040, 121.00040)
                    ],
                    counts: { total_defaulters: 6, mapped_defaulters: 6, unmapped_defaulters: 0 }
                });
            }

            if (eps === 150) {
                return Promise.resolve({
                    barangay: 'LANGGAM',
                    scope: 'defaulter',
                    clusters: [{
                        clusterId: 'CL-0',
                        points: [
                            makePoint('g1', 14.30000, 121.00000),
                            makePoint('g2', 14.30020, 121.00020),
                            makePoint('g3', 14.30040, 121.00040),
                            makePoint('g4', 14.30060, 121.00060),
                            makePoint('g5', 14.30080, 121.00080),
                            makePoint('g6', 14.30100, 121.00100)
                        ]
                    }],
                    noise: [],
                    counts: { total_defaulters: 6, mapped_defaulters: 6, unmapped_defaulters: 0 }
                });
            }

            return Promise.resolve({
                barangay: 'LANGGAM',
                scope: 'defaulter',
                clusters: [
                    {
                        clusterId: 'CL-0',
                        points: [
                            makePoint('a1', 14.30000, 121.00000),
                            makePoint('a2', 14.30008, 121.00004),
                            makePoint('a3', 14.30004, 121.00009)
                        ]
                    },
                    {
                        clusterId: 'CL-1',
                        points: [
                            makePoint('b1', 14.32000, 121.03000),
                            makePoint('b2', 14.32008, 121.03004),
                            makePoint('b3', 14.32004, 121.03009)
                        ]
                    }
                ],
                noise: [makePoint('z1', 14.34000, 121.05000)],
                counts: { total_defaulters: 7, mapped_defaulters: 7, unmapped_defaulters: 0 }
            });
        });

        jest.doMock('../../modules/infants/InfantService', () => {
            return jest.fn().mockImplementation(() => ({ getSpatialTriage }));
        });

        DBSCANEvaluationService = require('../../modules/geospatial/DBSCANEvaluationService');
    });

    test('runs the default parameter sweep through shared spatial triage without persistence', async () => {
        const db = { execute: jest.fn().mockResolvedValue([[]]) };
        const service = new DBSCANEvaluationService(db);

        const result = await service.evaluate({ barangay: 'LANGGAM', minPts: 2 });

        expect(result.parameter_sweep).toHaveLength(9);
        expect(result.parameter_sweep.map((row) => row.epsilon_meters)).toEqual([
            100, 150, 200, 250, 300, 350, 400, 450, 500
        ]);
        expect(result.parameter_sweep.every((row) => row.minPts === 3)).toBe(true);
        expect(getSpatialTriage).toHaveBeenCalledTimes(9);
        expect(getSpatialTriage).toHaveBeenCalledWith(expect.objectContaining({
            barangay: 'LANGGAM',
            scope: 'defaulter',
            minPts: 3,
            persistResults: false
        }));
    });

    test('returns normalized noise metrics and does not expose address fields as dimensions', async () => {
        const db = { execute: jest.fn().mockResolvedValue([[]]) };
        const service = new DBSCANEvaluationService(db);

        const result = await service.evaluate({ barangay: 'LANGGAM', epsilonValues: [200], minPts: 3 });
        const row = result.parameter_sweep[0];

        expect(row.number_of_mappable_records).toBe(7);
        expect(row.number_of_clusters).toBe(2);
        expect(row.number_of_noise_points).toBe(1);
        expect(row.cluster_coverage_percent).toBeCloseTo(85.71);
        expect(JSON.stringify(row)).not.toMatch(/Should not be used|exact_address|current_address|patient_name/);
    });

    test('recommendation avoids all-noise and one-giant-cluster results', async () => {
        const db = { execute: jest.fn().mockResolvedValue([[]]) };
        const service = new DBSCANEvaluationService(db);

        const result = await service.evaluate({ barangay: 'LANGGAM', epsilonValues: [100, 150, 200], minPts: 3 });

        expect(result.best_recommendation.epsilon_meters).toBe(200);
        expect(result.parameter_sweep.find((row) => row.epsilon_meters === 100).is_recommended).toBe(false);
        expect(result.parameter_sweep.find((row) => row.epsilon_meters === 150).is_recommended).toBe(false);
        expect(result.parameter_sweep.find((row) => row.epsilon_meters === 200).is_recommended).toBe(true);
    });

    test('labelsFromSpatialTriage maps PostGIS noise to -1', () => {
        const db = { execute: jest.fn().mockResolvedValue([[]]) };
        const service = new DBSCANEvaluationService(db);

        const labels = service.labelsFromSpatialTriage({
            clusters: [{ clusterId: 'CL-0', points: [makePoint('a1', 14.3, 121.0)] }],
            noise: [makePoint('n1', 14.31, 121.01)]
        }).map((point) => point.label);

        expect(labels).toEqual([0, -1]);
    });
});
