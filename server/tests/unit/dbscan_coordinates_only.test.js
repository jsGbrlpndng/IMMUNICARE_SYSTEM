const DBSCANService = require('../../modules/geospatial/DBSCANService');

describe('DBSCAN coordinate flow', () => {
    test('clusters from latitude/longitude-backed geometry without reading address text', async () => {
        const execute = jest.fn()
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[
            { id: 'infant-1', cluster_id: 0 },
            { id: 'infant-2', cluster_id: 0 },
            { id: 'infant-3', cluster_id: 0 }
            ]]);
        const db = { execute };
        const dbscan = new DBSCANService(300, 3, db);
        const points = [
            { id: 'infant-1', lat: 14.3261, lng: 121.0179, exact_address: 'Block 1 Lot 1' },
            { id: 'infant-2', lat: 14.3262, lng: 121.0180, exact_address: 'House 2' },
            { id: 'infant-3', lat: 14.3263, lng: 121.0181, exact_address: 'Unit 3' }
        ];

        const clusters = await dbscan.cluster(db, points, 'LANGGAM');

        expect(clusters).toHaveLength(1);
        expect(clusters[0].map((point) => point.id)).toEqual(['infant-1', 'infant-2', 'infant-3']);

        const [sql, params] = execute.mock.calls[1];
        expect(sql).toMatch(/i\.latitude IS NOT NULL/);
        expect(sql).toMatch(/i\.longitude IS NOT NULL/);
        expect(sql).toMatch(/ST_ClusterDBSCAN\(ST_Transform\(location, 32651\)/);
        expect(sql).not.toMatch(/exact_address|current_address|landmark/i);
        expect(params).toEqual(['LANGGAM', 300, 3]);
    });

    test('production clustering reads configured epsilon and MinPts from system_settings', async () => {
        const execute = jest.fn()
            .mockResolvedValueOnce([[
                { setting_key: 'dbscan_epsilon_meters', setting_value: '100' },
                { setting_key: 'dbscan_min_points', setting_value: '4' }
            ]])
            .mockResolvedValueOnce([[]]);
        const db = { execute };
        const dbscan = new DBSCANService(300, 3, db);
        const points = [
            { id: 'infant-1', lat: 14.3261, lng: 121.0179 },
            { id: 'infant-2', lat: 14.3262, lng: 121.0180 },
            { id: 'infant-3', lat: 14.3263, lng: 121.0181 },
            { id: 'infant-4', lat: 14.3264, lng: 121.0182 }
        ];

        await dbscan.cluster(db, points);

        const [, params] = execute.mock.calls[1];
        expect(params).toEqual([100, 4]);
    });
});
