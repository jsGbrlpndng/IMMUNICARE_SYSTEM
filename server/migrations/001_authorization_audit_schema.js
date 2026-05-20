const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Migration: Authorization Audit System Database Schema
 * Creates tables for authorization audit, DOH compliance rules, and authorization sessions
 * Enhances existing tables with authorization tracking columns
 */

async function createAuthorizationAuditSchema() {
    let connection;
    
    try {
        // Create connection
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to database for authorization audit schema migration...');

        // 1. Create authorization_audit table
        console.log('Creating authorization_audit table...');
        const createAuthorizationAuditTable = `
            CREATE TABLE IF NOT EXISTS authorization_audit (
                audit_id VARCHAR(36) PRIMARY KEY,
                infant_id VARCHAR(36) NOT NULL,
                vaccine_name VARCHAR(100) NOT NULL,
                midwife_id VARCHAR(36) NOT NULL,
                action_type VARCHAR(50) NOT NULL,
                clinical_justification TEXT NOT NULL,
                override_type VARCHAR(50) NOT NULL,
                compliance_status JSON NOT NULL,
                session_metadata JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_immutable BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (infant_id) REFERENCES infants(id) ON DELETE CASCADE,
                INDEX idx_infant_id (infant_id),
                INDEX idx_midwife_id (midwife_id),
                INDEX idx_created_at (created_at),
                INDEX idx_action_type (action_type),
                CONSTRAINT valid_action_type CHECK (action_type IN ('REQUEST', 'APPROVED', 'REJECTED', 'COMPLIANCE_VIOLATION')),
                CONSTRAINT valid_override_type CHECK (override_type IN ('OVERDUE', 'OUT_OF_WINDOW', 'BLOCKED_DOSE'))
            )
        `;
        
        await connection.execute(createAuthorizationAuditTable);
        console.log('✓ authorization_audit table created successfully');

        // 2. Create doh_compliance_rules table
        console.log('Creating doh_compliance_rules table...');
        const createDOHComplianceRulesTable = `
            CREATE TABLE IF NOT EXISTS doh_compliance_rules (
                rule_id VARCHAR(36) PRIMARY KEY,
                vaccine_name VARCHAR(100) NOT NULL,
                rule_type VARCHAR(50) NOT NULL,
                rule_value JSON NOT NULL,
                effective_date DATE NOT NULL,
                expiry_date DATE DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_vaccine_name (vaccine_name),
                INDEX idx_rule_type (rule_type),
                INDEX idx_effective_date (effective_date),
                CONSTRAINT valid_rule_type CHECK (rule_type IN ('MINIMUM_INTERVAL', 'CATCH_UP_PROTOCOL', 'ABSOLUTE_CONSTRAINT'))
            )
        `;
        
        await connection.execute(createDOHComplianceRulesTable);
        console.log('✓ doh_compliance_rules table created successfully');

        // 3. Create authorization_sessions table
        console.log('Creating authorization_sessions table...');
        const createAuthorizationSessionsTable = `
            CREATE TABLE IF NOT EXISTS authorization_sessions (
                session_id VARCHAR(36) PRIMARY KEY,
                midwife_id VARCHAR(36) NOT NULL,
                infant_id VARCHAR(36) NOT NULL,
                session_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                session_end TIMESTAMP DEFAULT NULL,
                ip_address VARCHAR(45) DEFAULT NULL,
                user_agent TEXT DEFAULT NULL,
                authorization_count INTEGER DEFAULT 0,
                FOREIGN KEY (infant_id) REFERENCES infants(id) ON DELETE CASCADE,
                INDEX idx_midwife_id (midwife_id),
                INDEX idx_infant_id (infant_id),
                INDEX idx_session_start (session_start)
            )
        `;
        
        await connection.execute(createAuthorizationSessionsTable);
        console.log('✓ authorization_sessions table created successfully');

        // 4. Check if schedule_overrides table exists and enhance it
        console.log('Enhancing schedule_overrides table...');
        const [overridesTableExists] = await connection.execute("SHOW TABLES LIKE 'schedule_overrides'");
        
        if (overridesTableExists.length > 0) {
            // Get current columns
            const [columns] = await connection.execute("DESCRIBE schedule_overrides");
            const existingColumns = columns.map(col => col.Field);
            
            // Add authorization_status column if it doesn't exist
            if (!existingColumns.includes('authorization_status')) {
                await connection.execute(`
                    ALTER TABLE schedule_overrides 
                    ADD COLUMN authorization_status VARCHAR(50) DEFAULT 'PENDING'
                `);
                console.log('✓ Added authorization_status column to schedule_overrides');
            }
            
            // Add compliance_metadata column if it doesn't exist
            if (!existingColumns.includes('compliance_metadata')) {
                await connection.execute(`
                    ALTER TABLE schedule_overrides 
                    ADD COLUMN compliance_metadata JSON DEFAULT NULL
                `);
                console.log('✓ Added compliance_metadata column to schedule_overrides');
            }
            
            // Add audit_trail_id column if it doesn't exist
            if (!existingColumns.includes('audit_trail_id')) {
                await connection.execute(`
                    ALTER TABLE schedule_overrides 
                    ADD COLUMN audit_trail_id VARCHAR(36) DEFAULT NULL,
                    ADD FOREIGN KEY (audit_trail_id) REFERENCES authorization_audit(audit_id) ON DELETE SET NULL
                `);
                console.log('✓ Added audit_trail_id column to schedule_overrides');
            }
        } else {
            console.log('schedule_overrides table does not exist, skipping enhancement');
        }

        // 5. Create users table if it doesn't exist (for foreign key references)
        console.log('Checking users table...');
        const [usersTableExists] = await connection.execute("SHOW TABLES LIKE 'users'");
        
        if (usersTableExists.length === 0) {
            console.log('Creating users table for midwife references...');
            const createUsersTable = `
                CREATE TABLE users (
                    id VARCHAR(36) PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role ENUM('midwife', 'admin', 'staff') DEFAULT 'midwife',
                    first_name VARCHAR(100) NOT NULL,
                    last_name VARCHAR(100) NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_username (username),
                    INDEX idx_email (email),
                    INDEX idx_role (role)
                )
            `;
            
            await connection.execute(createUsersTable);
            console.log('✓ users table created successfully');
            
            // Insert a default midwife user for testing
            const { v4: uuidv4 } = require('uuid');
            const defaultMidwifeId = uuidv4();
            await connection.execute(`
                INSERT INTO users (id, username, email, password_hash, role, first_name, last_name)
                VALUES (?, 'midwife001', 'midwife@immunicare.ph', 'hashed_password_placeholder', 'midwife', 'Test', 'Midwife')
            `, [defaultMidwifeId]);
            console.log('✓ Default midwife user created for testing');
        }

        // 6. Insert default DOH compliance rules
        console.log('Inserting default DOH compliance rules...');
        const { v4: uuidv4 } = require('uuid');
        
        const defaultRules = [
            {
                vaccine_name: 'BCG',
                rule_type: 'MINIMUM_INTERVAL',
                rule_value: { minimum_days: 0, description: 'BCG can be given at birth' },
                effective_date: '2024-01-01'
            },
            {
                vaccine_name: 'Hepatitis B',
                rule_type: 'MINIMUM_INTERVAL',
                rule_value: { minimum_days: 0, description: 'Hepatitis B can be given at birth' },
                effective_date: '2024-01-01'
            },
            {
                vaccine_name: 'DPT-HepB-Hib',
                rule_type: 'MINIMUM_INTERVAL',
                rule_value: { minimum_days: 28, description: 'Minimum 4 weeks between DPT-HepB-Hib doses' },
                effective_date: '2024-01-01'
            },
            {
                vaccine_name: 'OPV',
                rule_type: 'MINIMUM_INTERVAL',
                rule_value: { minimum_days: 28, description: 'Minimum 4 weeks between OPV doses' },
                effective_date: '2024-01-01'
            },
            {
                vaccine_name: 'PCV',
                rule_type: 'MINIMUM_INTERVAL',
                rule_value: { minimum_days: 28, description: 'Minimum 4 weeks between PCV doses' },
                effective_date: '2024-01-01'
            },
            {
                vaccine_name: 'MMR',
                rule_type: 'MINIMUM_INTERVAL',
                rule_value: { minimum_days: 365, description: 'MMR given at 12 months minimum' },
                effective_date: '2024-01-01'
            }
        ];
        
        for (const rule of defaultRules) {
            const ruleId = uuidv4();
            await connection.execute(`
                INSERT IGNORE INTO doh_compliance_rules (rule_id, vaccine_name, rule_type, rule_value, effective_date)
                VALUES (?, ?, ?, ?, ?)
            `, [ruleId, rule.vaccine_name, rule.rule_type, JSON.stringify(rule.rule_value), rule.effective_date]);
        }
        console.log('✓ Default DOH compliance rules inserted');

        // 7. Show final table structures
        console.log('\n=== Authorization Audit Schema Summary ===');
        
        const tables = ['authorization_audit', 'doh_compliance_rules', 'authorization_sessions'];
        for (const table of tables) {
            console.log(`\n--- ${table} ---`);
            const [columns] = await connection.execute(`DESCRIBE ${table}`);
            console.table(columns.map(col => ({
                Field: col.Field,
                Type: col.Type,
                Null: col.Null,
                Key: col.Key,
                Default: col.Default
            })));
        }
        
        console.log('\n✅ Authorization audit schema migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Authorization audit schema migration failed:', error.message);
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

// Export for use in other scripts
module.exports = { createAuthorizationAuditSchema };

// Run migration if called directly
if (require.main === module) {
    createAuthorizationAuditSchema();
}