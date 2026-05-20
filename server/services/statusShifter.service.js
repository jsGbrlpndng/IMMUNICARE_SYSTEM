const db = require('../db');
const { differenceInDays } = require('date-fns');

/**
 * DAILY DAEMON: Status Shifter Service
 * This service runs nightly (12:00 AM PST) to update infant statuses
 * based on their vaccination schedules. 
 * Criteria: 
 * - DEFAULTER: Any approved infant with an OVERDUE vaccine > 28 days past its due date.
 * - ACTIVE: Any infant who was a Defaulter but is now up-to-date or just overdue (< 28 days).
 */
class StatusShifterService {
    static async shift() {
        console.log(`[STATUS SHIFTER] Starting nightly shift at ${new Date().toISOString()}`);
        
        try {
            // 1. Get all approved infants
            const [infants] = await db.execute(`
                SELECT id, status, reference_id 
                FROM infants 
                WHERE registration_status = 'Approved'
            `);

            let updatedCount = 0;

            for (const infant of infants) {
                // 2. Check their schedules for the most overdue vaccine
                const [schedules] = await db.execute(`
                    SELECT recommended_date, status 
                    FROM infant_schedules 
                    WHERE infant_id = ? AND status = 'DEFAULTER'
                    ORDER BY recommended_date ASC
                    LIMIT 1
                `, [infant.id]);

                const mostOverdue = schedules[0];
                const now = new Date();
                
                let shouldBeDefaulter = false;
                if (mostOverdue) {
                    const daysPast = differenceInDays(now, new Date(mostOverdue.recommended_date));
                    if (daysPast > 28) {
                        shouldBeDefaulter = true;
                    }
                }

                // 3. Update status if it changed
                if (shouldBeDefaulter && infant.status !== 'Defaulter') {
                    await db.execute(`UPDATE infants SET status = 'Defaulter' WHERE id = ?`, [infant.id]);
                    console.log(`[STATUS SHIFTER] Infant ${infant.reference_id} -> DEFAULTER`);
                    
                    // Log to audit trail
                    await db.execute(`
                        INSERT INTO audit_trail (id, entity_type, entity_id, action_type, user_id, user_role, description)
                        VALUES (UUID(), 'infant', ?, 'status_change', 'SYSTEM', 'CRON', ?)
                    `, [infant.id, 'System shift: Active -> Defaulter (>28 days overdue)']);
                    
                    updatedCount++;
                } else if (!shouldBeDefaulter && infant.status === 'Defaulter') {
                    await db.execute(`UPDATE infants SET status = 'Active' WHERE id = ?`, [infant.id]);
                    console.log(`[STATUS SHIFTER] Infant ${infant.reference_id} -> ACTIVE (Resolved)`);
                    
                    await db.execute(`
                        INSERT INTO audit_trail (id, entity_type, entity_id, action_type, user_id, user_role, description)
                        VALUES (UUID(), 'infant', ?, 'status_change', 'SYSTEM', 'CRON', ?)
                    `, [infant.id, 'System shift: Defaulter -> Active (Vaccination record updated or within grace)']);
                    
                    updatedCount++;
                }
            }

            console.log(`[STATUS SHIFTER] Shift complete. Updated ${updatedCount} records.`);
            return updatedCount;

        } catch (error) {
            console.error('[STATUS SHIFTER] Critical Failure:', error);
            throw error;
        }
    }

    /**
     * Entry point for the cron job or manual trigger
     */
    static async run() {
        try {
            await this.shift();
            process.exit(0);
        } catch (e) {
            process.exit(1);
        }
    }
}

if (require.main === module) {
    StatusShifterService.run();
}

module.exports = StatusShifterService;
