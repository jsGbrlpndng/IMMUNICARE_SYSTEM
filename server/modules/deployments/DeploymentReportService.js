const { v4: uuidv4 } = require('uuid');
const { ROLES } = require('../../config/constants/domain');
const { safeRecordAuditEvent } = require('../../shared/utils/auditLedger');
const NotificationService = require('../notifications/NotificationService');

class DeploymentReportService {
    constructor(db) {
        this.db = db;
        this.notificationService = new NotificationService(db);
    }

    async submitReport({ assignmentId, user, outcomes = [], summaryNotes = null }) {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Fetch and validate assignment
            const [assignments] = await connection.execute(
                'SELECT * FROM cluster_assignments WHERE id = ? LIMIT 1',
                [assignmentId]
            );
            const assignment = assignments[0];
            if (!assignment) {
                const err = new Error('Deployment assignment not found.');
                err.status = 404;
                throw err;
            }

            // Verify user is the assigned staff
            if (assignment.assigned_bhw_id !== user.id && user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.ADMIN) {
                const err = new Error('Forbidden: you are not the assigned staff for this deployment.');
                err.status = 403;
                throw err;
            }

            // 2. Validate infant IDs belong to this cluster assignment
            const [members] = await connection.execute(
                'SELECT infant_id FROM cluster_assignment_members WHERE assignment_id = ?',
                [assignmentId]
            );
            const memberIds = new Set(members.map(m => m.infant_id));

            for (const outcome of outcomes) {
                if (!memberIds.has(outcome.infant_id)) {
                    const err = new Error(`Infant ID ${outcome.infant_id} does not belong to this cluster assignment.`);
                    err.status = 400;
                    throw err;
                }
            }

            // 3. Compute statistics
            const total_infants = outcomes.length;
            const total_vaccinated = outcomes.filter(o => o.outcome === 'Fully Vaccinated' || o.outcome === 'Partially Vaccinated').length;
            const total_refused = outcomes.filter(o => o.outcome === 'Refused').length;
            const total_moved_out = outcomes.filter(o => o.outcome === 'Moved Out').length;
            const total_rescheduled = outcomes.filter(o => o.outcome === 'Rescheduled').length;

            const reportId = uuidv4();
            const now = new Date();

            // 4. Create deployment report row
            await connection.execute(`
                INSERT INTO deployment_reports (
                    id, assignment_id, submitted_by, submitted_at,
                    validation_status, barangay,
                    total_infants, total_vaccinated, total_refused,
                    total_moved_out, total_rescheduled, summary_notes,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                reportId,
                assignmentId,
                user.id,
                now,
                assignment.barangay,
                total_infants,
                total_vaccinated,
                total_refused,
                total_moved_out,
                total_rescheduled,
                summaryNotes,
                now,
                now
            ]);

            // 5. Create outcomes rows
            if (outcomes.length > 0) {
                const outcomeRows = outcomes.map(o => [
                    uuidv4(),
                    reportId,
                    o.infant_id,
                    o.outcome,
                    o.notes || null,
                    now
                ]);

                await connection.execute(`
                    INSERT INTO deployment_report_outcomes (
                        id, report_id, infant_id, outcome, notes, created_at
                    )
                    VALUES ?
                `, [outcomeRows]);
            }

            // 6. Update cluster assignment status to 'In Progress' (waiting for Admin validation)
            await connection.execute(`
                UPDATE cluster_assignments
                SET status = 'In Progress',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [assignmentId]);

            await connection.commit();

            // 7. Audit Logging (non-blocking or handled outside transaction to prevent lockup)
            const report = {
                id: reportId,
                assignment_id: assignmentId,
                submitted_by: user.id,
                barangay: assignment.barangay,
                cluster_label: assignment.cluster_label,
                total_infants,
                total_vaccinated,
                total_refused,
                total_moved_out,
                total_rescheduled
            };

            await safeRecordAuditEvent({
                actor: user,
                action: 'DEPLOYMENT_REPORT_SUBMITTED',
                targetEntity: 'deployment_reports',
                targetRecordId: reportId,
                targetName: assignment.cluster_label || 'Cluster Report',
                barangay: assignment.barangay,
                oldValues: {},
                newValues: report,
                metadata: {
                    assignment_id: assignmentId,
                    total_infants,
                    total_vaccinated,
                    total_refused
                }
            });

            // 8. Notifications
            try {
                await this.notificationService.createDeploymentReportSubmittedNotification({
                    report,
                    midwifeUser: user
                });
            } catch (notifErr) {
                console.warn('[Deployment Report Notification] Failed to send notification:', notifErr.message);
            }

            return report;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async validateReport({ reportId, adminUser, validationNotes = null }) {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Fetch report details
            const [reports] = await connection.execute(
                `SELECT dr.*, ca.cluster_label, ca.id AS assignment_id
                 FROM deployment_reports dr
                 JOIN cluster_assignments ca ON ca.id = dr.assignment_id
                 WHERE dr.id = ? LIMIT 1`,
                [reportId]
            );
            const report = reports[0];
            if (!report) {
                const err = new Error('Deployment report not found.');
                err.status = 404;
                throw err;
            }

            // Verify admin scope
            if (adminUser.role !== ROLES.SUPER_ADMIN && UPPER_TRIM(adminUser.assigned_barangay) !== UPPER_TRIM(report.barangay)) {
                const err = new Error('Forbidden: you are not the administrator for this barangay.');
                err.status = 403;
                throw err;
            }

            const now = new Date();

            // 2. Update report status to Validated
            await connection.execute(`
                UPDATE deployment_reports
                SET validation_status = 'Validated',
                    validated_by = ?,
                    validated_at = ?,
                    validation_notes = ?,
                    updated_at = ?
                WHERE id = ?
            `, [
                adminUser.id,
                now,
                validationNotes,
                now,
                reportId
            ]);

            // 3. Update cluster assignment to 'Resolved'
            await connection.execute(`
                UPDATE cluster_assignments
                SET status = 'Resolved',
                    resolved_at = ?,
                    updated_at = ?
                WHERE id = ?
            `, [
                now,
                now,
                report.assignment_id
            ]);

            await connection.commit();

            const updatedReport = {
                ...report,
                validation_status: 'Validated',
                validated_by: adminUser.id,
                validated_at: now,
                validation_notes: validationNotes
            };

            // 4. Audit Logging
            await safeRecordAuditEvent({
                actor: adminUser,
                action: 'DEPLOYMENT_REPORT_VALIDATED',
                targetEntity: 'deployment_reports',
                targetRecordId: reportId,
                targetName: report.cluster_label || 'Cluster Report',
                barangay: report.barangay,
                oldValues: report,
                newValues: updatedReport,
                metadata: {
                    report_id: reportId,
                    assignment_id: report.assignment_id,
                    notes: validationNotes
                }
            });

            // 5. Notifications
            try {
                await this.notificationService.createDeploymentReportValidatedNotification({
                    report: updatedReport,
                    adminUser
                });
            } catch (notifErr) {
                console.warn('[Deployment Validation Notification] Failed to send notification:', notifErr.message);
            }

            return updatedReport;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async rejectReport({ reportId, adminUser, validationNotes }) {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Fetch report details
            const [reports] = await connection.execute(
                `SELECT dr.*, ca.cluster_label, ca.id AS assignment_id
                 FROM deployment_reports dr
                 JOIN cluster_assignments ca ON ca.id = dr.assignment_id
                 WHERE dr.id = ? LIMIT 1`,
                [reportId]
            );
            const report = reports[0];
            if (!report) {
                const err = new Error('Deployment report not found.');
                err.status = 404;
                throw err;
            }

            // Verify admin scope
            if (adminUser.role !== ROLES.SUPER_ADMIN && UPPER_TRIM(adminUser.assigned_barangay) !== UPPER_TRIM(report.barangay)) {
                const err = new Error('Forbidden: you are not the administrator for this barangay.');
                err.status = 403;
                throw err;
            }

            const now = new Date();

            // 2. Update report status to Rejected
            await connection.execute(`
                UPDATE deployment_reports
                SET validation_status = 'Rejected',
                    validated_by = ?,
                    validated_at = ?,
                    validation_notes = ?,
                    updated_at = ?
                WHERE id = ?
            `, [
                adminUser.id,
                now,
                validationNotes,
                now,
                reportId
            ]);

            // 3. Keep cluster assignment status as 'In Progress' (so midwife can modify it)
            await connection.execute(`
                UPDATE cluster_assignments
                SET status = 'In Progress',
                    updated_at = ?
                WHERE id = ?
            `, [
                now,
                report.assignment_id
            ]);

            await connection.commit();

            const updatedReport = {
                ...report,
                validation_status: 'Rejected',
                validated_by: adminUser.id,
                validated_at: now,
                validation_notes: validationNotes
            };

            // 4. Audit Logging
            await safeRecordAuditEvent({
                actor: adminUser,
                action: 'DEPLOYMENT_REPORT_REJECTED',
                targetEntity: 'deployment_reports',
                targetRecordId: reportId,
                targetName: report.cluster_label || 'Cluster Report',
                barangay: report.barangay,
                oldValues: report,
                newValues: updatedReport,
                metadata: {
                    report_id: reportId,
                    assignment_id: report.assignment_id,
                    notes: validationNotes
                }
            });

            // 5. Notifications
            try {
                await this.notificationService.createDeploymentReportRejectedNotification({
                    report: updatedReport,
                    adminUser,
                    validationNotes
                });
            } catch (notifErr) {
                console.warn('[Deployment Rejection Notification] Failed to send notification:', notifErr.message);
            }

            return updatedReport;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async getReportForAssignment(assignmentId) {
        // Fetch report row
        const [reports] = await this.db.execute(`
            SELECT dr.*, u.full_name AS submitted_by_name, val.full_name AS validated_by_name
            FROM deployment_reports dr
            LEFT JOIN users u ON u.id = dr.submitted_by
            LEFT JOIN users val ON val.id = dr.validated_by
            WHERE dr.assignment_id = ?
            ORDER BY dr.submitted_at DESC
            LIMIT 1
        `, [assignmentId]);

        const report = reports[0];
        if (!report) return null;

        // Fetch outcome details
        const [outcomes] = await this.db.execute(`
            SELECT dro.*, i.first_name, i.middle_name, i.last_name, i.reference_id
            FROM deployment_report_outcomes dro
            JOIN infants i ON i.id = dro.infant_id
            WHERE dro.report_id = ?
            ORDER BY i.last_name, i.first_name
        `, [report.id]);

        return {
            ...report,
            outcomes
        };
    }
}

function UPPER_TRIM(val) {
    return String(val || '').trim().toUpperCase();
}

module.exports = DeploymentReportService;
