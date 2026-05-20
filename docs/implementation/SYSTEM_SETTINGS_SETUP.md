# System Settings - Quick Setup Guide

## Installation Steps

### 1. Run Database Migration

```bash
cd server
node migrations/run_system_settings_migration.js
```

**Expected Output**:
```
[MIGRATION] Starting system_settings table creation...
[MIGRATION] ✓ system_settings table created successfully
[MIGRATION] ✓ Default settings inserted
[MIGRATION] ✓ system_audit_logs table verified
```

### 2. Verify Database Tables

```sql
-- Check tables exist
SHOW TABLES LIKE 'system_settings';
SHOW TABLES LIKE 'system_audit_logs';

-- Verify default settings
SELECT COUNT(*) FROM system_settings;
-- Expected: 16 rows

-- View all settings
SELECT setting_key, setting_value, category FROM system_settings ORDER BY category;
```

### 3. Restart Server

The routes are already registered in `server.js`. Just restart:

```bash
cd server
npm run dev
```

### 4. Test API Endpoints

#### Get Settings (Admin Only)
```bash
curl -H "x-auth-token: YOUR_ADMIN_TOKEN" \
  http://localhost:3000/api/admin/settings
```

#### Update Settings (Admin Only)
```bash
curl -X PUT \
  -H "x-auth-token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"system_name":"My Custom Name"}}' \
  http://localhost:3000/api/admin/settings
```

### 5. Access UI

1. Login as Admin
2. Navigate to: `http://localhost:5174/admin/settings`
3. You should see 4 grouped sections:
   - 🔒 Security Controls
   - 🛡️ Governance & Compliance
   - 🔔 Notifications
   - 🌐 General System

---

## Testing Checklist

### ✅ RBAC Enforcement
- [ ] Login as Admin → Can access settings page
- [ ] Login as Midwife → Redirected (403)
- [ ] Login as BHW → Redirected (403)
- [ ] No token → Redirected to login

### ✅ Validation
- [ ] Try setting `password_min_length` to 3 → Rejected (min is 6)
- [ ] Try setting `password_min_length` to 50 → Rejected (max is 32)
- [ ] Try setting `audit_retention_days` to 30 → Rejected (min is 90)
- [ ] Set valid values → Accepted

### ✅ Audit Logging
```sql
-- After making changes, verify audit log
SELECT 
    admin_id,
    action_type,
    before_value,
    after_value,
    timestamp
FROM system_audit_logs
WHERE action_type = 'SETTINGS_UPDATE'
ORDER BY timestamp DESC
LIMIT 5;
```

### ✅ UI Behavior
- [ ] Change a setting → "Modified" badge appears
- [ ] Unsaved changes counter shows correct number
- [ ] Click "Commit Changes" → Confirmation dialog appears
- [ ] Confirm → Success message shows
- [ ] Reload page → Changes persist

### ✅ Critical Settings Warning
- [ ] Change `maintenance_mode` → Confirmation dialog required
- [ ] Change `audit_retention_days` → Confirmation dialog required
- [ ] Change `password_min_length` → Confirmation dialog required

---

## Troubleshooting

### Issue: Migration fails with "Table already exists"
**Solution**: Tables already created. Skip migration or drop tables first:
```sql
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS system_audit_logs;
```
Then re-run migration.

### Issue: 403 Forbidden on API calls
**Solution**: Verify you're using an Admin token:
```sql
SELECT id, role FROM users WHERE id = 'YOUR_USER_ID';
-- Role must be 'Admin'
```

### Issue: Settings not loading in UI
**Solution**: Check browser console for errors. Verify API endpoint:
```bash
curl -H "x-auth-token: YOUR_TOKEN" http://localhost:3000/api/admin/settings
```

### Issue: Changes not saving
**Solution**: Check server logs for validation errors. Verify values are within allowed ranges.

---

## Default Settings Reference

| Setting | Default | Min | Max | Category |
|---------|---------|-----|-----|----------|
| password_min_length | 8 | 6 | 32 | security |
| password_require_complexity | true | - | - | security |
| session_timeout_minutes | 60 | 15 | 480 | security |
| max_login_attempts | 5 | 3 | 10 | security |
| lockout_duration_minutes | 30 | 5 | 120 | security |
| audit_retention_days | 365 | 90 | 3650 | governance |
| rule_staging_warning_enabled | true | - | - | governance |
| protocol_activation_auto | false | - | - | governance |
| require_justification_override | true | - | - | governance |
| sms_enabled | true | - | - | notifications |
| sms_reminder_days_before | 3 | 1 | 14 | notifications |
| email_notifications_enabled | false | - | - | notifications |
| notification_batch_size | 100 | 10 | 1000 | notifications |
| system_name | ImmuniCare LGU | - | - | general |
| maintenance_mode | false | - | - | general |
| default_timezone | Asia/Manila | - | - | general |
| records_per_page | 15 | 10 | 100 | general |

---

## Security Notes

⚠️ **CRITICAL**: This module controls system behavior. Only grant Admin access to trusted personnel.

✅ **Audit Trail**: All changes are permanently logged with admin ID, timestamp, and before/after values.

✅ **Validation**: Backend validates all inputs. Frontend validation is for UX only.

✅ **Compliance**: Certain settings (like audit retention) have minimum values enforced by regulation.

✅ **No Deletion**: Settings can only be updated, never deleted. History is preserved.

---

## Next Steps

After successful setup:

1. Review default settings and adjust as needed
2. Train admin staff on proper usage
3. Set up monitoring for critical setting changes
4. Document your organization's configuration policies
5. Regularly review audit logs for unauthorized changes

---

## Support

For issues or questions:
1. Check server logs: `server/server.log`
2. Check browser console for frontend errors
3. Verify database connectivity
4. Ensure admin authentication is working
5. Review `SYSTEM_SETTINGS_IMPLEMENTATION.md` for detailed documentation
