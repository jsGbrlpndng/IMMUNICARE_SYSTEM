class UserProfileService {
    constructor(db) {
        this.db = db;
    }

    async getById(userId) {
        const [rows] = await this.db.execute(`
            SELECT
                u.id,
                u.full_name,
                u.role,
                u.assigned_barangay,
                u.is_active,
                u.created_at,
                u.updated_at,
                u.last_login_at,
                u.created_by_user_id,
                creator.full_name AS created_by_name,
                NULL::text AS email
            FROM users u
            LEFT JOIN users creator ON creator.id = u.created_by_user_id
            WHERE u.id = ?
            LIMIT 1
        `, [userId]);

        if (rows.length === 0) {
            return null;
        }

        const row = rows[0];
        return {
            id: row.id,
            full_name: row.full_name,
            role: row.role,
            assigned_barangay: row.assigned_barangay,
            email: row.email,
            is_active: row.is_active,
            created_at: row.created_at,
            created_by_user_id: row.created_by_user_id,
            created_by_name: row.created_by_name,
            updated_at: row.updated_at,
            last_login_at: row.last_login_at
        };
    }
}

module.exports = UserProfileService;
