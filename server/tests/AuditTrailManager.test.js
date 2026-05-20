const AuditTrailManager = require('../services/AuditTrailManager');
const crypto = require('crypto');

describe('AuditTrailManager', () => {
    let auditManager;
    let mockDb;
    let mockExecute;

    beforeEach(() => {
        // Create mock database connection
        mockExecute = jest.fn();
        mockDb = {
            execute: mockExecute
        };

        auditManager = new AuditTrailManager(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('logAuthorizationAttempt', () => {
        it('should log authorization attempt with complete metadata', async () => {
            const request = {
                infantId: 'infant-123',
                vaccineId: 'BCG',
                midwifeId: 'midwife-456',
                requestId: 'request-789',
                overrideType: 'OVERDUE',
                clinicalJustification: 'Clinical reason for override',
                userAgent: 'Mozilla/5.0',
                ipAddress: '192.168.1.1',
                sessionId: 'session-abc',
                requestTimestamp: new Date('2024-01-15T10:00:00Z'),
                infantInfo: { name: 'Test Infant', dob: '2024-01-01' },
                midwifeInfo: { name: 'Test Midwife' },
                scheduleStatus: { status: 'overdue' }
            };

            mockExecute.mockResolvedValue([{ insertId: 1 }]);

            const auditId = await auditManager.logAuthorizationAttempt(request);

            // Verify audit ID is a valid UUID
            expect(auditId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

            // Verify database insert was called
            expect(mockExecute).toHaveBeenCalledTimes(1);
            const [query, params] = mockExecute.mock.calls[0];

            // Verify query structure
            expect(query).toContain('INSERT INTO authorization_audit');
            expect(query).toContain('audit_id');
            expect(query).toContain('infant_id');
            expect(query).toContain('vaccine_name');
            expect(query).toContain('midwife_id');
            expect(query).toContain('action_type');
            expect(query).toContain('is_immutable');

            // Verify parameters
            expect(params[0]).toBe(auditId); // audit_id
            expect(params[1]).toBe('infant-123'); // infant_id
            expect(params[2]).toBe('BCG'); // vaccine_name
            expect(params[3]).toBe('midwife-456'); // midwife_id
            expect(params[4]).toBe('REQUEST'); // action_type
            expect(params[5]).toBe('Clinical reason for override'); // clinical_justification
            expect(params[6]).toBe('OVERDUE'); // override_type

            // Verify compliance_status JSON
            const complianceStatus = JSON.parse(params[7]);
            expect(complianceStatus.compliant).toBeNull();
            expect(complianceStatus.attemptStage).toBe('REQUEST');

            // Verify session_metadata JSON
            const sessionMetadata = JSON.parse(params[8]);
            expect(sessionMetadata.requestId).toBe('request-789');
            expect(sessionMetadata.userAgent).toBe('Mozilla/5.0');
            expect(sessionMetadata.ipAddress).toBe('192.168.1.1');
            expect(sessionMetadata.infantInfo.name).toBe('Test Infant');
        });

        it('should generate unique audit IDs for each attempt', async () => {
            const request = {
                infantId: 'infant-123',
                vaccineId: 'BCG',
                midwifeId: 'midwife-456'
            };

            mockExecute.mockResolvedValue([{ insertId: 1 }]);

            const auditId1 = await auditManager.logAuthorizationAttempt(request);
            const auditId2 = await auditManager.logAuthorizationAttempt(request);

            expect(auditId1).not.toBe(auditId2);
        });

        it('should throw error when required fields are missing', async () => {
            const invalidRequest = {
                infantId: 'infant-123'
                // Missing vaccineId and midwifeId
            };

            await expect(auditManager.logAuthorizationAttempt(invalidRequest))
                .rejects.toThrow('Missing required fields');
        });

        it('should throw error when request is null', async () => {
            await expect(auditManager.logAuthorizationAttempt(null))
                .rejects.toThrow('Authorization request is required');
        });

        it('should use default values when optional fields are missing', async () => {
            const minimalRequest = {
                infantId: 'infant-123',
                vaccineId: 'BCG',
                midwifeId: 'midwife-456'
            };

            mockExecute.mockResolvedValue([{ insertId: 1 }]);

            const auditId = await auditManager.logAuthorizationAttempt(minimalRequest);

            expect(auditId).toBeDefined();
            expect(mockExecute).toHaveBeenCalledTimes(1);

            const [, params] = mockExecute.mock.calls[0];
            const sessionMetadata = JSON.parse(params[8]);

            // Verify default values
            expect(sessionMetadata.userAgent).toBe('ImmuniCare-System');
            expect(sessionMetadata.ipAddress).toBe('127.0.0.1');
            expect(params[5]).toBe('Pending justification'); // clinical_justification
            expect(params[6]).toBe('UNKNOWN'); // override_type
        });

        it('should ensure immutable flag is set to TRUE', async () => {
            const request = {
                infantId: 'infant-123',
                vaccineId: 'BCG',
                midwifeId: 'midwife-456'
            };

            mockExecute.mockResolvedValue([{ insertId: 1 }]);

            await auditManager.logAuthorizationAttempt(request);

            const [query] = mockExecute.mock.calls[0];
            expect(query).toContain('is_immutable');
            expect(query).toContain('TRUE');
        });

        it('should handle database errors gracefully', async () => {
            const request = {
                infantId: 'infant-123',
                vaccineId: 'BCG',
                midwifeId: 'midwife-456'
            };

            mockExecute.mockRejectedValue(new Error('Database connection failed'));

            await expect(auditManager.logAuthorizationAttempt(request))
                .rejects.toThrow('Failed to log authorization attempt');
        });
    });

    describe('logAuthorizationDecision', () => {
        it('should log approved authorization decision', async () => {
            const decision = {
                auditTrailId: 'audit-123',
                authorizationId: 'auth-456',
                request: {
                    infantId: 'infant-123',
                    vaccineId: 'BCG',
                    midwifeId: 'midwife-456',
                    clinicalJustification: 'Valid clinical reason',
                    overrideType: 'OVERDUE'
                },
                authorized: true,
                complianceResult: {
                    valid: true,
                    violations: [],
                    complianceScore: 100,
                    warnings: []
                },
                justificationResult: {
                    score: 95
                },
                reason: 'Authorization approved'
            };

            mockExecute.mockResolvedValue([{ insertId: 1 }]);

            const auditId = await auditManager.logAuthorizationDecision(decision);

            expect(auditId).toBe('audit-123');
            expect(mockExecute).toHaveBeenCalledTimes(1);

            const [, params] = mockExecute.mock.calls[0];
            expect(params[4]).toBe('APPROVED'); // action_type

            const complianceStatus = JSON.parse(params[7]);
            expect(complianceStatus.compliant).toBe(true);
            expect(complianceStatus.score).toBe(100);
        });

        it('should log rejected authorization decision', async () => {
            const decision = {
                request: {
                    infantId: 'infant-123',
                    vaccineId: 'BCG',
                    midwifeId: 'midwife-456',
                    clinicalJustification: 'Insufficient justification',
                    overrideType: 'OVERDUE'
                },
                authorized: false,
                complianceResult: {
                    valid: false,
                    violations: ['Minimum interval violation'],
                    complianceScore: 0
                },
                reason: 'DOH compliance violation'
            };

            mockExecute.mockResolvedValue([{ insertId: 1 }]);

            const auditId = await auditManager.logAuthorizationDecision(decision);

            expect(auditId).toBeDefined();
            expect(mockExecute).toHaveBeenCalledTimes(1);

            const [, params] = mockExecute.mock.calls[0];
            expect(params[4]).toBe('REJECTED'); // action_type

            const complianceStatus = JSON.parse(params[7]);
            expect(complianceStatus.compliant).toBe(false);
            expect(complianceStatus.violations).toContain('Minimum interval violation');
        });

        it('should not throw error on database failure', async () => {
            const decision = {
                request: {
                    infantId: 'infant-123',
                    vaccineId: 'BCG',
                    midwifeId: 'midwife-456'
                },
                authorized: true
            };

            mockExecute.mockRejectedValue(new Error('Database error'));

            const auditId = await auditManager.logAuthorizationDecision(decision);

            // Should return null instead of throwing
            expect(auditId).toBeNull();
        });
    });

    describe('logComplianceViolation', () => {
        it('should log compliance violation with details', async () => {
            const violation = {
                infantId: 'infant-123',
                vaccineId: 'BCG',
                midwifeId: 'midwife-456',
                violationType: 'MINIMUM_INTERVAL',
                violationDetails: ['Minimum interval of 28 days not met'],
                request: {
                    clinicalJustification: 'Attempted override',
                    overrideType: 'OVERDUE'
                }
            };

            mockExecute.mockResolvedValue([{ insertId: 1 }]);

            const auditId = await auditManager.logComplianceViolation(violation);

            expect(auditId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            expect(mockExecute).toHaveBeenCalledTimes(1);

            const [, params] = mockExecute.mock.calls[0];
            expect(params[4]).toBe('COMPLIANCE_VIOLATION'); // action_type

            const complianceStatus = JSON.parse(params[7]);
            expect(complianceStatus.compliant).toBe(false);
            expect(complianceStatus.violationType).toBe('MINIMUM_INTERVAL');
        });

        it('should throw error when required fields are missing', async () => {
            const invalidViolation = {
                infantId: 'infant-123'
                // Missing vaccineId and midwifeId
            };

            await expect(auditManager.logComplianceViolation(invalidViolation))
                .rejects.toThrow('Missing required fields');
        });
    });

    describe('generateAuditReport', () => {
        it('should generate audit report with records and statistics', async () => {
            const criteria = {
                startDate: '2024-01-01',
                endDate: '2024-01-31',
                limit: 10,
                offset: 0
            };

            const mockRecords = [
                {
                    audit_id: 'audit-1',
                    infant_id: 'infant-123',
                    vaccine_name: 'BCG',
                    midwife_id: 'midwife-456',
                    action_type: 'APPROVED',
                    clinical_justification: 'Valid reason',
                    override_type: 'OVERDUE',
                    compliance_status: JSON.stringify({ compliant: true }),
                    session_metadata: JSON.stringify({ timestamp: '2024-01-15' }),
                    created_at: '2024-01-15T10:00:00Z',
                    is_immutable: true
                }
            ];

            const mockActionTypeCounts = [
                { action_type: 'APPROVED', count: 5 },
                { action_type: 'REJECTED', count: 3 }
            ];

            const mockOverrideTypeCounts = [
                { override_type: 'OVERDUE', count: 6 },
                { override_type: 'OUT_OF_WINDOW', count: 2 }
            ];

            const mockApprovalData = [
                { approved: 5, rejected: 3, total: 8 }
            ];

            mockExecute
                .mockResolvedValueOnce([mockRecords]) // Main query
                .mockResolvedValueOnce([mockActionTypeCounts]) // Action type counts
                .mockResolvedValueOnce([mockOverrideTypeCounts]) // Override type counts
                .mockResolvedValueOnce([mockApprovalData]); // Approval data

            const report = await auditManager.generateAuditReport(criteria);

            expect(report.records).toHaveLength(1);
            expect(report.records[0].auditId).toBe('audit-1');
            expect(report.statistics.totalRecords).toBe(8);
            expect(report.statistics.approvalRate).toBe(62.5);
            expect(report.criteria).toEqual(criteria);
            expect(report.generatedAt).toBeDefined();
        });

        it('should filter by midwife ID', async () => {
            const criteria = {
                midwifeId: 'midwife-456'
            };

            mockExecute
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ approved: 0, rejected: 0, total: 0 }]]);

            await auditManager.generateAuditReport(criteria);

            const [query, params] = mockExecute.mock.calls[0];
            expect(query).toContain('midwife_id = ?');
            expect(params).toContain('midwife-456');
        });

        it('should handle empty results', async () => {
            mockExecute
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ approved: 0, rejected: 0, total: 0 }]]);

            const report = await auditManager.generateAuditReport({});

            expect(report.records).toHaveLength(0);
            expect(report.statistics.totalRecords).toBe(0);
        });
    });

    describe('exportAuditTrail', () => {
        it('should export audit trail as JSON', async () => {
            const criteria = { limit: 5 };
            const mockRecords = [
                {
                    audit_id: 'audit-1',
                    infant_id: 'infant-123',
                    vaccine_name: 'BCG',
                    midwife_id: 'midwife-456',
                    action_type: 'APPROVED',
                    clinical_justification: 'Valid reason',
                    override_type: 'OVERDUE',
                    compliance_status: JSON.stringify({ compliant: true }),
                    session_metadata: JSON.stringify({}),
                    created_at: '2024-01-15T10:00:00Z',
                    is_immutable: true
                }
            ];

            mockExecute
                .mockResolvedValueOnce([mockRecords])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ approved: 0, rejected: 0, total: 0 }]]);

            const result = await auditManager.exportAuditTrail('JSON', criteria);

            expect(typeof result).toBe('string');
            const parsed = JSON.parse(result);
            expect(parsed.records).toBeDefined();
            expect(parsed.statistics).toBeDefined();
        });

        it('should export audit trail as CSV', async () => {
            const criteria = { limit: 5 };
            const mockRecords = [
                {
                    audit_id: 'audit-1',
                    infant_id: 'infant-123',
                    vaccine_name: 'BCG',
                    midwife_id: 'midwife-456',
                    action_type: 'APPROVED',
                    clinical_justification: 'Valid reason',
                    override_type: 'OVERDUE',
                    compliance_status: JSON.stringify({ compliant: true }),
                    session_metadata: JSON.stringify({}),
                    created_at: '2024-01-15T10:00:00Z',
                    is_immutable: true
                }
            ];

            mockExecute
                .mockResolvedValueOnce([mockRecords])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ approved: 0, rejected: 0, total: 0 }]]);

            const result = await auditManager.exportAuditTrail('CSV', criteria);

            expect(typeof result).toBe('string');
            expect(result).toContain('Audit ID');
            expect(result).toContain('Vaccine Name');
            expect(result).toContain('audit-1');
            expect(result).toContain('BCG');
        });

        it('should throw error for unsupported format', async () => {
            await expect(auditManager.exportAuditTrail('XML', {}))
                .rejects.toThrow('Unsupported export format');
        });

        it('should throw error for PDF format (not implemented)', async () => {
            const mockRecords = [];
            mockExecute
                .mockResolvedValueOnce([mockRecords])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ approved: 0, rejected: 0, total: 0 }]]);

            await expect(auditManager.exportAuditTrail('PDF', {}))
                .rejects.toThrow('PDF export not yet implemented');
        });
    });

    describe('convertToCSV', () => {
        it('should convert records to CSV format', () => {
            const records = [
                {
                    auditId: 'audit-1',
                    vaccineName: 'BCG',
                    actionType: 'APPROVED',
                    overrideType: 'OVERDUE',
                    clinicalJustification: 'Valid clinical reason',
                    complianceStatus: { compliant: true },
                    createdAt: '2024-01-15T10:00:00Z'
                },
                {
                    auditId: 'audit-2',
                    vaccineName: 'Hepatitis B',
                    actionType: 'REJECTED',
                    overrideType: 'OUT_OF_WINDOW',
                    clinicalJustification: 'Insufficient justification',
                    complianceStatus: { compliant: false },
                    createdAt: '2024-01-16T11:00:00Z'
                }
            ];

            const csv = auditManager.convertToCSV(records);

            expect(csv).toContain('Audit ID,Vaccine Name,Action Type');
            expect(csv).toContain('audit-1,BCG,APPROVED');
            expect(csv).toContain('audit-2,Hepatitis B,REJECTED');
            expect(csv).toContain('Compliant');
            expect(csv).toContain('Non-Compliant');
        });

        it('should handle empty records', () => {
            const csv = auditManager.convertToCSV([]);
            expect(csv).toBe('No records to export');
        });

        it('should escape quotes in justification text', () => {
            const records = [
                {
                    auditId: 'audit-1',
                    vaccineName: 'BCG',
                    actionType: 'APPROVED',
                    overrideType: 'OVERDUE',
                    clinicalJustification: 'Patient said "I need this now"',
                    complianceStatus: { compliant: true },
                    createdAt: '2024-01-15T10:00:00Z'
                }
            ];

            const csv = auditManager.convertToCSV(records);

            // Quotes should be escaped as ""
            expect(csv).toContain('""I need this now""');
        });
    });
});
