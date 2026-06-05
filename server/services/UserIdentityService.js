class UserIdentityService {
    constructor(db) {
        this.db = db;
        this._schemaCapabilitiesPromise = null;
    }

    normalizeFullName(fullName) {
        return typeof fullName === 'string'
            ? fullName.trim().replace(/\s+/g, ' ')
            : '';
    }

    validateFullName(fullName) {
        const normalized = this.normalizeFullName(fullName);

        if (!normalized) {
            const error = new Error('Full name is required.');
            error.status = 400;
            error.code = 'FULL_NAME_REQUIRED';
            throw error;
        }

        return normalized;
    }

    buildDuplicateFullNameError(fullName) {
        const normalized = this.normalizeFullName(fullName) || String(fullName || '').trim();
        const error = new Error(`Account with the name '${normalized}' already exists.`);
        error.status = 409;
        error.code = 'FULL_NAME_TAKEN';
        return error;
    }

    async getSchemaCapabilities(executor = this.db) {
        if (executor !== this.db) {
            return this.loadSchemaCapabilities(executor);
        }

        if (!this._schemaCapabilitiesPromise) {
            this._schemaCapabilitiesPromise = this.loadSchemaCapabilities(executor).catch((error) => {
                this._schemaCapabilitiesPromise = null;
                throw error;
            });
        }

        return this._schemaCapabilitiesPromise;
    }

    async loadSchemaCapabilities(executor) {
        const [rows] = await executor.execute(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'users'
              AND column_name IN ('username')
        `);

        return {
            hasUsernameColumn: rows.some((row) => row.column_name === 'username')
        };
    }

    isFullNameUniqueViolation(error) {
        if (!error || error.code !== '23505') {
            return false;
        }

        const constraint = String(error.constraint || '');
        const detail = String(error.detail || '');
        const message = String(error.message || '');
        return constraint.includes('idx_users_full_name_unique_ci') ||
            detail.toLowerCase().includes('lower(full_name)') ||
            message.toLowerCase().includes('lower(full_name)');
    }

    async isFullNameAvailable(fullName, executor = this.db) {
        const normalized = this.validateFullName(fullName);
        const [rows] = await executor.execute(`
            SELECT COUNT(*)::int AS count
            FROM users
            WHERE LOWER(full_name) = LOWER(?)
        `, [normalized]);

        return Number(rows[0]?.count || 0) === 0;
    }

    async assertFullNameAvailable(fullName, executor = this.db) {
        const normalized = this.validateFullName(fullName);
        const available = await this.isFullNameAvailable(normalized, executor);
        if (!available) {
            throw this.buildDuplicateFullNameError(normalized);
        }
        return normalized;
    }

    async createUser(userInput, executor = this.db) {
        const fullName = await this.assertFullNameAvailable(userInput.full_name, executor);
        const schema = await this.getSchemaCapabilities(executor);

        try {
            if (schema.hasUsernameColumn) {
                await executor.execute(`
                    INSERT INTO users (
                        id,
                        username,
                        full_name,
                        role,
                        assigned_barangay,
                        is_active,
                        password,
                        must_change_password,
                        created_by_user_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    userInput.id,
                    String(userInput.id || '').trim().toLowerCase(),
                    fullName,
                    userInput.role,
                    userInput.assigned_barangay ?? null,
                    userInput.is_active ?? true,
                    userInput.password,
                    userInput.must_change_password ?? true,
                    userInput.created_by_user_id ?? null
                ]);
            } else {
                await executor.execute(`
                    INSERT INTO users (
                        id,
                        full_name,
                        role,
                        assigned_barangay,
                        is_active,
                        password,
                        must_change_password,
                        created_by_user_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    userInput.id,
                    fullName,
                    userInput.role,
                    userInput.assigned_barangay ?? null,
                    userInput.is_active ?? true,
                    userInput.password,
                    userInput.must_change_password ?? true,
                    userInput.created_by_user_id ?? null
                ]);
            }
        } catch (error) {
            if (this.isFullNameUniqueViolation(error)) {
                throw this.buildDuplicateFullNameError(fullName);
            }
            throw error;
        }

        return {
            ...userInput,
            full_name: fullName
        };
    }

    async upsertUser(userInput, executor = this.db) {
        const fullName = this.validateFullName(userInput.full_name);
        const schema = await this.getSchemaCapabilities(executor);

        try {
            if (schema.hasUsernameColumn) {
                await executor.execute(`
                    INSERT INTO users (
                        id,
                        username,
                        full_name,
                        role,
                        assigned_barangay,
                        is_active,
                        password,
                        failed_login_attempts,
                        locked_until,
                        last_login_at,
                        must_change_password,
                        created_by_user_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET
                        username = EXCLUDED.username,
                        full_name = EXCLUDED.full_name,
                        role = EXCLUDED.role,
                        assigned_barangay = EXCLUDED.assigned_barangay,
                        password = EXCLUDED.password,
                        is_active = EXCLUDED.is_active,
                        failed_login_attempts = EXCLUDED.failed_login_attempts,
                        locked_until = EXCLUDED.locked_until,
                        last_login_at = EXCLUDED.last_login_at,
                        must_change_password = EXCLUDED.must_change_password,
                        created_by_user_id = COALESCE(EXCLUDED.created_by_user_id, users.created_by_user_id)
                `, [
                    userInput.id,
                    String(userInput.id || '').trim().toLowerCase(),
                    fullName,
                    userInput.role,
                    userInput.assigned_barangay ?? null,
                    userInput.is_active ?? true,
                    userInput.password ?? null,
                    userInput.failed_login_attempts ?? 0,
                    userInput.locked_until ?? null,
                    userInput.last_login_at ?? null,
                    userInput.must_change_password ?? true,
                    userInput.created_by_user_id ?? null
                ]);
            } else {
                await executor.execute(`
                    INSERT INTO users (
                        id,
                        full_name,
                        role,
                        assigned_barangay,
                        is_active,
                        password,
                        failed_login_attempts,
                        locked_until,
                        last_login_at,
                        must_change_password,
                        created_by_user_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET
                        full_name = EXCLUDED.full_name,
                        role = EXCLUDED.role,
                        assigned_barangay = EXCLUDED.assigned_barangay,
                        password = EXCLUDED.password,
                        is_active = EXCLUDED.is_active,
                        failed_login_attempts = EXCLUDED.failed_login_attempts,
                        locked_until = EXCLUDED.locked_until,
                        last_login_at = EXCLUDED.last_login_at,
                        must_change_password = EXCLUDED.must_change_password,
                        created_by_user_id = COALESCE(EXCLUDED.created_by_user_id, users.created_by_user_id)
                `, [
                    userInput.id,
                    fullName,
                    userInput.role,
                    userInput.assigned_barangay ?? null,
                    userInput.is_active ?? true,
                    userInput.password ?? null,
                    userInput.failed_login_attempts ?? 0,
                    userInput.locked_until ?? null,
                    userInput.last_login_at ?? null,
                    userInput.must_change_password ?? true,
                    userInput.created_by_user_id ?? null
                ]);
            }
        } catch (error) {
            if (this.isFullNameUniqueViolation(error)) {
                throw this.buildDuplicateFullNameError(fullName);
            }
            throw error;
        }

        return {
            ...userInput,
            full_name: fullName
        };
    }
}

module.exports = UserIdentityService;
