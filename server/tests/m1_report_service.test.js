/**
 * m1_report_service.test.js
 *
 * Unit tests for M1ReportService (Infant-Only Scope).
 * The DB is fully mocked — no real database connection required.
 */

'use strict';

const M1ReportService = require('../services/M1ReportService');

// Vaccine codes (mirrors the service constants)
const ALL_FIC_WITH_IPV1 = [
    'BCG', 'HEPB-BD', 'PENTA-1', 'PENTA-2', 'PENTA-3',
    'OPV-1', 'OPV-2', 'OPV-3', 'MCV1', 'IPV-1'
];
const ALL_FIC_WITHOUT_IPV1 = ALL_FIC_WITH_IPV1.filter(v => v !== 'IPV-1');

// ──────────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a mock DB whose execute() resolves based on call order.
 */
function buildMockDb(calls) {
    let i = 0;
    return {
        execute: jest.fn(async () => {
            const val = calls[i++];
            return [val ?? []];
        })
    };
}

/**
 * Produce a minimal infant row for infantsData result.
 */
function infantRow(sex, vaccineList, cpabStatus = 'Protected') {
    return {
        infant_id: `infant-${Math.random()}`,
        sex,
        cpab_status: cpabStatus,
        vaccine_list: vaccineList
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('M1ReportService', () => {

    // ── helper: build expected calls pattern ──────────────────────────────────
    // call 0: _getKnownVaccineCodes()
    // call 1: infantsData (FIC and CPAB)
    // call 2: vaccine per-month counts (table)

    describe('FIC Logic', () => {
        test('counts male and female FIC correctly when all vaccines are completed', async () => {
            const ficVaccineList = ALL_FIC_WITH_IPV1.join(',');
            const knownCodes = ALL_FIC_WITH_IPV1.map(code => ({ vaccine_code: code }));

            const db = buildMockDb([
                knownCodes,
                [infantRow('M', ficVaccineList), infantRow('F', ficVaccineList)],
                []
            ]);

            const service = new M1ReportService(db);
            const result = await service.getM1Report({ month: 2, year: 2026 });

            expect(result.fic.male).toBe(1);
            expect(result.fic.female).toBe(1);
            expect(result.fic.total).toBe(2);
        });

        test('does not count FIC when infant is missing one required vaccine', async () => {
            const incomplete = ALL_FIC_WITH_IPV1.filter(v => v !== 'OPV-3').join(',');
            const knownCodes = ALL_FIC_WITH_IPV1.map(code => ({ vaccine_code: code }));

            const db = buildMockDb([
                knownCodes,
                [infantRow('M', incomplete)],
                []
            ]);

            const service = new M1ReportService(db);
            const result = await service.getM1Report({ month: 2, year: 2026 });

            expect(result.fic.total).toBe(0);
        });
    });

    describe('CPAB Logic', () => {
        test('counts CPAB correctly for both sexes', async () => {
            const knownCodes = ALL_FIC_WITH_IPV1.map(code => ({ vaccine_code: code }));

            const db = buildMockDb([
                knownCodes,
                [
                    infantRow('M', '', 'Protected'),
                    infantRow('F', '', 'Yes'),
                    infantRow('M', '', 'No')
                ],
                []
            ]);

            const service = new M1ReportService(db);
            const result = await service.getM1Report({ month: 2, year: 2026 });

            expect(result.cpab.male).toBe(1);
            expect(result.cpab.female).toBe(1);
            expect(result.cpab.total).toBe(2);
        });
    });

    describe('IPV-1 Safe-Zero', () => {
        test('IPV-1 is required and counted when records exist in DB', async () => {
            const ficList = ALL_FIC_WITH_IPV1.join(',');
            const knownCodes = ALL_FIC_WITH_IPV1.map(c => ({ vaccine_code: c }));

            const db = buildMockDb([
                knownCodes,
                [infantRow('M', ficList)],
                []
            ]);
            const service = new M1ReportService(db);
            const result = await service.getM1Report({ month: 2, year: 2026 });

            expect(result.ipv1_tracked).toBe(true);
            expect(result._meta.fic_required_vaccines).toContain('IPV-1');
            expect(result.fic.total).toBe(1);
        });

        test('IPV-1 is excluded from FIC requirement when no records exist (safe-zero)', async () => {
            const knownCodes = ALL_FIC_WITHOUT_IPV1.map(c => ({ vaccine_code: c }));
            const ficList = ALL_FIC_WITHOUT_IPV1.join(',');

            const db = buildMockDb([
                knownCodes,
                [infantRow('F', ficList)],
                []
            ]);
            const service = new M1ReportService(db);
            const result = await service.getM1Report({ month: 2, year: 2026 });

            expect(result.ipv1_tracked).toBe(false);
            expect(result._meta.fic_required_vaccines).not.toContain('IPV-1');
            expect(result.fic.total).toBe(1);
        });
    });

    describe('Empty Data', () => {
        test('returns all zeros safely when no infants exist', async () => {
            const db = buildMockDb([[], [], []]);
            const service = new M1ReportService(db);
            const result = await service.getM1Report({ month: 1, year: 2026 });

            expect(result.fic.total).toBe(0);
            expect(result.cpab.total).toBe(0);
            expect(result.vaccines.length).toBe(10);
            result.vaccines.forEach(v => {
                expect(v.male).toBe(0);
                expect(v.female).toBe(0);
                expect(v.total).toBe(0);
            });
        });
    });

    describe('Vaccine Table', () => {
        test('vaccine table contains exactly 10 infant rows in standard order', async () => {
            const db = buildMockDb([[], [], []]);
            const service = new M1ReportService(db);
            const result = await service.getM1Report({ month: 2, year: 2026 });

            const codes = result.vaccines.map(v => v.vaccine_code);
            expect(codes).toEqual([
                'BCG', 'HEPB-BD',
                'PENTA-1', 'PENTA-2', 'PENTA-3',
                'OPV-1', 'OPV-2', 'OPV-3',
                'IPV-1', 'MCV1'
            ]);
        });
    });

    describe('Barangay Filter', () => {
        test('passes barangay into the query', async () => {
            const db = buildMockDb([[], [], []]);
            const service = new M1ReportService(db);

            await service.getM1Report({ month: 2, year: 2026, barangay: 'Barangay San Jose' });

            const calls = db.execute.mock.calls;
            const barangayUsed = calls.some(([sql, params]) =>
                Array.isArray(params) && params.includes('Barangay San Jose')
            );
            expect(barangayUsed).toBe(true);
        });
    });

    describe('Metadata', () => {
        test('report_month is formatted as YYYY-MM', async () => {
            const db = buildMockDb([[], [], []]);
            const service = new M1ReportService(db);
            const result = await service.getM1Report({ month: 3, year: 2026 });
            expect(result.report_month).toBe('2026-03');
        });
    });
});
