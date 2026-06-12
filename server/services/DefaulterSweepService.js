const db = require('../db');
const { CLINICAL_STATUS, SCHEDULE_STATUS } = require('../constants/domain');

const STATUS = {
    COMPLETED: SCHEDULE_STATUS.COMPLETED,
    PENDING_VALIDATION: SCHEDULE_STATUS.PENDING_VALIDATION,
    INELIGIBLE: SCHEDULE_STATUS.INELIGIBLE,
    DEFAULTER: SCHEDULE_STATUS.DEFAULTER,
    DEFAULTED: SCHEDULE_STATUS.DEFAULTED,
    INFANT_DEFAULTED: CLINICAL_STATUS.DEFAULTED,
    INFANT_INCOMPLETE: CLINICAL_STATUS.INCOMPLETE
};

const toDateOnlyString = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
};

class DefaulterSweepService {
    constructor(database = db) {
        this.db = database;
        this.timeoutHandle = null;
        this.intervalHandle = null;
        this.isRunning = false;
    }

    async sweep(now = new Date()) {
        const connection = await this.db.getConnection();
        const todayStr = toDateOnlyString(now);

        try {
            await connection.beginTransaction();

            const [doseUpdateRows] = await connection.execute(
                `
                UPDATE infant_schedules
                SET status = ?
                WHERE recommended_date < ?::date
                  AND status NOT IN (?, ?, ?, ?, ?)
                RETURNING id, infant_id
                `,
                [
                    STATUS.DEFAULTER,
                    todayStr,
                    STATUS.COMPLETED,
                    STATUS.PENDING_VALIDATION,
                    STATUS.INELIGIBLE,
                    STATUS.DEFAULTER,
                    STATUS.DEFAULTED
                ]
            );

            const flaggedDoseCount = doseUpdateRows.length;

            const [defaultedInfantRows] = await connection.execute(
                `
                UPDATE infants i
                SET immunization_status = ?
                WHERE registration_status = 'APPROVED'
                  AND immunization_status <> ?
                  AND EXISTS (
                    SELECT 1
                    FROM infant_schedules s
                    WHERE s.infant_id = i.id
                      AND s.status IN (?, ?)
                  )
                RETURNING id
                `,
                [
                    STATUS.INFANT_DEFAULTED,
                    STATUS.INFANT_DEFAULTED,
                    STATUS.DEFAULTER,
                    STATUS.DEFAULTED
                ]
            );

            const [resolvedInfantRows] = await connection.execute(
                `
                UPDATE infants i
                SET immunization_status = ?
                WHERE registration_status = 'APPROVED'
                  AND immunization_status = ?
                  AND NOT EXISTS (
                    SELECT 1
                    FROM infant_schedules s
                    WHERE s.infant_id = i.id
                      AND s.status IN (?, ?)
                  )
                RETURNING id
                `,
                [
                    STATUS.INFANT_INCOMPLETE,
                    STATUS.INFANT_DEFAULTED,
                    STATUS.DEFAULTER,
                    STATUS.DEFAULTED
                ]
            );

            await connection.commit();

            return {
                flaggedDoseCount,
                defaultedInfantCount: defaultedInfantRows.length,
                resolvedInfantCount: resolvedInfantRows.length,
                runDate: todayStr
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    getDelayUntilNextMidnight(now = new Date()) {
        const next = new Date(now);
        next.setHours(24, 0, 0, 0);
        return Math.max(next.getTime() - now.getTime(), 0);
    }

    start() {
        if (this.timeoutHandle || this.intervalHandle) {
            return;
        }

        const scheduleDailyInterval = () => {
            this.intervalHandle = setInterval(() => {
                void this.runScheduledSweep();
            }, 24 * 60 * 60 * 1000);
        };

        const delayMs = this.getDelayUntilNextMidnight();
        console.log(`[CRON] Defaulter sweep scheduled. First run in ${delayMs}ms.`);

        this.timeoutHandle = setTimeout(() => {
            this.timeoutHandle = null;
            void this.runScheduledSweep();
            scheduleDailyInterval();
        }, delayMs);
    }

    stop() {
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    async runScheduledSweep() {
        if (this.isRunning) {
            console.log('[CRON] Defaulter sweep skipped: previous run still in progress.');
            return;
        }

        this.isRunning = true;
        console.log(`[CRON] Defaulter sweep started at ${new Date().toISOString()}`);

        try {
            const result = await this.sweep();
            console.log(
                `[CRON] Defaulter sweep completed: ${result.flaggedDoseCount} doses flagged, ` +
                `${result.defaultedInfantCount} infants defaulted, ${result.resolvedInfantCount} infants resolved`
            );
        } catch (error) {
            console.error('[CRON] Defaulter sweep failed:', error.message);
        } finally {
            this.isRunning = false;
        }
    }
}

module.exports = DefaulterSweepService;
