const InfantService = require('../infants/InfantService');
const { safeRecordAuditEvent } = require('../../shared/utils/auditLedger');

const FIXED_RADIUS_METERS = 300;
const FIXED_MIN_INFANTS = 3;
const ACTIVE_STATUSES = ['Pending', 'In Progress'];
const OVERLAP_THRESHOLD = 0.25;
const CENTROID_TOLERANCE_METERS = 180;

class ClusterDeploymentService {
    constructor(db) {
        this.db = db;
        this.infantService = new InfantService(db);
    }

    normalizeText(value) {
        return (value || '')
            .toString()
            .trim()
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    normalizeBarangay(value) {
        return (value || '').toString().trim();
    }

    generateClusterAreaKey(barangay, cluster) {
        const barangayKey = this.normalizeText(barangay) || 'unscoped';
        const localityKey = this.normalizeText(cluster?.locality);
        if (localityKey) {
            return `${barangayKey}:${localityKey}`;
        }

        const lat = Number.parseFloat(cluster?.lat);
        const lng = Number.parseFloat(cluster?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return `${barangayKey}:geo-${lat.toFixed(4)}-${lng.toFixed(4)}`;
        }

        return `${barangayKey}:cluster-${this.normalizeText(cluster?.clusterId || 'unknown')}`;
    }

    boundsToBox(bounds) {
        if (!Array.isArray(bounds) || bounds.length < 2) return null;
        const first = bounds[0] || [];
        const second = bounds[1] || [];
        const minLat = Number.parseFloat(first[0]);
        const minLng = Number.parseFloat(first[1]);
        const maxLat = Number.parseFloat(second[0]);
        const maxLng = Number.parseFloat(second[1]);

        if (![minLat, minLng, maxLat, maxLng].every(Number.isFinite)) return null;

        return {
            minLat: Math.min(minLat, maxLat),
            maxLat: Math.max(minLat, maxLat),
            minLng: Math.min(minLng, maxLng),
            maxLng: Math.max(minLng, maxLng)
        };
    }

    boundsOverlapRatio(aBounds, bBounds) {
        const a = this.boundsToBox(aBounds);
        const b = this.boundsToBox(bBounds);
        if (!a || !b) return 0;

        const overlapLat = Math.max(0, Math.min(a.maxLat, b.maxLat) - Math.max(a.minLat, b.minLat));
        const overlapLng = Math.max(0, Math.min(a.maxLng, b.maxLng) - Math.max(a.minLng, b.minLng));
        const intersection = overlapLat * overlapLng;
        if (intersection <= 0) return 0;

        const areaA = Math.max(0, a.maxLat - a.minLat) * Math.max(0, a.maxLng - a.minLng);
        const areaB = Math.max(0, b.maxLat - b.minLat) * Math.max(0, b.maxLng - b.minLng);
        const smallerArea = Math.min(areaA, areaB);
        return smallerArea > 0 ? intersection / smallerArea : 0;
    }

    distanceMeters(lat1, lng1, lat2, lng2) {
        const aLat = Number.parseFloat(lat1);
        const aLng = Number.parseFloat(lng1);
        const bLat = Number.parseFloat(lat2);
        const bLng = Number.parseFloat(lng2);
        if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

        const toRad = (value) => (value * Math.PI) / 180;
        const radius = 6371000;
        const dLat = toRad(bLat - aLat);
        const dLng = toRad(bLng - aLng);
        const h =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
        return 2 * radius * Math.asin(Math.sqrt(h));
    }

    async getBarangayId(barangay) {
        if (!barangay) return null;
        const [rows] = await this.db.execute(
            `
            SELECT id
            FROM barangays
            WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
            LIMIT 1
            `,
            [barangay]
        );
        return rows[0]?.id || null;
    }

    async getLatestClusterResultId(barangay, cluster) {
        const [rows] = await this.db.execute(
            `
            SELECT id
            FROM dbscan_cluster_results
            WHERE UPPER(TRIM(barangay)) = UPPER(TRIM(?))
              AND cluster_identifier = ?
              AND epsilon_meters = ?
              AND min_points = ?
            ORDER BY generated_at DESC
            LIMIT 1
            `,
            [barangay, cluster.clusterId, FIXED_RADIUS_METERS, FIXED_MIN_INFANTS]
        );
        return rows[0]?.id || null;
    }

    async getActiveAssignments(barangay) {
        const [rows] = await this.db.execute(
            `
            SELECT *
            FROM cluster_assignments
            WHERE UPPER(TRIM(barangay)) = UPPER(TRIM(?))
              AND status IN ('Pending', 'In Progress')
            ORDER BY updated_at DESC
            `,
            [barangay]
        );
        return rows;
    }

    findMatchingAssignment(cluster, activeAssignments, areaKey) {
        const exact = activeAssignments.find((assignment) => assignment.cluster_area_key === areaKey);
        if (exact) return exact;

        let best = null;
        for (const assignment of activeAssignments) {
            const overlap = this.boundsOverlapRatio(cluster.bounds, assignment.bounds);
            const distance = this.distanceMeters(
                cluster.lat,
                cluster.lng,
                assignment.centroid_latitude,
                assignment.centroid_longitude
            );

            const qualifiesByOverlap = overlap >= OVERLAP_THRESHOLD;
            const qualifiesByDistance = distance <= CENTROID_TOLERANCE_METERS;
            if (!qualifiesByOverlap && !qualifiesByDistance) continue;

            const score = overlap + (qualifiesByDistance ? 0.5 : 0);
            if (!best || score > best.score) {
                best = { assignment, score };
            }
        }

        return best?.assignment || null;
    }

    async refreshAssignmentMembers(assignmentId, cluster) {
        await this.db.execute(
            `DELETE FROM cluster_assignment_members WHERE assignment_id = ?`,
            [assignmentId]
        );

        const infantIds = (cluster.points || [])
            .map((point) => point?.id)
            .filter(Boolean);

        for (const infantId of infantIds) {
            await this.db.execute(
                `
                INSERT INTO cluster_assignment_members (assignment_id, infant_id)
                VALUES (?, ?)
                ON CONFLICT DO NOTHING
                `,
                [assignmentId, infantId]
            );
        }
    }

    async upsertAssignmentForCluster({ barangay, barangayId, cluster, existingAssignment, areaKey }) {
        const clusterResultId = await this.getLatestClusterResultId(barangay, cluster);
        const label = cluster.locality || `Priority Area ${cluster.rank || cluster.clusterId || ''}`.trim();
        const bounds = JSON.stringify(cluster.bounds || null);

        if (existingAssignment) {
            const [rows] = await this.db.execute(
                `
                UPDATE cluster_assignments
                SET barangay_id = COALESCE(?, barangay_id),
                    cluster_result_id = ?,
                    cluster_area_key = ?,
                    cluster_label = ?,
                    centroid_latitude = ?,
                    centroid_longitude = ?,
                    bounds = ?::jsonb,
                    resolved_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                RETURNING *
                `,
                [
                    barangayId,
                    clusterResultId,
                    areaKey,
                    label,
                    cluster.lat,
                    cluster.lng,
                    bounds,
                    existingAssignment.id
                ]
            );

            const assignment = rows[0];
            await this.refreshAssignmentMembers(assignment.id, cluster);
            return assignment;
        }

        const [rows] = await this.db.execute(
            `
            INSERT INTO cluster_assignments (
                barangay_id,
                barangay,
                cluster_result_id,
                cluster_area_key,
                cluster_label,
                centroid_latitude,
                centroid_longitude,
                bounds,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, 'Pending')
            ON CONFLICT (barangay, cluster_area_key)
            WHERE status <> 'Resolved'
            DO UPDATE SET
                cluster_result_id = EXCLUDED.cluster_result_id,
                cluster_label = EXCLUDED.cluster_label,
                centroid_latitude = EXCLUDED.centroid_latitude,
                centroid_longitude = EXCLUDED.centroid_longitude,
                bounds = EXCLUDED.bounds,
                resolved_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
            `,
            [
                barangayId,
                barangay,
                clusterResultId,
                areaKey,
                label,
                cluster.lat,
                cluster.lng,
                bounds
            ]
        );

        const assignment = rows[0];
        await this.refreshAssignmentMembers(assignment.id, cluster);
        return assignment;
    }

    async resolveUnmatchedAssignments(activeAssignments, matchedIds) {
        const unmatched = activeAssignments.filter((assignment) => !matchedIds.has(assignment.id));
        for (const assignment of unmatched) {
            // Before auto-resolving, check if a report exists
            const [reportRows] = await this.db.execute(
                'SELECT id FROM deployment_reports WHERE assignment_id = ? LIMIT 1',
                [assignment.id]
            );
            if (reportRows.length > 0) {
                // Skip auto-resolution — this assignment has field activity
                continue;
            }

            await this.db.execute(
                `
                UPDATE cluster_assignments
                SET status = 'Resolved',
                    resolved_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND status IN ('Pending', 'In Progress')
                `,
                [assignment.id]
            );

            await safeRecordAuditEvent({
                actor: { id: null, role: 'System', name: 'DBSCAN Auto-Resolver' },
                action: 'CLUSTER_AUTO_RESOLVED',
                targetEntity: 'cluster_assignments',
                targetRecordId: assignment.id,
                targetName: assignment.cluster_label,
                barangay: assignment.barangay,
                oldValues: { status: assignment.status },
                newValues: { status: 'Resolved' },
                metadata: { reason: 'No matching DBSCAN cluster in latest run' }
            });
        }
    }

    async syncDeploymentsForBarangay(barangayInput) {
        const barangay = this.normalizeBarangay(barangayInput);
        if (!barangay) {
            const err = new Error('Barangay scope is required for cluster deployments.');
            err.status = 400;
            throw err;
        }

        const spatialData = await this.infantService.getSpatialTriage({
            barangay,
            eps: FIXED_RADIUS_METERS,
            minPts: FIXED_MIN_INFANTS,
            scope: 'defaulter'
        });

        const clusters = Array.isArray(spatialData?.clusters) ? spatialData.clusters : [];
        const barangayId = await this.getBarangayId(barangay);
        const activeAssignments = await this.getActiveAssignments(barangay);
        const matchedIds = new Set();

        for (const cluster of clusters) {
            const areaKey = this.generateClusterAreaKey(barangay, cluster);
            const match = this.findMatchingAssignment(cluster, activeAssignments, areaKey);
            if (match) matchedIds.add(match.id);

            const assignment = await this.upsertAssignmentForCluster({
                barangay,
                barangayId,
                cluster,
                existingAssignment: match,
                areaKey
            });
            matchedIds.add(assignment.id);
        }

        await this.resolveUnmatchedAssignments(activeAssignments, matchedIds);
        return this.listDeploymentsForBarangay(barangay);
    }

    async listDeploymentsForBarangay(barangay) {
        const [rows] = await this.db.execute(
            `
            SELECT
                ca.*,
                assigned_user.full_name AS assigned_user_name,
                assigned_user.role AS assigned_user_role,
                assigned_user.full_name AS assigned_bhw_name,
                admin.full_name AS assigned_by_admin_name,
                COUNT(DISTINCT cam.infant_id)::int AS infant_count,
                COALESCE(
                    SUM(CASE
                        WHEN s.status IN ('OVERDUE', 'DEFAULTER')
                         AND s.actual_date IS NULL
                        THEN 1 ELSE 0
                    END),
                    0
                )::int AS total_defaulter_doses,
                COALESCE(
                    SUM(CASE
                        WHEN s.status IN ('DUE_TODAY', 'DUE_SOON')
                         AND s.actual_date IS NULL
                        THEN 1 ELSE 0
                    END),
                    0
                )::int AS total_due_doses,
                COALESCE(
                    JSON_AGG(DISTINCT cam.infant_id) FILTER (WHERE cam.infant_id IS NOT NULL),
                    '[]'::json
                ) AS infant_ids,
                COALESCE(
                    (
                        SELECT JSON_AGG(
                            JSON_BUILD_OBJECT(
                                'id', i2.id,
                                'reference_id', i2.reference_id,
                                'first_name', i2.first_name,
                                'middle_name', i2.middle_name,
                                'last_name', i2.last_name,
                                'patient_name', TRIM(CONCAT(i2.first_name, ' ', i2.last_name)),
                                'barangay', i2.barangay,
                                'purok', i2.purok,
                                'exact_address', i2.exact_address,
                                'lat', i2.latitude,
                                'lng', i2.longitude,
                                'mapping_readiness', CASE WHEN i2.latitude IS NOT NULL AND i2.longitude IS NOT NULL THEN (CASE WHEN i2.is_location_verified = TRUE THEN 'Verified' ELSE 'Approximate' END) ELSE 'Unmapped' END,
                                'urgency', COALESCE(
                                    (
                                        SELECT COALESCE(
                                            MAX(CASE WHEN COALESCE(s2.earliest_allowed_date, s2.recommended_date)::date < CURRENT_DATE THEN 'defaulter' END),
                                            MAX(CASE WHEN COALESCE(s2.earliest_allowed_date, s2.recommended_date)::date = CURRENT_DATE THEN 'due_soon' END),
                                            MAX(CASE
                                                WHEN COALESCE(s2.earliest_allowed_date, s2.recommended_date)::date > CURRENT_DATE
                                                 AND COALESCE(s2.earliest_allowed_date, s2.recommended_date)::date <= CURRENT_DATE + INTERVAL '7 days'
                                                THEN 'due_soon'
                                            END),
                                            MAX(CASE WHEN COALESCE(s2.earliest_allowed_date, s2.recommended_date)::date > CURRENT_DATE + INTERVAL '7 days' THEN 'on_track' END),
                                            'completed'
                                        )
                                        FROM infant_schedules s2
                                        WHERE s2.infant_id = i2.id
                                          AND s2.status NOT IN ('COMPLETED', 'INELIGIBLE', 'EXPIRED', 'PENDING_VALIDATION')
                                    ),
                                    'completed'
                                )
                            )
                            ORDER BY i2.last_name, i2.first_name
                        )
                        FROM cluster_assignment_members cam2
                        JOIN infants i2 ON i2.id = cam2.infant_id
                        WHERE cam2.assignment_id = ca.id
                    ),
                    '[]'::json
                ) AS points
            FROM cluster_assignments ca
            LEFT JOIN users assigned_user ON assigned_user.id = ca.assigned_bhw_id
            LEFT JOIN users admin ON admin.id = ca.assigned_by_admin_id
            LEFT JOIN cluster_assignment_members cam ON cam.assignment_id = ca.id
            LEFT JOIN infants i ON i.id = cam.infant_id
            LEFT JOIN infant_schedules s ON s.infant_id = i.id
                AND s.status NOT IN ('COMPLETED', 'INELIGIBLE', 'EXPIRED', 'PENDING_VALIDATION')
            WHERE UPPER(TRIM(ca.barangay)) = UPPER(TRIM(?))
              AND ca.status IN ('Pending', 'In Progress')
            GROUP BY ca.id, assigned_user.full_name, assigned_user.role, admin.full_name
            ORDER BY
                CASE ca.status WHEN 'In Progress' THEN 0 ELSE 1 END,
                ca.updated_at DESC
            `,
            [barangay]
        );

        return rows.map((row) => ({
            ...row,
            cluster_priority: true,
            fixed_radius_meters: FIXED_RADIUS_METERS,
            fixed_min_infants: FIXED_MIN_INFANTS,
            infant_ids: row.infant_ids || [],
            points: row.points || []
        }));
    }

    async listActiveStaffOptions(barangay) {
        const [rows] = await this.db.execute(
            `
            SELECT id, full_name, role, assigned_barangay
            FROM users
            WHERE role IN ('BHW', 'Midwife', 'Nurse')
              AND is_active = TRUE
              AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))
            ORDER BY
                CASE role WHEN 'BHW' THEN 0 WHEN 'Midwife' THEN 1 WHEN 'Nurse' THEN 2 ELSE 3 END,
                full_name ASC,
                id ASC
            `,
            [barangay]
        );
        return rows;
    }

    async listActiveBhwOptions(barangay) {
        const staff = await this.listActiveStaffOptions(barangay);
        return staff.filter((person) => person.role === 'BHW');
    }

    async assignDeployment({ assignmentId, assignedStaffId, adminUser }) {
        const barangay = this.normalizeBarangay(adminUser?.assigned_barangay);
        if (!barangay) {
            const err = new Error('Admin barangay scope is required.');
            err.status = 400;
            throw err;
        }

        const [assignmentRows] = await this.db.execute(
            `
            SELECT *
            FROM cluster_assignments
            WHERE id = ?
              AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))
              AND status IN ('Pending', 'In Progress')
            LIMIT 1
            `,
            [assignmentId, barangay]
        );

        if (!assignmentRows.length) {
            const err = new Error('Cluster deployment not found in your barangay scope.');
            err.status = 404;
            throw err;
        }

        const [staffRows] = await this.db.execute(
            `
            SELECT id, full_name, role, assigned_barangay
            FROM users
            WHERE id = ?
              AND role IN ('BHW', 'Midwife', 'Nurse')
              AND is_active = TRUE
              AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))
            LIMIT 1
            `,
            [assignedStaffId, barangay]
        );

        if (!staffRows.length) {
            const err = new Error('Selected staff member is inactive or outside this barangay.');
            err.status = 400;
            throw err;
        }

        const [rows] = await this.db.execute(
            `
            UPDATE cluster_assignments
            SET assigned_bhw_id = ?,
                assigned_by_admin_id = ?,
                status = 'Pending',
                assigned_at = CURRENT_TIMESTAMP,
                resolved_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            RETURNING *
            `,
            [assignedStaffId, adminUser.id, assignmentId]
        );

        const assignment = {
            ...rows[0],
            assigned_staff_id: assignedStaffId,
            assigned_user_name: staffRows[0].full_name,
            assigned_user_role: staffRows[0].role,
            assigned_bhw_name: staffRows[0].full_name
        };

        await safeRecordAuditEvent({
            actor: adminUser,
            action: 'CLUSTER_ASSIGNMENT_ASSIGNED',
            targetEntity: 'cluster_assignments',
            targetRecordId: assignmentId,
            targetName: assignment.cluster_label || assignmentRows[0].cluster_label || 'Cluster Deployment',
            barangay: assignment.barangay || barangay,
            oldValues: assignmentRows[0],
            newValues: assignment,
            metadata: {
                assigned_staff_name: staffRows[0].full_name,
                assigned_staff_role: staffRows[0].role
            }
        });

        try {
            const NotificationService = require('../notifications/NotificationService');
            const notificationService = new NotificationService(this.db);
            await notificationService.createDeploymentAssignedNotification({
                assignment,
                staff: staffRows[0],
                adminUser
            });
        } catch (notifErr) {
            console.warn('[Deployment Assign Notification] Failed to send notification:', notifErr.message);
        }

        return {
            assignment,
            staff: staffRows[0],
            bhw: staffRows[0],
            previous_assignment: assignmentRows[0]
        };
    }

    async getActiveDeploymentsForAssignedUser(user) {
        const [rows] = await this.db.execute(
            `
            SELECT
                ca.*,
                assigned_user.full_name AS assigned_user_name,
                assigned_user.role AS assigned_user_role,
                COUNT(DISTINCT cam.infant_id)::int AS infant_count,
                COALESCE(
                    SUM(CASE
                        WHEN s.status IN ('OVERDUE', 'DEFAULTER')
                         AND s.actual_date IS NULL
                        THEN 1 ELSE 0
                    END),
                    0
                )::int AS total_defaulter_doses,
                COALESCE(
                    SUM(CASE
                        WHEN s.status IN ('DUE_TODAY', 'DUE_SOON')
                         AND s.actual_date IS NULL
                        THEN 1 ELSE 0
                    END),
                    0
                )::int AS total_due_doses,
                COALESCE(
                    JSON_AGG(DISTINCT cam.infant_id) FILTER (WHERE cam.infant_id IS NOT NULL),
                    '[]'::json
                ) AS infant_ids,
                COALESCE(
                    (
                        SELECT JSON_AGG(
                            JSON_BUILD_OBJECT(
                                'id', i2.id,
                                'reference_id', i2.reference_id,
                                'first_name', i2.first_name,
                                'middle_name', i2.middle_name,
                                'last_name', i2.last_name,
                                'patient_name', TRIM(CONCAT(i2.first_name, ' ', i2.last_name)),
                                'barangay', i2.barangay,
                                'purok', i2.purok,
                                'exact_address', i2.exact_address,
                                'lat', i2.latitude,
                                'lng', i2.longitude,
                                'mapping_readiness', CASE WHEN i2.latitude IS NOT NULL AND i2.longitude IS NOT NULL THEN (CASE WHEN i2.is_location_verified = TRUE THEN 'Verified' ELSE 'Approximate' END) ELSE 'Unmapped' END,
                                'urgency', COALESCE(
                                    (
                                        SELECT COALESCE(
                                            MAX(CASE WHEN COALESCE(s2.earliest_allowed_date, s2.recommended_date)::date < CURRENT_DATE THEN 'defaulter' END),
                                            MAX(CASE WHEN COALESCE(s2.earliest_allowed_date, s2.recommended_date)::date = CURRENT_DATE THEN 'due_soon' END),
                                            MAX(CASE
                                                WHEN COALESCE(s2.earliest_allowed_date, s2.recommended_date)::date > CURRENT_DATE
                                                 AND COALESCE(s2.earliest_allowed_date, s2.recommended_date)::date <= CURRENT_DATE + INTERVAL '7 days'
                                                THEN 'due_soon'
                                            END),
                                            MAX(CASE WHEN COALESCE(s2.earliest_allowed_date, s2.recommended_date)::date > CURRENT_DATE + INTERVAL '7 days' THEN 'on_track' END),
                                            'completed'
                                        )
                                        FROM infant_schedules s2
                                        WHERE s2.infant_id = i2.id
                                          AND s2.status NOT IN ('COMPLETED', 'INELIGIBLE', 'EXPIRED', 'PENDING_VALIDATION')
                                    ),
                                    'completed'
                                )
                            )
                            ORDER BY i2.last_name, i2.first_name
                        )
                        FROM cluster_assignment_members cam2
                        JOIN infants i2 ON i2.id = cam2.infant_id
                        WHERE cam2.assignment_id = ca.id
                    ),
                    '[]'::json
                ) AS points
            FROM cluster_assignments ca
            LEFT JOIN users assigned_user ON assigned_user.id = ca.assigned_bhw_id
            LEFT JOIN cluster_assignment_members cam ON cam.assignment_id = ca.id
            LEFT JOIN infants i ON i.id = cam.infant_id
            LEFT JOIN infant_schedules s ON s.infant_id = i.id
                AND s.status NOT IN ('COMPLETED', 'INELIGIBLE', 'EXPIRED', 'PENDING_VALIDATION')
            WHERE ca.assigned_bhw_id = ?
              AND ca.status IN ('Pending', 'In Progress')
              AND UPPER(TRIM(ca.barangay)) = UPPER(TRIM(?))
            GROUP BY ca.id, assigned_user.full_name, assigned_user.role
            ORDER BY ca.updated_at DESC
            `,
            [user.id, user.assigned_barangay]
        );

        return rows.map((row) => ({
            ...row,
            cluster_priority: true,
            fixed_radius_meters: FIXED_RADIUS_METERS,
            fixed_min_infants: FIXED_MIN_INFANTS,
            infant_ids: row.infant_ids || [],
            points: row.points || []
        }));
    }

    async getActiveDeploymentsForBhw(user) {
        return this.getActiveDeploymentsForAssignedUser(user);
    }
}

ClusterDeploymentService.FIXED_RADIUS_METERS = FIXED_RADIUS_METERS;
ClusterDeploymentService.FIXED_MIN_INFANTS = FIXED_MIN_INFANTS;
ClusterDeploymentService.ACTIVE_STATUSES = ACTIVE_STATUSES;

module.exports = ClusterDeploymentService;
