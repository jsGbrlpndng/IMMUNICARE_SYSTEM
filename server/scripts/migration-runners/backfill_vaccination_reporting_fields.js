'use strict';

const db = require('../db');
const { buildVaccinationReportFields } = require('../utils/vaccinationReporting');

async function backfillVaccinationReportingFields() {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `
            SELECT
                v.id,
                v.vaccine_code,
                v.vaccine_name,
                v.dose_number,
                v.administered_date,
                v.report_classification,
                COALESCE(v.barangay_at_administration, i.barangay) AS barangay,
                i.dob
            FROM vaccinations v
            JOIN infants i ON i.id = v.infant_id
            WHERE UPPER(COALESCE(v.validation_status::text, 'VALIDATED')) = 'VALIDATED'
              AND v.administered_date IS NOT NULL
            ORDER BY v.administered_date ASC, v.id ASC
            `
        );

        let updatedCount = 0;

        for (const row of rows) {
            const reportFields = buildVaccinationReportFields({
                vaccine_code: row.vaccine_code,
                vaccine_name: row.vaccine_name,
                dose_number: row.dose_number,
                administered_date: row.administered_date,
                dob: row.dob,
                barangay: row.barangay,
                report_classification: row.report_classification
            });

            await connection.execute(
                `
                UPDATE vaccinations
                SET report_antigen_code = ?,
                    report_dose_code = ?,
                    report_age_bucket = ?,
                    report_classification = ?,
                    report_period_month = ?,
                    report_period_year = ?,
                    barangay_at_administration = ?
                WHERE id = ?
                `,
                [
                    reportFields.report_antigen_code,
                    reportFields.report_dose_code,
                    reportFields.report_age_bucket,
                    reportFields.report_classification,
                    reportFields.report_period_month,
                    reportFields.report_period_year,
                    reportFields.barangay_at_administration,
                    row.id
                ]
            );

            updatedCount += 1;
        }

        await connection.commit();
        console.log(`[BACKFILL] Vaccination reporting fields updated: ${updatedCount}`);
    } catch (error) {
        await connection.rollback();
        console.error('[BACKFILL] Failed to backfill vaccination reporting fields:', error);
        process.exitCode = 1;
    } finally {
        connection.release();
        await db.end();
    }
}

backfillVaccinationReportingFields();
