const DeploymentReportService = require('../../modules/deployments/DeploymentReportService');
const AuditLogService = require('../../modules/audit/AuditLogService');
const { ROLES } = require('../../config/constants/domain');

describe('DeploymentReportService', () => {
    let auditSpy;

    beforeEach(() => {
        auditSpy = jest.spyOn(AuditLogService.prototype, 'recordEvent').mockResolvedValue('audit-1');
    });

    afterEach(() => {
        auditSpy.mockRestore();
    });

    test('submitReport validates staff and infants, creates report and outcomes, and sends notification', async () => {
        const mockDb = {
            execute: jest.fn(async (sql, params) => {
                if (sql.includes('SELECT * FROM cluster_assignments')) {
                    return [[{
                        id: 'assignment-1',
                        assigned_bhw_id: 'bhw-1',
                        barangay: 'Langgam',
                        cluster_label: 'Priority Area 1'
                    }]];
                }
                if (sql.includes('SELECT infant_id FROM cluster_assignment_members')) {
                    return [[
                        { infant_id: 'infant-1' },
                        { infant_id: 'infant-2' }
                    ]];
                }
                if (sql.includes('INSERT INTO deployment_reports')) {
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('INSERT INTO deployment_report_outcomes')) {
                    return [{ affectedRows: 2 }];
                }
                if (sql.includes('UPDATE cluster_assignments')) {
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('SELECT id, role, assigned_barangay FROM users')) {
                    return [[
                        { id: 'admin-1', role: 'Admin', assigned_barangay: 'Langgam' }
                    ]];
                }
                if (sql.includes('INSERT INTO notifications')) {
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            }),
            getConnection: jest.fn(async () => ({
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                release: jest.fn(),
                execute: mockDb.execute
            }))
        };

        const service = new DeploymentReportService(mockDb);
        const report = await service.submitReport({
            assignmentId: 'assignment-1',
            user: { id: 'bhw-1', role: 'BHW' },
            outcomes: [
                { infant_id: 'infant-1', outcome: 'Fully Vaccinated', notes: 'Done' },
                { infant_id: 'infant-2', outcome: 'Refused', notes: 'Religious reasons' }
            ],
            summaryNotes: 'Visited all houses'
        });

        expect(report.total_infants).toBe(2);
        expect(report.total_vaccinated).toBe(1);
        expect(report.total_refused).toBe(1);
        expect(report.cluster_label).toBe('Priority Area 1');

        expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: 'DEPLOYMENT_REPORT_SUBMITTED',
            targetEntity: 'deployment_reports'
        }));
    });

    test('validateReport updates status to Validated and assignment to Resolved', async () => {
        const mockDb = {
            execute: jest.fn(async (sql, params) => {
                if (sql.includes('SELECT dr.*')) {
                    return [[{
                        id: 'report-1',
                        assignment_id: 'assignment-1',
                        submitted_by: 'bhw-1',
                        barangay: 'Langgam',
                        cluster_label: 'Priority Area 1'
                    }]];
                }
                if (sql.includes('UPDATE deployment_reports')) {
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('UPDATE cluster_assignments')) {
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('SELECT id, role, assigned_barangay FROM users')) {
                    return [[{ id: 'bhw-1', role: 'BHW', assigned_barangay: 'Langgam' }]];
                }
                if (sql.includes('INSERT INTO notifications')) {
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            }),
            getConnection: jest.fn(async () => ({
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                release: jest.fn(),
                execute: mockDb.execute
            }))
        };

        const service = new DeploymentReportService(mockDb);
        const report = await service.validateReport({
            reportId: 'report-1',
            adminUser: { id: 'admin-1', role: 'Admin', assigned_barangay: 'Langgam' },
            validationNotes: 'Good job'
        });

        expect(report.validation_status).toBe('Validated');
        expect(report.validation_notes).toBe('Good job');

        expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: 'DEPLOYMENT_REPORT_VALIDATED'
        }));
    });
});
