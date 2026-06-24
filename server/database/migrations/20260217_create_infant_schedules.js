const db = require('../db');

async function createInfantSchedulesTable() {
    try {
        console.log('Connected to database successfully!');

        console.log('Creating infant_schedules table...');
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS infant_schedules (
                id VARCHAR(36) PRIMARY KEY,
                infant_id VARCHAR(36) NOT NULL,
                vaccine_code VARCHAR(50) NOT NULL,
                dose_number INT NOT NULL,
                recommended_date DATE NOT NULL,
                earliest_allowed_date DATE NOT NULL,
                actual_date DATE DEFAULT NULL,
                status ENUM('NOT_YET_DUE', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'COMPLETED') DEFAULT 'NOT_YET_DUE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (infant_id) REFERENCES infants(id) ON DELETE CASCADE,
                INDEX idx_infant_id (infant_id),
                INDEX idx_status (status),
                UNIQUE KEY unique_infant_vaccine_dose (infant_id, vaccine_code, dose_number)
            )
        `;

        await db.execute(createTableQuery);
        console.log('✓ infant_schedules table created successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    }
}

if (require.main === module) {
    createInfantSchedulesTable()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = createInfantSchedulesTable;
