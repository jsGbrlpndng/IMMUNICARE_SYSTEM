const db = require('../db');
const DBSCANService = require('../services/DBSCANService');
const InfantService = require('../services/InfantService');

describe('DBSCAN Spatial Analytics & Boundary Integrity', () => {
    const caregiverId = 'c0000000-0000-0000-0000-000000000000';
    const infantId1 = 'infant-test-1';
    const infantId2 = 'infant-test-2';
    const infantId3 = 'infant-test-3';
    
    beforeAll(async () => {
        // 1. Clean up any leftover test data
        await db.execute(`DELETE FROM infant_schedules WHERE infant_id IN (?, ?, ?)`, [infantId1, infantId2, infantId3]);
        await db.execute(`DELETE FROM infants WHERE id IN (?, ?, ?)`, [infantId1, infantId2, infantId3]);
        await db.execute(`DELETE FROM caregivers WHERE id = ?`, [caregiverId]);

        // 2. Insert test caregiver
        await db.execute(`
            INSERT INTO caregivers (id, full_name, mobile_number, relationship)
            VALUES (?, 'Test Caregiver', '09999999999', 'Mother')
        `, [caregiverId]);

        // 3. Insert test infants (1 & 2 in LANGGAM, 3 in RIVERSIDE)
        // Coordinates are set to a geographically isolated region (lat ~15.1, lng ~121.1)
        // to prevent interference with seeded infants in San Pedro.
        const infants = [
            { id: infantId1, ref: 'REF-TEST-001', brgy: 'LANGGAM', lat: 15.10000, lng: 121.10000 },
            { id: infantId2, ref: 'REF-TEST-002', brgy: 'LANGGAM', lat: 15.10010, lng: 121.10010 },
            { id: infantId3, ref: 'REF-TEST-003', brgy: 'RIVERSIDE', lat: 15.10020, lng: 121.10020 }
        ];

        for (const infant of infants) {
            await db.execute(`
                INSERT INTO infants (
                    id, reference_id, first_name, last_name, dob, sex, 
                    caregiver_id, caregiver_phone, barangay, 
                    latitude, longitude, location, status, registration_status
                )
                VALUES (
                    ?, ?, ?, 'TestInfant', '2025-06-01', 'M',
                    ?, '09999999999', ?,
                    ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), 'Active', 'APPROVED'
                )
            `, [
                infant.id, infant.ref, `Baby${infant.id.split('-').pop()}`,
                caregiverId, infant.brgy,
                infant.lat, infant.lng, infant.lng, infant.lat
            ]);

            // Insert a defaulted schedule row to ensure they fall within the DBSCAN query scope
            await db.execute(`
                INSERT INTO infant_schedules (
                    id, infant_id, vaccine_code, dose_number, 
                    recommended_date, earliest_allowed_date, status
                )
                VALUES (?, ?, 'BCG', 1, '2025-06-01', '2025-06-01', 'DEFAULTER')
            `, [`sched-${infant.id}`, infant.id]);
        }
    });

    afterAll(async () => {
        // Cleanup all inserted test data
        await db.execute(`DELETE FROM infant_schedules WHERE infant_id IN (?, ?, ?)`, [infantId1, infantId2, infantId3]);
        await db.execute(`DELETE FROM infants WHERE id IN (?, ?, ?)`, [infantId1, infantId2, infantId3]);
        await db.execute(`DELETE FROM caregivers WHERE id = ?`, [caregiverId]);
    });

    test('DBSCANService clusters infants across different barangays (resolves Boundary Blindspot)', async () => {
        const dbscan = new DBSCANService(300, 3, db);
        
        // Load infants in-memory to simulate the service dataset structure
        const points = [
            { id: infantId1, lat: 15.10000, lng: 121.10000, barangay: 'LANGGAM' },
            { id: infantId2, lat: 15.10010, lng: 121.10010, barangay: 'LANGGAM' },
            { id: infantId3, lat: 15.10020, lng: 121.10020, barangay: 'RIVERSIDE' }
        ];

        // Execute clustering using the refactored database-level PostGIS algorithm
        const clusters = await dbscan.cluster(db, points);

        // We expect a cluster containing all 3 infants, despite Barangay boundaries
        const ourCluster = clusters.find(c => c.some(p => p.id === infantId1));
        expect(ourCluster).toBeDefined();
        expect(ourCluster.length).toBe(3);
        
        const ids = ourCluster.map(p => p.id);
        expect(ids).toContain(infantId1);
        expect(ids).toContain(infantId2);
        expect(ids).toContain(infantId3);
    });

    test('DBSCAN respects system_settings overrides dynamically', async () => {
        // Set dynamic settings to require a minimum of 5 points for clustering
        await db.execute(`
            INSERT INTO system_settings (setting_key, setting_value, value_type, category)
            VALUES ('dbscan_min_points', '5', 'number', 'spatial')
            ON CONFLICT (setting_key) DO UPDATE SET setting_value = '5'
        `);

        try {
            const dbscan = new DBSCANService(300, 3, db);
            const points = [
                { id: infantId1, lat: 15.10000, lng: 121.10000, barangay: 'LANGGAM' },
                { id: infantId2, lat: 15.10010, lng: 121.10010, barangay: 'LANGGAM' },
                { id: infantId3, lat: 15.10020, lng: 121.10020, barangay: 'RIVERSIDE' }
            ];

            // With MinPts = 5 (from db settings), our 3 points should NOT form a cluster
            const clusters = await dbscan.cluster(db, points);
            const ourCluster = clusters.find(c => c.some(p => p.id === infantId1));
            expect(ourCluster).toBeUndefined();
        } finally {
            // Restore default settings
            await db.execute(`
                UPDATE system_settings 
                SET setting_value = '3' 
                WHERE setting_key = 'dbscan_min_points'
            `);
        }
    });

    test('InfantService.getSpatialTriage suppresses remapped barangay clusters below the local threshold', async () => {
        const infantService = new InfantService(db);

        // Fetch spatial triage for Barangay LANGGAM
        const triage = await infantService.getSpatialTriage({
            eps: 300,
            minPts: 3,
            barangay: 'LANGGAM',
            scope: 'defaulter'
        });

        // The LANGGAM results should contain only LANGGAM infants (infant-test-1, infant-test-2)
        // in the local view. They were clustered globally with infant-test-3 from RIVERSIDE,
        // but the local/remapped cluster must still satisfy minPts before it is displayed.
        const ourCluster = triage.clusters.find(c => c.points.some(p => p.id === infantId1));
        expect(ourCluster).toBeUndefined();

        const noiseIds = triage.noise.map(p => p.id);
        expect(noiseIds).toContain(infantId1);
        expect(noiseIds).toContain(infantId2);
        expect(noiseIds).not.toContain(infantId3); // RIVERSIDE infant excluded from LANGGAM view context
    });

    test('DBSCAN minPts cannot be lowered below the production cluster threshold', () => {
        const dbscan = new DBSCANService(300, 2, db);
        expect(dbscan.minPts).toBe(3);
    });
});
