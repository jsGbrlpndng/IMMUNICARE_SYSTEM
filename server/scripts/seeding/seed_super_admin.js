const bcrypt = require('bcrypt');
const db = require('../db');
const UserIdentityService = require('../services/UserIdentityService');

const userIdentityService = new UserIdentityService(db);

async function seedSuperAdmin() {
    try {
        const id = 'SADMIN-001';
        const rawPassword = 'password123';
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        // Check if exists
        const [existing] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
        if (existing.length > 0) {
            console.log('Super Admin account already exists! ID: SADMIN-001');
            // Update password just in case
            await db.execute('UPDATE users SET password = ?, role = ? WHERE id = ?', [hashedPassword, 'Super Admin', id]);
            console.log('Password reset to: password123');
            process.exit(0);
        }

        await db.execute(`
            DELETE FROM users WHERE id = ?
        `, [id]);

        await userIdentityService.createUser({
            id,
            full_name: 'System Super Admin',
            role: 'Super Admin',
            assigned_barangay: null,
            is_active: true,
            password: hashedPassword,
            must_change_password: true
        });

        console.log('Successfully created Super Admin account!');
        console.log('ID: SADMIN-001');
        console.log('Password: password123');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding Super Admin:', error);
        process.exit(1);
    }
}

seedSuperAdmin();
