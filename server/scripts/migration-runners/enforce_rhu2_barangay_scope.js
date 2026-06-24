'use strict';

const db = require('../db');
const { RHU2_BARANGAYS } = require('../constants/rhu2Barangays');

const run = async () => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await connection.execute(
            `
            UPDATE barangays
            SET is_active = FALSE
            WHERE UPPER(TRIM(name)) <> ALL(?::text[])
            `,
            [RHU2_BARANGAYS]
        );

        for (const name of RHU2_BARANGAYS) {
            await connection.execute(
                `
                INSERT INTO barangays (name, city, province, is_active)
                VALUES (?, 'San Pedro', 'Laguna', TRUE)
                ON CONFLICT (name) DO UPDATE SET
                    city = EXCLUDED.city,
                    province = EXCLUDED.province,
                    is_active = TRUE
                `,
                [name]
            );
        }

        await connection.commit();

        const [rows] = await db.execute(
            `
            SELECT name
            FROM barangays
            WHERE COALESCE(is_active, TRUE) = TRUE
            ORDER BY name
            `
        );

        console.log('[RHU2-SCOPE] Active barangays restricted to RHU 2.');
        console.table(rows);
    } catch (error) {
        await connection.rollback();
        console.error('[RHU2-SCOPE] Failed to enforce RHU 2 barangay scope:', error);
        process.exitCode = 1;
    } finally {
        connection.release();
        await db.end();
    }
};

run();
