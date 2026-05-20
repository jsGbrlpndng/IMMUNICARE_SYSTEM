const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

/**
 * Migration: Ensure Default Users Exist
 * 
 * This migration ensures that the system has at least one active user
 * to prevent foreign key constraint violations when registering infants.
 * 
 * Creates default users if none exist:
 * - Admin user
 * - Midwife user
 */

async function ensureDefaultUsers() {
    let connection;
    
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to database successfully!');
        console.log('Checking for existing users...\n');

        // Check if users table exists
        const [tables] = await connection.execute("SHOW TABLES LIKE 'users'");
        
        if (tables.length === 0) {
            console.log('❌ Users table does not exist!');
            console.log('Please run the authorization schema migration first:');
            console.log('   node server/migrations/001_authorization_audit_schema.js');
            return;
        }

        // Check current users
        const [existingUsers] = await connection.execute(
            'SELECT id, role, full_name, is_active FROM users WHERE is_active = true'
        );

        console.log(`Found ${existingUsers.length} active user(s) in the database.`);
        
        if (existingUsers.length > 0) {
            console.log('\n=== Existing Active Users ===');
            existingUsers.forEach(user => {
                console.log(`  - ${user.id} (${user.role}): ${user.full_name || 'N/A'}`);
            });
        }

        // Check if we need to create default users
        const [adminUsers] = await connection.execute(
            "SELECT id FROM users WHERE role = 'Admin' AND is_active = true"
        );
        
        const [midwifeUsers] = await connection.execute(
            "SELECT id FROM users WHERE role IN ('Midwife', 'Nurse') AND is_active = true"
        );

        let usersCreated = 0;

        // Create default admin if none exists
        if (adminUsers.length === 0) {
            console.log('\n📝 Creating default Admin user...');
            const adminId = 'ADMIN-001';
            const adminPassword = await bcrypt.hash('admin123', 10);
            
            await connection.execute(`
                INSERT INTO users (id, full_name, role, password, is_active, assigned_barangay)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    password = VALUES(password),
                    is_active = VALUES(is_active)
            `, [adminId, 'System Administrator', 'Admin', adminPassword, true, 'All']);
            
            console.log('✓ Admin user created successfully');
            console.log(`  User ID: ${adminId}`);
            console.log(`  Password: admin123`);
            console.log('  ⚠️  IMPORTANT: Change this password after first login!');
            usersCreated++;
        }

        // Create default midwife if none exists
        if (midwifeUsers.length === 0) {
            console.log('\n📝 Creating default Midwife user...');
            const midwifeId = 'MIDWIFE-001';
            const midwifePassword = await bcrypt.hash('midwife123', 10);
            
            await connection.execute(`
                INSERT INTO users (id, full_name, role, password, is_active, assigned_barangay)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    password = VALUES(password),
                    is_active = VALUES(is_active)
            `, [midwifeId, 'Default Midwife', 'Midwife', midwifePassword, true, 'Langgam']);
            
            console.log('✓ Midwife user created successfully');
            console.log(`  User ID: ${midwifeId}`);
            console.log(`  Password: midwife123`);
            console.log('  ⚠️  IMPORTANT: Change this password after first login!');
            usersCreated++;
        }

        // Verify final state
        const [finalUsers] = await connection.execute(
            'SELECT id, role, full_name, is_active FROM users WHERE is_active = true'
        );

        console.log('\n=== Final User List ===');
        console.log(`Total active users: ${finalUsers.length}`);
        finalUsers.forEach(user => {
            console.log(`  - ${user.id} (${user.role}): ${user.full_name || 'N/A'}`);
        });

        if (usersCreated > 0) {
            console.log('\n✅ Default users created successfully!');
            console.log('\n📋 Next Steps:');
            console.log('1. Log in using one of the default accounts');
            console.log('2. Change the default passwords immediately');
            console.log('3. Create additional users through the Admin panel');
        } else {
            console.log('\n✅ All required users already exist!');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        if (error.sqlMessage) {
            console.error('SQL Error:', error.sqlMessage);
        }
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run the migration
ensureDefaultUsers();
