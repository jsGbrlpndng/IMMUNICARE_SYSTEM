const db = require('../db');

async function enforceUniqueFullNames(options = {}) {
    const strict = options.strict !== false;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [duplicates] = await connection.execute(`
            SELECT
                LOWER(BTRIM(full_name)) AS normalized_full_name,
                ARRAY_AGG(id ORDER BY created_at NULLS FIRST, id) AS user_ids,
                ARRAY_AGG(full_name ORDER BY created_at NULLS FIRST, id) AS raw_full_names,
                COUNT(*) AS duplicate_count
            FROM users
            GROUP BY LOWER(BTRIM(full_name))
            HAVING COUNT(*) > 1
        `);

        if (duplicates.length > 0) {
            const duplicateSummary = duplicates
                .map((row) => `${row.normalized_full_name}: ${row.user_ids.join(', ')}`)
                .join(' | ');
            console.error('[FULL_NAME_UNIQUENESS_COLLISION]', duplicateSummary);
            if (strict) {
                const error = new Error(`Duplicate full_name values detected. Manual review required before enforcing uniqueness: ${duplicateSummary}`);
                error.code = 'DUPLICATE_FULL_NAME_DATA';
                error.duplicates = duplicates;
                throw error;
            }

            await connection.rollback();
            return {
                applied: false,
                blocked: true,
                reason: 'DUPLICATE_FULL_NAME_DATA',
                duplicates
            };
        }

        await connection.execute(`
            UPDATE users
            SET full_name = BTRIM(full_name)
            WHERE full_name <> BTRIM(full_name)
        `);

        await connection.execute(`
            DROP INDEX IF EXISTS idx_users_username_unique_ci
        `);

        await connection.execute(`
            DROP INDEX IF EXISTS idx_users_full_name_unique_ci
        `);

        await connection.execute(`
            ALTER TABLE users
            DROP COLUMN IF EXISTS username
        `);

        await connection.execute(`
            CREATE UNIQUE INDEX idx_users_full_name_unique_ci
            ON users (LOWER(full_name))
        `);

        await connection.commit();
        return {
            applied: true,
            blocked: false,
            duplicates: []
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { enforceUniqueFullNames };

if (require.main === module) {
    enforceUniqueFullNames()
        .then(() => {
            console.log('Full-name uniqueness hardening applied.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Full-name uniqueness hardening failed:', error.message);
            process.exit(1);
        });
}
