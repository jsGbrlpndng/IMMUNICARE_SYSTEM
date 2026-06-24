const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host:     process.env.DB_HOST,
            user:     process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        console.log('Connected to database. Starting hard reset...');

        const statements = [
            `DROP TRIGGER IF EXISTS trg_prevent_rule_update;`,
            `DROP TRIGGER IF EXISTS trg_prevent_rule_delete;`,
            `TRUNCATE TABLE doh_compliance_rules;`,
            `INSERT INTO doh_compliance_rules (rule_id, vaccine_code, vaccine_name, description, min_age_days, max_age_days, min_interval_days, allowed_early_days, justification_required, effective_date, created_by) VALUES
            ('bcg-001', 'BCG', 'BCG', 'BCG at birth', 0, 365, NULL, 0, 1, '2023-01-01', 'SYSTEM'),
            ('hepb-bd-001', 'HEPB', 'Hepatitis B Birth Dose', 'Must be given within 24 hours of birth', 0, 1, NULL, 0, 0, '2023-01-01', 'SYSTEM'),
            ('penta-1-001', 'PENTA-1', 'Pentavalent 1', 'DPT-HepB-Hib 1st dose at 1.5 months', 45, 365, NULL, 3, 0, '2023-01-01', 'SYSTEM'),
            ('opv-1-001', 'OPV-1', 'Oral Polio Vaccine 1', 'OPV 1st dose at 1.5 months', 45, 365, NULL, 3, 0, '2023-01-01', 'SYSTEM'),
            ('pcv-1-001', 'PCV-1', 'PCV 1', 'Pneumococcal Conjugate Vaccine 1st dose at 1.5 months', 45, 365, NULL, 3, 0, '2023-01-01', 'SYSTEM'),
            ('penta-2-001', 'PENTA-2', 'Pentavalent 2', 'DPT-HepB-Hib 2nd dose at 2.5 months', 73, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),
            ('opv-2-001', 'OPV-2', 'Oral Polio Vaccine 2', 'OPV 2nd dose at 2.5 months', 73, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),
            ('pcv-2-001', 'PCV-2', 'PCV 2', 'PCV 2nd dose at 2.5 months', 73, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),
            ('penta-3-001', 'PENTA-3', 'Pentavalent 3', 'DPT-HepB-Hib 3rd dose at 3.5 months', 101, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),
            ('opv-3-001', 'OPV-3', 'Oral Polio Vaccine 3', 'OPV 3rd dose at 3.5 months', 101, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),
            ('pcv-3-001', 'PCV-3', 'PCV 3', 'PCV 3rd dose at 3.5 months', 101, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),
            ('ipv-1-001', 'IPV-1', 'IPV 1', 'Inactivated Polio Vaccine 1st dose at 3.5 months', 101, 365, NULL, 3, 0, '2023-01-01', 'SYSTEM'),
            ('ipv-2-001', 'IPV-2', 'IPV 2', 'Inactivated Polio Vaccine 2nd dose at 9 months', 270, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),
            ('mcv1-001', 'MCV-1', 'MCV 1 (Measles)', 'Measles-Containing Vaccine 1st dose at 9 months', 270, 365, NULL, 0, 0, '2023-01-01', 'SYSTEM'),
            ('mcv2-001', 'MCV-2', 'MCV 2 (MMR)', 'MMR booster at 12 months', 365, NULL, NULL, 0, 0, '2023-01-01', 'SYSTEM');`,
            `CREATE TRIGGER trg_prevent_rule_update BEFORE UPDATE ON doh_compliance_rules FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GOVERNANCE VIOLATION: Rules are immutable and cannot be modified.'; END;`,
            `CREATE TRIGGER trg_prevent_rule_delete BEFORE DELETE ON doh_compliance_rules FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GOVERNANCE VIOLATION: Deletion of regulatory rules is prohibited. Use expiration via new versions.'; END;`
        ];

        for (let i = 0; i < statements.length; i++) {
            console.log(`Executing statement ${i + 1}/${statements.length}...`);
            await connection.query(statements[i]);
        }

        console.log('Successfully completed HARD RESET of DOH rules.');
        await connection.end();
        process.exit(0);

    } catch (err) {
        console.error('Migration failed:', err);
        if (connection) await connection.end();
        process.exit(1);
    }
}

run();
