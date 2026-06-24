/**
 * Migration: Add encoded_by_role column to infants table
 * 
 * This migration adds the encoded_by_role column to track which user role
 * (BHW, Midwife, Nurse) created each infant registration.
 * 
 * This is part of the unified registration workflow implementation.
 */

const db = require('../db');

async function addEncodedByRoleColumn() {
    let connection;
    
    try {
        connection = await db.getConnection();
        
        console.log('Checking if encoded_by_role column exists...');
        
        // Check if column already exists
        const [columns] = await connection.execute("DESCRIBE infants");
        const existingColumns = columns.map(col => col.Field);
        
        if (existingColumns.includes('encoded_by_role')) {
            console.log('✓ encoded_by_role column already exists. Skipping migration.');
            return;
        }
        
        console.log('Adding encoded_by_role column to infants table...');
        
        // Add the column
        await connection.execute(`
            ALTER TABLE infants 
            ADD COLUMN encoded_by_role ENUM('BHW', 'Midwife', 'Nurse', 'Admin') DEFAULT NULL
            AFTER created_by
        `);
        
        console.log('✓ Successfully added encoded_by_role column');
        
        // Update existing records to set encoded_by_role based on created_by user's role
        console.log('Updating existing records with role metadata...');
        
        await connection.execute(`
            UPDATE infants i
            INNER JOIN users u ON i.created_by = u.id
            SET i.encoded_by_role = u.role
            WHERE i.encoded_by_role IS NULL
        `);
        
        console.log('✓ Successfully updated existing records');
        
    } catch (error) {
        console.error('Error adding encoded_by_role column:', error);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

// Run migration if called directly
if (require.main === module) {
    addEncodedByRoleColumn()
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = addEncodedByRoleColumn;
