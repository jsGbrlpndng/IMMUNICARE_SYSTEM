const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function createApprovalAuditTable() {
    let connection;
    
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to database successfully!');

        // Create approval_audit table
        console.log('Creating approval_audit table...');
        
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS approval_audit (
                id VARCHAR(36) PRIMARY KEY,
                infant_id VARCHAR(36) NOT NULL,
                action ENUM('Approved', 'Rejected') NOT NULL,
                approver_id VARCHAR(50) NOT NULL,
                approver_role ENUM('Midwife', 'Nurse', 'Admin') NOT NULL,
                remarks TEXT,
                timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (infant_id) REFERENCES infants(id) ON DELETE CASCADE,
                INDEX idx_infant_id (infant_id),
                INDEX idx_timestamp (timestamp),
                INDEX idx_approver_id (approver_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        
        await connection.execute(createTableQuery);
        console.log('✓ approval_audit table created successfully!');
        
        // Verify table structure
        console.log('\n=== Approval Audit Table Structure ===');
        const [columns] = await connection.execute("DESCRIBE approval_audit");
        console.table(columns);
        
        // Verify indexes
        console.log('\n=== Approval Audit Indexes ===');
        const [indexes] = await connection.execute("SHOW INDEX FROM approval_audit");
        console.table(indexes.map(idx => ({
            Key_name: idx.Key_name,
            Column_name: idx.Column_name,
            Non_unique: idx.Non_unique
        })));
        
        console.log('\n✅ Approval audit table migration completed successfully!');
        
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
    createApprovalAuditTable()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = createApprovalAuditTable;
