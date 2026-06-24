/**
 * m1_sql_crosscheck.js
 *
 * Manual SQL cross-check script for M1 Report verification (Infant-Only).
 * Compares M1ReportService output against direct SQL queries.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../db');
const M1ReportService = require('../services/M1ReportService');

// Normalize map for SQL comparison
const LEGACY_CODE_MAP = {
    'HEPB': 'HEPB-BD', 'HEPB_BIRTH': 'HEPB-BD', 'HEPB-BD': 'HEPB-BD', 'HEPATITIS_B': 'HEPB-BD',
    'PENTA': 'PENTA-1', 'PENTA1': 'PENTA-1', 'PENTA2': 'PENTA-2', 'PENTA3': 'PENTA-3',
    'PENTA-1': 'PENTA-1', 'PENTA-2': 'PENTA-2', 'PENTA-3': 'PENTA-3',
    'OPV': 'OPV-1', 'OPV1': 'OPV-1', 'OPV2': 'OPV-2', 'OPV3': 'OPV-3',
    'OPV-1': 'OPV-1', 'OPV-2': 'OPV-2', 'OPV-3': 'OPV-3',
    'IPV': 'IPV-1', 'IPV1': 'IPV-1', 'IPV-1': 'IPV-1',
    'MEASLES': 'MCV1', 'MCV': 'MCV1', 'MCV1': 'MCV1',
    'BCG': 'BCG'
};
const normalize = code => LEGACY_CODE_MAP[code] || code;

const month = parseInt(process.argv[2] || new Date().getMonth() + 1, 10);
const year = parseInt(process.argv[3] || new Date().getFullYear(), 10);
const barangay = process.argv[4] || undefined;

const pad = n => String(n).padStart(2, '0');
const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const cyan = s => `\x1b[36m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;

async function run() {
    console.log(bold(`\n═══ M1 CROSS-CHECK (INFANT ONLY): ${year}-${pad(month)}${barangay ? ` / ${barangay}` : ''} ═══\n`));

    const service = new M1ReportService(db);
    const report = await service.getM1Report({ month, year, barangay });

    console.log(cyan('Service FIC:'), JSON.stringify(report.fic));
    console.log(cyan('Service CPAB:'), JSON.stringify(report.cpab));
    console.log(cyan('FIC required vaccines:'), report._meta.fic_required_vaccines.join(', '));

    const reportingEnd = new Date(year, month, 0);
    const reportingEndStr = reportingEnd.toISOString().split('T')[0];

    // Born < 12 months ago at the end of the reporting month
    const dobLimit = new Date(reportingEnd);
    dobLimit.setFullYear(dobLimit.getFullYear() - 1);
    const dobLimitStr = dobLimit.toISOString().split('T')[0];

    const barangayClause = barangay ? `AND i.barangay = ${db.escape(barangay)}` : '';

    // Direct data verification (Infants only)
    const [infantsRaw] = await db.execute(`
        SELECT
            i.id, i.sex, i.cpab_status,
            GROUP_CONCAT(DISTINCT s.vaccine_code ORDER BY s.vaccine_code) AS vaccines
        FROM infants i
        LEFT JOIN infant_schedules s ON s.infant_id = i.id AND s.status = 'COMPLETED' AND s.actual_date <= ?
        WHERE i.dob > ? AND i.dob <= ?
          AND i.registration_status = 'Approved'
          ${barangayClause}
        GROUP BY i.id, i.sex, i.cpab_status
    `, [reportingEndStr, dobLimitStr, reportingEndStr]);

    const ficRequired = new Set(report._meta.fic_required_vaccines);
    let sqlFICm = 0, sqlFICf = 0, sqlCPABm = 0, sqlCPABf = 0;

    for (const row of infantsRaw) {
        const completed = new Set((row.vaccines ? row.vaccines.split(',') : []).map(normalize));
        const isFic = [...ficRequired].every(v => completed.has(v));
        const isCpab = row.cpab_status === 'Protected' || row.cpab_status === 'Yes';

        if (isFic) { if (row.sex === 'M') sqlFICm++; else sqlFICf++; }
        if (isCpab) { if (row.sex === 'M') sqlCPABm++; else sqlCPABf++; }
    }

    console.log('\n' + bold('── Summary Verification ──'));

    const ficMatch = sqlFICm === report.fic.male && sqlFICf === report.fic.female;
    console.log(ficMatch
        ? green(`  ✓ FIC counts MATCH (M=${sqlFICm}, F=${sqlFICf})`)
        : red(`  ✗ FIC MISMATCH: svc=${JSON.stringify(report.fic)} sql={M:${sqlFICm},F:${sqlFICf}}`)
    );

    const cpabMatch = sqlCPABm === report.cpab.male && sqlCPABf === report.cpab.female;
    console.log(cpabMatch
        ? green(`  ✓ CPAB counts MATCH (M=${sqlCPABm}, F=${sqlCPABf})`)
        : red(`  ✗ CPAB MISMATCH: svc=${JSON.stringify(report.cpab)} sql={M:${sqlCPABm},F:${sqlCPABf}}`)
    );

    // Vaccine table check
    const monthStart = `${year}-${pad(month)}-01`;
    const [vaccRaw] = await db.execute(`
        SELECT
            s.vaccine_code,
            SUM(CASE WHEN i.sex = 'M' THEN 1 ELSE 0 END) AS male,
            SUM(CASE WHEN i.sex = 'F' THEN 1 ELSE 0 END) AS female,
            COUNT(*) AS total
        FROM infant_schedules s
        INNER JOIN infants i ON i.id = s.infant_id
        WHERE s.status = 'COMPLETED'
          AND s.actual_date BETWEEN ? AND ?
          AND i.dob > ? AND i.dob <= ?
          AND i.registration_status = 'Approved'
          ${barangayClause}
        GROUP BY s.vaccine_code
    `, [monthStart, reportingEndStr, dobLimitStr, reportingEndStr]);

    const sqlVaccMap = {};
    for (const row of vaccRaw) {
        const canonical = normalize(row.vaccine_code);
        if (!sqlVaccMap[canonical]) sqlVaccMap[canonical] = { male: 0, female: 0, total: 0 };
        sqlVaccMap[canonical].male += Number(row.male);
        sqlVaccMap[canonical].female += Number(row.female);
        sqlVaccMap[canonical].total += Number(row.total);
    }

    console.log('\n' + bold('── Per-Vaccine Table (this month) ──'));
    let allVaccMatch = true;
    for (const svcRow of report.vaccines) {
        const canonical = svcRow.vaccine_code;
        const sqlCounts = sqlVaccMap[canonical] || { male: 0, female: 0, total: 0 };
        const match = svcRow.total === sqlCounts.total && svcRow.male === sqlCounts.male && svcRow.female === sqlCounts.female;
        if (!match) allVaccMatch = false;
        const mark = match ? green('✔') : red('✗');
        console.log(`  ${mark} ${canonical.padEnd(10)} Service: M=${svcRow.male} F=${svcRow.female} T=${svcRow.total} | SQL: M=${sqlCounts.male} F=${sqlCounts.female} T=${sqlCounts.total}`);
    }

    console.log(allVaccMatch
        ? green('\n  ✓ All vaccine table counts MATCH')
        : red('\n  ✗ Some vaccine table counts DO NOT MATCH')
    );

    console.log('\n' + bold('═══ CROSS-CHECK COMPLETE ═══\n'));
    process.exit(0);
}

run().catch(err => {
    console.error('\x1b[31mCross-check failed:\x1b[0m', err);
    process.exit(1);
});
