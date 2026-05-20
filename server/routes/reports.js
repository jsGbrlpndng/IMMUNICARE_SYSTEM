const express = require('express');
const router = express.Router();
const db = require('../db');
const M1ReportService = require('../services/M1ReportService');

// ─── Auth helper ────────────────────────────────────────────────────────────
// Inline auth for reports: Admin + Nurse + Midwife = full access.
// BHW = 403 (no read even; UI must not expose the page).
async function m1Auth(req, res, next) {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' });

    try {
        const [rows] = await db.execute(
            'SELECT role, is_active FROM users WHERE id = ?',
            [userId]
        );
        if (rows.length === 0) return res.status(401).json({ error: 'Unauthorized: User not found' });
        const user = rows[0];
        if (!user.is_active) return res.status(403).json({ error: 'Account is disabled' });

        const allowed = ['Super Admin', 'Barangay Admin', 'Midwife'];
        if (!allowed.includes(user.role)) {
            return res.status(403).json({ error: 'Forbidden: M1 report access denied', role: user.role });
        }

        req.user = { id: userId, role: user.role };
        next();
    } catch (err) {
        console.error('[m1Auth]', err);
        res.status(500).json({ error: 'Internal Server Error during authorization' });
    }
}

// GET /api/reports/fhsis
// Generates FIC (Fully Immunized Child) and CIC (Completely Immunized Child) counts
router.get('/fhsis', async (req, res) => {
    try {
        // FIC Definition: Child received BCG, HepB(1), Penta(3), OPV(3), IPV(1), MCV(1) before 1 year old
        // For simplified logic, we count infants with >8 validated doses before age 1

        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // 1. FIC Count
        const ficQuery = `
            SELECT COUNT(DISTINCT i.id) as fic_count
            FROM infants i
            JOIN vaccinations v ON i.id = v.infant_id
            WHERE v.validation_status = 'VALIDATED'
            AND TIMESTAMPDIFF(MONTH, i.dob, v.administered_date) < 12
            GROUP BY i.id
            HAVING COUNT(v.id) >= 9 -- Basic threshold for FIC
        `;

        // 2. CIC Count
        const cicQuery = `
            SELECT COUNT(DISTINCT i.id) as cic_count
            FROM infants i
            JOIN vaccinations v ON i.id = v.infant_id
            WHERE v.validation_status = 'VALIDATED'
            AND v.vaccine_name LIKE '%Measles%'
            AND MONTH(v.administered_date) = ?
            AND YEAR(v.administered_date) = ?
        `;

        const [ficResult] = await db.execute(ficQuery);
        const [cicResult] = await db.execute(cicQuery, [currentMonth, currentYear]);

        const ficCount = ficResult.length > 0 ? ficResult.length : 0; // Since group by returns rows
        const cicCount = cicResult[0]?.cic_count || 0;

        res.status(200).json({
            report_month: `${currentYear}-${currentMonth}`,
            fic_count: ficCount,
            cic_count: cicCount,
            generated_at: new Date()
        });

    } catch (error) {
        console.error('Error generating FHSIS report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/m1
// DOH M1 Immunization Report (additive — does NOT replace /fhsis)
//
// Query params:
//   month=1-12    (default: current month)
//   year=YYYY     (default: current year)
//   barangay=NAME (optional, exact match)
//
// Access: Admin, Nurse, Midwife only. BHW → 403.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/m1', m1Auth, async (req, res) => {
    try {
        const month = req.query.month ? parseInt(req.query.month, 10) : undefined;
        const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
        const barangay = req.query.barangay || undefined;

        if (month !== undefined && (isNaN(month) || month < 1 || month > 12)) {
            return res.status(400).json({ error: 'Invalid month. Must be 1–12.' });
        }
        if (year !== undefined && (isNaN(year) || year < 2000 || year > 2100)) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        const db = require('../db');
        const service = new M1ReportService(db);
        const report = await service.getM1Report({ month, year, barangay });

        res.status(200).json(report);
    } catch (error) {
        console.error('[GET /api/reports/m1]', error);
        res.status(500).json({ error: 'Internal Server Error generating M1 report' });
    }
});

// GET /api/reports/cic-catchup
// Exclusively for infants with CIC status, showing vaccines administered after 12 months.
router.get('/cic-catchup', m1Auth, async (req, res) => {
    try {
        const query = `
            SELECT 
                i.id,
                i.first_name,
                i.last_name,
                i.barangay,
                i.dob,
                v.vaccine_name,
                v.administered_date,
                EXTRACT(YEAR FROM AGE(v.administered_date, i.dob)) * 12 + EXTRACT(MONTH FROM AGE(v.administered_date, i.dob)) as age_at_vaccination_months
            FROM infants i
            JOIN vaccinations v ON i.id = v.infant_id
            WHERE i.status = 'CIC'
            AND v.administered_date > i.dob + INTERVAL '12 months'
            ORDER BY i.last_name, i.first_name, v.administered_date;
        `;

        const [rows] = await db.execute(query);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error in cic-catchup report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
