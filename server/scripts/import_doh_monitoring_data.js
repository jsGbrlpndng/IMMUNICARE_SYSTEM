'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const db = require('../db');

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const xmlDecode = (value = '') => String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const numberValue = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const columnNumber = (ref) => {
    const letters = String(ref || '').match(/[A-Z]+/)?.[0] || '';
    return letters.split('').reduce((sum, ch) => (sum * 26) + ch.charCodeAt(0) - 64, 0);
};

const unzipWorkbook = (sourcePath) => {
    const tempDir = path.join(os.tmpdir(), `immunicare_doh_monitoring_${crypto.randomUUID()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const zipPath = path.join(tempDir, 'source.zip');
    fs.copyFileSync(sourcePath, zipPath);
    execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(path.join(tempDir, 'xlsx'))} -Force`
    ], { stdio: 'ignore' });
    return path.join(tempDir, 'xlsx');
};

const loadSharedStrings = (baseDir) => {
    const sharedPath = path.join(baseDir, 'xl', 'sharedStrings.xml');
    if (!fs.existsSync(sharedPath)) return [];
    const xml = fs.readFileSync(sharedPath, 'utf8');
    return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => (
        [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
            .map((part) => xmlDecode(part[1]))
            .join('')
    ));
};

const resolveSheetPath = (baseDir, sheetName) => {
    const workbookXml = fs.readFileSync(path.join(baseDir, 'xl', 'workbook.xml'), 'utf8');
    const relsXml = fs.readFileSync(path.join(baseDir, 'xl', '_rels', 'workbook.xml.rels'), 'utf8');
    const sheetMatch = [...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)]
        .find((match) => match[1].trim().toUpperCase() === sheetName.trim().toUpperCase());
    if (!sheetMatch) {
        throw new Error(`Sheet "${sheetName}" was not found in workbook.`);
    }
    const relId = sheetMatch[2];
    const relMatch = [...relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
        .find((match) => match[1] === relId);
    if (!relMatch) {
        throw new Error(`Workbook relationship "${relId}" was not found.`);
    }
    return path.join(baseDir, 'xl', relMatch[2].replace(/\//g, path.sep));
};

const loadSheetRows = (sheetPath, sharedStrings) => {
    const xml = fs.readFileSync(sheetPath, 'utf8');
    const rows = new Map();
    for (const rowMatch of xml.matchAll(/<row\b[^>]*r="(\d+)"[\s\S]*?<\/row>/g)) {
        const rowNumber = Number(rowMatch[1]);
        const values = new Map();
        for (const cellMatch of rowMatch[0].matchAll(/<c\b([\s\S]*?)<\/c>/g)) {
            const cellXml = cellMatch[0];
            const ref = cellXml.match(/\br="([A-Z]+\d+)"/)?.[1];
            if (!ref) continue;
            const type = cellXml.match(/\bt="([^"]+)"/)?.[1];
            const rawValue = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '';
            const inlineValue = cellXml.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)?.[1] || '';
            const value = type === 's'
                ? sharedStrings[Number(rawValue)] || ''
                : xmlDecode(rawValue || inlineValue);
            values.set(columnNumber(ref), value);
        }
        rows.set(rowNumber, values);
    }
    return rows;
};

const extractBlock = ({ rows, chartType, startRow, reportYear, sourceFile, sourceSheet }) => (
    MONTHS.map((month, index) => {
        const row = rows.get(startRow + index) || new Map();
        return {
            report_year: reportYear,
            report_month: index + 1,
            month_label: month,
            scope_type: 'MUNICIPAL',
            barangay: null,
            chart_type: chartType,
            cummulative_target_population: numberValue(row.get(5)),
            antigen1_count: numberValue(row.get(6)),
            antigen2_count: numberValue(row.get(7)),
            antigen1_commulative: numberValue(row.get(8)),
            antigen2_commulative: numberValue(row.get(9)),
            dropout_count: numberValue(row.get(10)),
            dropout_rate: numberValue(row.get(11)),
            source_file: sourceFile,
            source_sheet: sourceSheet
        };
    })
);

const parseArgs = () => {
    const args = process.argv.slice(2);
    const parsed = {
        file: null,
        year: new Date().getFullYear(),
        sheet: 'Monitoring Chart'
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--file') parsed.file = args[++index];
        else if (arg === '--year') parsed.year = Number(args[++index]);
        else if (arg === '--sheet') parsed.sheet = args[++index];
    }
    if (!parsed.file) {
        throw new Error('Usage: node server/scripts/import_doh_monitoring_data.js --file <xlsx-path> [--year 2026]');
    }
    if (!Number.isInteger(parsed.year) || parsed.year < 2000 || parsed.year > 2100) {
        throw new Error('--year must be a valid report year.');
    }
    return parsed;
};

const main = async () => {
    const { file, year, sheet } = parseArgs();
    const sourcePath = path.resolve(file);
    const baseDir = unzipWorkbook(sourcePath);
    const sharedStrings = loadSharedStrings(baseDir);
    const sheetPath = resolveSheetPath(baseDir, sheet);
    const rows = loadSheetRows(sheetPath, sharedStrings);
    const records = [
        ...extractBlock({ rows, chartType: 'PENTA', startRow: 6, reportYear: year, sourceFile: sourcePath, sourceSheet: sheet }),
        ...extractBlock({ rows, chartType: 'MCV', startRow: 29, reportYear: year, sourceFile: sourcePath, sourceSheet: sheet }),
        ...extractBlock({ rows, chartType: 'UTILIZATION', startRow: 50, reportYear: year, sourceFile: sourcePath, sourceSheet: sheet })
    ];

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute(
            `DELETE FROM m1_doh_monitoring_data WHERE report_year = ? AND scope_type = 'MUNICIPAL' AND barangay IS NULL`,
            [year]
        );
        for (const record of records) {
            await connection.execute(
                `
                INSERT INTO m1_doh_monitoring_data (
                    report_year,
                    report_month,
                    month_label,
                    scope_type,
                    barangay,
                    chart_type,
                    cummulative_target_population,
                    antigen1_count,
                    antigen2_count,
                    antigen1_commulative,
                    antigen2_commulative,
                    dropout_count,
                    dropout_rate,
                    source_file,
                    source_sheet,
                    imported_at,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
                `,
                [
                    record.report_year,
                    record.report_month,
                    record.month_label,
                    record.scope_type,
                    record.barangay,
                    record.chart_type,
                    record.cummulative_target_population,
                    record.antigen1_count,
                    record.antigen2_count,
                    record.antigen1_commulative,
                    record.antigen2_commulative,
                    record.dropout_count,
                    record.dropout_rate,
                    record.source_file,
                    record.source_sheet
                ]
            );
        }
        await connection.commit();
        console.log(JSON.stringify({
            success: true,
            imported_rows: records.length,
            report_year: year,
            source_file: sourcePath,
            sample_february_penta: records.find((row) => row.chart_type === 'PENTA' && row.report_month === 2),
            sample_february_utilization: records.find((row) => row.chart_type === 'UTILIZATION' && row.report_month === 2)
        }, null, 2));
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
        await db.end();
    }
};

main().catch(async (error) => {
    console.error(error);
    try { await db.end(); } catch {}
    process.exit(1);
});
