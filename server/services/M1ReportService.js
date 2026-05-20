/**
 * M1ReportService.js
 * DOH M1 Immunization Report – Data Computation Service
 * 
 * Re-scoped for IMMUNICARE: Focuses exclusively on newborns and infants (0–11 months).
 * 
 * Definitions:
 * 
 *  FIC (Fully Immunized Child, <12 months):
 *    An infant aged <12 months who has COMPLETED all of the following:
 *      BCG x1, HEPB-BD x1, PENTA-1/2/3 (3 doses), OPV-1/2/3 (3 doses), IPV-1 x1, MCV1 x1
 *    (PCV is excluded from the core FIC definition per RHU request).
 *    IPV-1 is counted if a record exists; if IPV-1 records are absent from the DB,
 *    that check is gracefully skipped (safe-zero).
 * 
 *  CPAB (Child Protected At Birth):
 *    Count of infants whose registration indicates maternal protection coverage 
 *    (TT history or birth setting criteria).
 * 
 *  Safe-zero rule: If no rows with a given vaccine_code exist at all in infant_schedules,
 *  that vaccine requirement is excluded from the completeness check (not a blocker).
 */

'use strict';

/**
 * LEGACY_CODE_MAP
 * Maps all known legacy / variant vaccine codes in infant_schedules
 * to their canonical M1 display codes.
 * Add entries here as new legacy codes are discovered.
 */
const LEGACY_CODE_MAP = {
    // Hepatitis B birth dose variants
    'HEPB': 'HEPB-BD',
    'HEPB_BIRTH': 'HEPB-BD',
    'HEPB-BD': 'HEPB-BD',
    'HEPATITIS_B': 'HEPB-BD',
    // Pentavalent variants
    'PENTA': 'PENTA-1',  // ambiguous legacy — map to first dose
    'PENTA1': 'PENTA-1',
    'PENTA2': 'PENTA-2',
    'PENTA3': 'PENTA-3',
    'PENTA-1': 'PENTA-1',
    'PENTA-2': 'PENTA-2',
    'PENTA-3': 'PENTA-3',
    // OPV variants
    'OPV': 'OPV-1',   // ambiguous legacy — map to first dose
    'OPV1': 'OPV-1',
    'OPV2': 'OPV-2',
    'OPV3': 'OPV-3',
    'OPV-1': 'OPV-1',
    'OPV-2': 'OPV-2',
    'OPV-3': 'OPV-3',
    // IPV variants
    'IPV': 'IPV-1',   // ambiguous legacy — map to first dose
    'IPV1': 'IPV-1',
    'IPV2': 'IPV-2',
    'IPV-1': 'IPV-1',
    'IPV-2': 'IPV-2',
    // PCV variants
    'PCV': 'PCV-1',   // ambiguous legacy — map to first dose
    'PCV1': 'PCV-1',
    'PCV2': 'PCV-2',
    'PCV3': 'PCV-3',
    'PCV-1': 'PCV-1',
    'PCV-2': 'PCV-2',
    'PCV-3': 'PCV-3',
    // MCV / Measles variants
    'MEASLES': 'MCV1',
    'MCV': 'MCV1',
    'MCV1': 'MCV1',
    'MCV2': 'MMR-2',
    'MMR': 'MMR-2',
    'MMR-2': 'MMR-2',
    // BCG
    'BCG': 'BCG'
};

/** Normalize a single raw vaccine code to its canonical form. */
const normalize = (code) => LEGACY_CODE_MAP[code] || code;

const FIC_BASE_VACCINES = [
    'BCG',
    'HEPB-BD',
    'PENTA-1', 'PENTA-2', 'PENTA-3',
    'OPV-1', 'OPV-2', 'OPV-3',
    'MCV1',
    // IPV-1 is included but will be filtered out if no IPV-1 records exist globally
    'IPV-1'
];

class M1ReportService {
    /**
     * @param {import('mysql2/promise').Pool} db
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Returns the set of vaccine codes that actually have at least one row
     * in infant_schedules (globally). Used for safe-zero filtering.
     * @private
     */
    async _getKnownVaccineCodes() {
        const [rows] = await this.db.execute(
            `SELECT DISTINCT vaccine_code FROM infant_schedules`
        );
        // Normalize all raw codes to canonical, so IPV-1/IPV1/IPV all register as 'IPV-1'
        return new Set(rows.map(r => normalize(r.vaccine_code)));
    }

    /**
     * Build the effective FIC vaccine set, excluding IPV-1 when no records exist.
     * @param {Set<string>} knownCodes
     * @returns {string[]}
     */
    _effectiveFicVaccines(knownCodes) {
        return FIC_BASE_VACCINES.filter(code => {
            // IPV-1: only required if any records exist globally
            if (code === 'IPV-1') return knownCodes.has('IPV-1');
            return true;
        });
    }

    /**
     * Generate the M1 report for a given month/year, optionally filtered by barangay.
     *
     * @param {object} params
     * @param {number} params.month  1-12
     * @param {number} params.year   e.g. 2026
     * @param {string} [params.barangay]  optional barangay filter (exact match on infants.barangay)
     * @returns {Promise<M1ReportResult>}
     */
    async getM1Report({ month, year, barangay } = {}) {
        const targetMonth = month || new Date().getMonth() + 1;
        const targetYear = year || new Date().getFullYear();

        // Discover which vaccine codes exist (for safe-zero IPV handling)
        const knownCodes = await this._getKnownVaccineCodes();
        const ficVaccines = this._effectiveFicVaccines(knownCodes);

        // Build optional barangay WHERE clause
        const barangayClause = barangay ? `AND i.barangay = ?` : '';
        const barangayParam = barangay ? [barangay] : [];

        // End of reporting month (last day)
        const reportingPeriodEnd = new Date(targetYear, targetMonth, 0); // last day of month
        const reportingPeriodEndStr = reportingPeriodEnd.toISOString().split('T')[0];

        // Age bounds (DOB ranges) - STRICT 0-11 MONTHS ONLY
        const dob12mStart = new Date(reportingPeriodEnd);
        dob12mStart.setDate(dob12mStart.getDate() - 364);
        const dob12mStartStr = dob12mStart.toISOString().split('T')[0];

        // ── 1. FIC and CPAB Calculation ──────────────────────────────────────────

        // Fetch infants in age range with their completed vaccines and CPAB status
        const sql = `
            SELECT
                i.id           AS infant_id,
                i.sex          AS sex,
                i.cpab_status  AS cpab_status,
                STRING_AGG(DISTINCT s.vaccine_code, ',') AS vaccine_list
            FROM infants i
            LEFT JOIN infant_schedules s
                ON s.infant_id = i.id
                AND s.status = 'COMPLETED'
                AND s.actual_date <= ?
                AND (s.actual_date - i.dob) < 365
            WHERE i.dob BETWEEN ? AND ?
              ${barangayClause}
            GROUP BY i.id, i.sex, i.cpab_status
        `;
        const params = [reportingPeriodEndStr, dob12mStartStr, reportingPeriodEndStr, ...barangayParam];
        const [infantsData] = await this.db.execute(sql, params);

        let maleFIC = 0, femaleFIC = 0;
        let maleCPAB = 0, femaleCPAB = 0;

        const normalizeList = (vaccineList) =>
            new Set((vaccineList || '').split(',').filter(Boolean).map(normalize));

        const isFIC = (vaccineList) => {
            if (!vaccineList) return false;
            const completed = normalizeList(vaccineList);
            return ficVaccines.every(v => completed.has(v));
        };

        const isProtected = (status) => {
            if (!status) return false;
            const s = status.toString().toUpperCase();
            return s === 'PROTECTED' || s === 'YES' || status === true;
        };

        for (const row of infantsData) {
            // Count FIC
            if (isFIC(row.vaccine_list)) {
                if (row.sex === 'M') maleFIC++;
                else if (row.sex === 'F') femaleFIC++;
            }
            // Count CPAB
            if (isProtected(row.cpab_status)) {
                if (row.sex === 'M') maleCPAB++;
                else if (row.sex === 'F') femaleCPAB++;
            }
        }

        // ── 2. Per-vaccine counts for the M1 table ──────────────────────────────
        const vaccineCols = [
            'BCG', 'HEPB-BD',
            'PENTA-1', 'PENTA-2', 'PENTA-3',
            'OPV-1', 'OPV-2', 'OPV-3',
            'IPV-1', 'MCV1'
        ];

        const vaccineSql = `
            SELECT
                s.vaccine_code,
                SUM(CASE WHEN i.sex = 'M' THEN 1 ELSE 0 END) AS male,
                SUM(CASE WHEN i.sex = 'F' THEN 1 ELSE 0 END) AS female,
                COUNT(*) AS total
            FROM infant_schedules s
            INNER JOIN infants i ON i.id = s.infant_id
            WHERE s.status = 'COMPLETED'
              AND s.actual_date BETWEEN ? AND ?
              AND i.dob BETWEEN ? AND ?
              AND (s.actual_date - i.dob) < 365
              ${barangayClause}
            GROUP BY s.vaccine_code
        `;

        const monthStart = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const [vaccineRows] = await this.db.execute(vaccineSql, [
            monthStart, reportingPeriodEndStr,
            dob12mStartStr, reportingPeriodEndStr,
            ...barangayParam
        ]);

        const vaccineMap = {};
        for (const r of vaccineRows) {
            const canonical = normalize(r.vaccine_code);
            if (!vaccineMap[canonical]) {
                vaccineMap[canonical] = { male: 0, female: 0, total: 0 };
            }
            vaccineMap[canonical].male += Number(r.male);
            vaccineMap[canonical].female += Number(r.female);
            vaccineMap[canonical].total += Number(r.total);
        }

        const vaccineTable = vaccineCols.map(code => ({
            vaccine_code: code,
            male: vaccineMap[code]?.male ?? 0,
            female: vaccineMap[code]?.female ?? 0,
            total: vaccineMap[code]?.total ?? 0
        }));

        // ── 3. Assemble response ──────────────────────────────────────────────────
        return {
            report_month: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
            barangay: barangay || null,
            generated_at: new Date().toISOString(),
            ipv1_tracked: knownCodes.has('IPV-1'),
            fic: {
                male: maleFIC,
                female: femaleFIC,
                total: maleFIC + femaleFIC
            },
            cpab: {
                male: maleCPAB,
                female: femaleCPAB,
                total: maleCPAB + femaleCPAB
            },
            vaccines: vaccineTable,
            _meta: {
                fic_required_vaccines: ficVaccines
            }
        };
    }
}

module.exports = M1ReportService;
