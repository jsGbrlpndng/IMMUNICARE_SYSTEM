const db = require('../db');
const { differenceInDays } = require('date-fns');
const { v4: uuidv4 } = require('uuid');

/**
 * DAILY DAEMON: Status Shifter Service
 * This service runs nightly (12:00 AM PST) to update infant statuses
 * based on their vaccination schedules. 
 * Criteria:
 * - DEFAULTED: Any approved infant with a DEFAULTED dose > 28 days past its due date.
 * - INCOMPLETE: Any infant with no defaulted dose and an incomplete schedule.
 */
class StatusShifterService {
    static async shift() {
        console.log(`[STATUS SHIFTER] Starting nightly shift at ${new Date().toISOString()}`);
        
        try {
            // 1. Get all approved infants
            const [infants] = await db.execute(`
                SELECT id, immunization_status, reference_id
                FROM infants 
                WHERE registration_status = 'APPROVED'
            `);

            let updatedCount = 0;

            for (const infant of infants) {
                // 2. Check their schedules for the most overdue vaccine
                const [schedules] = await db.execute(`
                    SELECT recommended_date, status 
                    FROM infant_schedules 
                    WHERE infant_id = ? AND status = 'DEFAULTED'
                    ORDER BY recommended_date ASC
                    LIMIT 1
                `, [infant.id]);

                const mostOverdue = schedules[0];
                const now = new Date();
                
                let shouldBeDefaulted = false;
                if (mostOverdue) {
                    const daysPast = differenceInDays(now, new Date(mostOverdue.recommended_date));
                    if (daysPast > 28) {
                        shouldBeDefaulted = true;
                    }
                }

                // 3. Update status if it changed
                if (shouldBeDefaulted && infant.immunization_status !== 'DEFAULTED') {
                    await db.execute(`UPDATE infants SET immunization_status = 'DEFAULTED' WHERE id = ?`, [infant.id]);
                    console.log(`[STATUS SHIFTER] Infant ${infant.reference_id} -> DEFAULTED`);
                    
                    // Log to audit trail
                    await db.execute(`
                        INSERT INTO audit_trail (id, entity_type, entity_id, action_type, user_id, user_role, description)
                        VALUES (?, 'infant', ?, 'status_change', 'SYSTEM', 'SYSTEM', ?)
                    `, [uuidv4(), infant.id, 'System shift: immunization status -> DEFAULTED']);
                    
                    updatedCount++;
                } else if (!shouldBeDefaulted && infant.immunization_status === 'DEFAULTED') {
                    await db.execute(`UPDATE infants SET immunization_status = 'INCOMPLETE' WHERE id = ?`, [infant.id]);
                    console.log(`[STATUS SHIFTER] Infant ${infant.reference_id} -> INCOMPLETE (Resolved)`);
                    
                    await db.execute(`
                        INSERT INTO audit_trail (id, entity_type, entity_id, action_type, user_id, user_role, description)
                        VALUES (?, 'infant', ?, 'status_change', 'SYSTEM', 'SYSTEM', ?)
                    `, [uuidv4(), infant.id, 'System shift: DEFAULTED -> INCOMPLETE']);
                    
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
