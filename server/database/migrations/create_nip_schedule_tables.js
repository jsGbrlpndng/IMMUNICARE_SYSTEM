const mysql = require('mysql2/promise');
require('dotenv').config();

async function createNIPScheduleTables() {
    let connection;
    
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to database successfully!');

        // Create vaccinations table
        console.log('Creating vaccinations table...');
        const createVaccinationsTable = `
            CREATE TABLE IF NOT EXISTS vaccinations (
                id VARCHAR(36) PRIMARY KEY,
                infant_id VARCHAR(36) NOT NULL,
                vaccine_name VARCHAR(100) NOT NULL,
                vaccine_code VARCHAR(50) NOT NULL,
                batch_number VARCHAR(100) NOT NULL,
                site_of_injection VARCHAR(100) NOT NULL,
                vaccinator_id VARCHAR(50) NOT NULL,
                vaccinator_name VARCHAR(200) NOT NULL,
                administered_date DATETIME NOT NULL,
                notes TEXT,
                recorded_by VARCHAR(50) NOT NULL,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (infant_id) REFERENCES infants(id) ON DELETE CASCADE,
                INDEX idx_infant_id (infant_id),
                INDEX idx_vaccine_name (vaccine_name),
                INDEX idx_administered_date (administered_date),
                UNIQUE KEY unique_infant_vaccine_date (infant_id, vaccine_name, administered_date)
            )
        `;
        
        await connection.execute(createVaccinationsTable);
        console.log('✓ Vaccinations table created successfully!');

        // Create schedule_deferrals table
        console.log('Creating schedule_deferrals table...');
        const createDeferralsTable = `
            CREATE TABLE IF NOT EXISTS schedule_deferrals (
                id VARCHAR(36) PRIMARY KEY,
                infant_id VARCHAR(36) NOT NULL,
                vaccine_name VARCHAR(100) NOT NULL,
                original_due_date DATE NOT NULL,
                new_due_date DATE,
                defer_type ENUM('reschedule', 'contraindication', 'temporary_deferral') NOT NULL,
                reason TEXT NOT NULL,
                medical_note TEXT,
                deferred_by VARCHAR(50) NOT NULL,
                deferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP NULL,
                FOREIGN KEY (infant_id) REFERENCES infants(id) ON DELETE CASCADE,
                INDEX idx_infant_id (infant_id),
                INDEX idx_defer_type (defer_type),
                INDEX idx_deferred_at (deferred_at)
            )
        `;
        
        await connection.execute(createDeferralsTable);
        console.log('✓ Schedule deferrals table created successfully!');

        // Update infants table status enum to include Transferred and Archived
        console.log('Updating infants table status enum...');
        try {
            await connection.execute(`
                ALTER TABLE infants 
                MODIFY COLUMN status ENUM('Active', 'Inactive', 'Transferred', 'Archived') DEFAULT 'Active'
            `);
            console.log('✓ Infants status enum updated successfully!');
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('✓ Status enum already updated');
            } else {
                throw error;
            }
        }

        // Add indexes for performance
        console.log('Adding performance indexes...');
        
        const indexes = [
            { name: 'idx_registration_status', query: 'CREATE INDEX idx_registration_status ON infants(registration_status)' },
            { name: 'idx_status', query: 'CREATE INDEX idx_status ON infants(status)' },
            { name: 'idx_dob', query: 'CREATE INDEX idx_dob ON infants(dob)' },
            { name: 'idx_barangay', query: 'CREATE INDEX idx_barangay ON infants(barangay)' },
            { name: 'idx_reg_status_status', query: 'CREATE INDEX idx_reg_status_status ON infants(registration_status, status)' }
        ];

        for (const index of indexes) {
            try {
                await connection.execute(index.query);
                console.log(`✓ Index created: ${index.name}`);
            } catch (error) {
                if (error.code === 'ER_DUP_KEYNAME') {
                    console.log(`✓ Index already exists: ${index.name}`);
                } else {
                    throw error;
                }
            }
        }

        // Create audit trail immutability triggers
        console.log('Checking audit_trail table...');
        
        // Check if audit_trail table exists
        const [auditTables] = await connection.execute("SHOW TABLES LIKE 'audit_trail'");
        
        if (auditTables.length === 0) {
            console.log('Creating audit_trail table...');
            const createAuditTable = `
                CREATE TABLE audit_trail (
                    id VARCHAR(36) PRIMARY KEY,
                    entity_type ENUM('infant', 'vaccination', 'schedule', 'deferral') NOT NULL,
                    entity_id VARCHAR(36) NOT NULL,
                    action_type ENUM('create', 'update', 'delete', 'status_change', 'vaccination_recorded', 'rescheduled', 'deferred') NOT NULL,
                    user_id VARCHAR(50) NOT NULL,
                    user_role VARCHAR(50) NOT NULL,
                    old_values JSON,
                    new_values JSON,
                    description TEXT,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_entity (entity_type, entity_id),
                    INDEX idx_user_id (user_id),
                    INDEX idx_created_at (created_at),
                    INDEX idx_action_type (action_type)
                )
            `;
            await connection.execute(createAuditTable);
            console.log('✓ Audit trail table created successfully!');
        } else {
            console.log('✓ Audit trail table already exists');
        }
        
        console.log('Creating audit trail immutability triggers...');
        
        // Drop existing triggers if they exist
        try {
            await connection.query('DROP TRIGGER IF EXISTS prevent_audit_update');
            await connection.query('DROP TRIGGER IF EXISTS prevent_audit_delete');
        } catch (error) {
            console.log('No existing triggers to drop');
        }

        // Create UPDATE prevention trigger
        const createUpdateTrigger = `
            CREATE TRIGGER prevent_audit_update
            BEFORE UPDATE ON audit_trail
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Audit trail records are immutable and cannot be updated';
            END
        `;
        
        await connection.query(createUpdateTrigger);
        console.log('✓ Audit trail UPDATE prevention trigger created!');

        // Create DELETE prevention trigger
        const createDeleteTrigger = `
            CREATE TRIGGER prevent_audit_delete
            BEFORE DELETE ON audit_trail
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Audit trail records are immutable and cannot be deleted';
            END
        `;
        
        await connection.query(createDeleteTrigger);
        console.log('✓ Audit trail DELETE prevention trigger created!');

        console.log('\n✅ NIP Schedule tables migration completed successfully!');
        
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
    createNIPScheduleTables()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = createNIPScheduleTables;
