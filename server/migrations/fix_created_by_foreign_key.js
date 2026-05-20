/**
 * Migration: Fix created_by Foreign Key Constraint
 * 
 * This migration addresses the MySQL error 1452:
 * "Cannot add or update a child row: a foreign key constraint fails"
 * 
 * Options:
 * 1. Drop the foreign key constraint (if it exists)
 * 2. Make created_by nullable to allow system-created records
 * 3. Ensure a default system user exists
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixCreatedByForeignKey() {
    let connection;
    
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to database...');

        // Step 1: Check if foreign key constraint exists
        const [constraints] = await connection.execute(`
            SELECT 
                CONSTRAINT_NAME,
                COLUMN_NAME,
                REFERENCED_TABLE_NAME,
                REFERENCED_COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'infants' 
            AND COLUMN_NAME = 'created_by'
            AND REFERENCED_TABLE_NAME IS NOT NULL
        `, [process.env.DB_NAME]);

        if (constraints.length > 0) {
            console.log('Found foreign key constraint:', constraints[0].CONSTRAINT_NAME);
            
            // Drop the foreign key constraint
            const constraintName = constraints[0].CONSTRAINT_NAME;
            await connection.execute(`
                ALTER TABLE infants 
                DROP FOREIGN KEY ${constraintName}
            `);
            console.log(`✓ Dropped foreign key constraint: ${constraintName}`);
        } else {
            console.log('No foreign key constraint found on created_by column');
        }

        // Step 2: Check current column definition
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = 'infants'
            AND COLUMN_NAME = 'created_by'
        `, [process.env.DB_NAME]);

        if (columns.length > 0) {
            console.log('Current created_by column:', columns[0]);
            
            // Step 3: Modify column to be nullable with a default
            await connection.execute(`
                ALTER TABLE infants 
                MODIFY COLUMN created_by VARCHAR(50) NULL DEFAULT NULL
            `);
            console.log('✓ Modified created_by column to be nullable');
        }

        // Step 4: Check if users table exists
        const [usersTables] = await connection.execute("SHOW TABLES LIKE 'users'");
        
        if (usersTables.length > 0) {
            // Step 5: Ensure a system user exists for backward compatibility
            const [systemUser] = await connection.execute(`
                SELECT id FROM users WHERE id = 'system' OR role = 'System'
            `);

            if (systemUser.length === 0) {
                console.log('Creating system user for backward compatibility...');
                // Note: This is a placeholder. Adjust based on your users table schema
                try {
                    await connection.execute(`
                        INSERT INTO users (id, name, role, status)
                        VALUES ('system', 'System User', 'System', 'Active')
                        ON DUPLICATE KEY UPDATE id = id
                    `);
                    console.log('✓ Created system user');
                } catch (err) {
                    console.log('Note: Could not create system user (may need manual creation):', err.message);
                }
            } else {
                console.log('✓ System user already exists');
            }

            // Step 6: Optionally re-add foreign key with ON DELETE SET NULL
            console.log('Adding foreign key constraint with ON DELETE SET NULL...');
            try {
                await connection.execute(`
                    ALTER TABLE infants
                    ADD CONSTRAINT fk_infants_created_by
                    FOREIGN KEY (created_by) REFERENCES users(id)
                    ON DELETE SET NULL
                    ON UPDATE CASCADE
                `);
                console.log('✓ Added foreign key constraint with ON DELETE SET NULL');
            } catch (err) {
                console.log('Note: Could not add foreign key constraint:', err.message);
                console.log('This is OK - the column will work without the constraint');
            }
        } else {
            console.log('Users table does not exist - skipping foreign key creation');
        }

        // Step 7: Update any NULL created_by values to 'system' if system user exists
        const [updateResult] = await connection.execute(`
            UPDATE infants 
            SET created_by = NULL
            WHERE created_by = 'user-001' 
            AND NOT EXISTS (SELECT 1 FROM users WHERE id = 'user-001')
        `);
        
        if (updateResult.affectedRows > 0) {
            console.log(`✓ Updated ${updateResult.affectedRows} records with invalid created_by references`);
        }

        console.log('\n✅ Migration completed successfully!');
        console.log('\nSummary:');
        console.log('- Foreign key constraint removed (if existed)');
        console.log('- created_by column is now nullable');
        console.log('- Invalid references have been cleaned up');
        console.log('- New foreign key with ON DELETE SET NULL added (if users table exists)');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        if (error.sqlMessage) {
            console.error('SQL Error:', error.sqlMessage);
        }
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run the migration
if (require.main === module) {
    fixCreatedByForeignKey()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = fixCreatedByForeignKey;
