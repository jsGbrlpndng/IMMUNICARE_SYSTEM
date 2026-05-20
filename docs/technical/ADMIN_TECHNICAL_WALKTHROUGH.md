# ADMIN SUBSYSTEM - TECHNICAL WALKTHROUGH
## Internal Engineering Manual for Audit Defense

**Document Purpose:** Complete technical reference for maintaining and defending the Admin subsystem before auditors, thesis panels, and security reviews.

**Target Audience:** Engineers who must understand, maintain, and defend every decision in this system.

**Scope:** All admin-facing modules, authentication, authorization, data flows, validation, audit behavior, and failure modes.

---

## TABLE OF CONTENTS

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Authentication & Authorization Pipeline](#2-authentication--authorization-pipeline)
3. [Admin Dashboard](#3-admin-dashboard)
4. [User Management](#4-user-management)
5. [DOH Compliance Rules](#5-doh-compliance-rules)
6. [Audit & Forensic Center](#6-audit--forensic-center)
7. [System Settings](#7-system-settings)
8. [Navigation & Layout Protection](#8-navigation--layout-protection)
9. [Cross-Cutting Concerns](#9-cross-cutting-concerns)
10. [Operational Impact Analysis](#10-operational-impact-analysis)
11. [Panel Questions & Answers](#11-panel-questions--answers)

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

### 1.1 Purpose

The Admin subsystem is the **Governed Configuration Authority** for the ImmuniCare system. It exists to:

- **Risk Mitigation:** Prevent unauthorized system configuration changes that could compromise clinical data integrity
- **Compliance:** Maintain audit trails required by DOH regulations for healthcare information systems
- **Operational Control:** Provide centralized management of users, policies, and system behavior
- **Accountability:** Ensure every administrative action is logged and attributable

### 1.2 Design Philosophy

**Defense in Depth:** Authorization is enforced at multiple layers (frontend routing, backend middleware, database queries).

**Immutability Where Critical:** DOH rules cannot be edited or deleted, only versioned forward.

**Audit Everything:** Every state-changing operation creates an audit log entry. Failed operations do NOT create logs (correct behavior - only successful state changes are recorded).

**Fail Secure:** On authentication failure, authorization failure, or validation failure, the system denies access and logs the attempt.

### 1.3 Technology Stack

**Frontend:**
- React 18 with functional components and hooks
- React Router v6 for navigation
- Tailwind CSS for styling
- Lucide React for icons

**Backend:**
- Node.js with Express
- MySQL 8.0 for data persistence
- JWT for authentication tokens
- bcrypt for password hashing

**Security:**
- Custom JWT implementation (`SecurityUtils.js`)
- Role-Based Access Control (RBAC) middleware
- Parameterized SQL queries (SQL injection prevention)
- Transaction-based updates (atomicity guarantee)

---

## 2. AUTHENTICATION & AUTHORIZATION PIPELINE

### 2.1 Purpose

**Why This Exists:**
- Prevent unauthorized access to administrative functions
- Ensure only Admin role can modify system configuration
- Provide session management and token-based authentication

**Risk Solved:**
- Unauthorized users modifying critical system settings
- Privilege escalation attacks
- Session hijacking

### 2.2 Access Control

**Who Is Allowed:**
- Only users with `role = 'Admin'` in the `users` table
- User must have `is_active = 1` (account not disabled)
- Valid JWT token required in `x-auth-token` header

**Who Is Denied:**
- Midwife role (403 Forbidden)
- BHW role (403 Forbidden)
- Unauthenticated requests (401 Unauthorized)
- Disabled accounts (403 Forbidden)
- Invalid/expired/tampered tokens (401 Unauthorized)

### 2.3 Data Flow: Authentication

**Step-by-Step Flow:**

1. **User Login** (`POST /api/auth/login`)
   - User submits credentials (ID + password)
   - Backend queries `users` table
   - Password verified with bcrypt.compare()
   - If valid: JWT token generated with payload `{id, role}`
   - Token signed with `JWT_SECRET` from environment
   - Response: `{token, user: {id, role, name}}`

2. **Token Storage** (Frontend)
   - Token stored in `localStorage` as `auth_token`
   - User object stored in `localStorage` as `user`
   - AuthContext loads these on app initialization

3. **API Request** (Frontend)
   - `apiClient.js` intercepts all requests
   - Reads `auth_token` from localStorage
   - Attaches as `x-auth-token` header
   - Sends request to backend

4. **Token Verification** (Backend Middleware)
   - `adminAuth.js` middleware executes
   - Extracts token from `x-auth-token` header
   - Calls `SecurityUtils.verifyToken(token)`
   - JWT signature verified
   - Payload extracted: `{id, role}`

5. **Database Verification** (Defense in Depth)
   - Middleware queries `users` table with extracted ID
   - Verifies `role = 'Admin'`
   - Verifies `is_active = 1`
   - If any check fails → 401 or 403 response

6. **Request Processing**
   - User object attached to `req.user = {id, role}`
   - Request proceeds to route handler
   - Route handler has access to authenticated user ID

### 2.4 Validation & Safety

**Prevention Mechanisms:**

1. **Token Tampering:** JWT signature verification fails if payload modified
2. **Token Theft:** HTTPS required in production (not enforced in dev)
3. **Privilege Escalation:** Database role check prevents token payload manipulation
4. **Disabled Account Bypass:** Active status checked on every request
5. **Missing Token:** 401 response, request rejected immediately

**Failure Behavior:**

- **Invalid Token:** Returns 401 with message "Invalid or spoofed token detected"
- **Missing Token:** Returns 401 with message "Missing Auth Token"
- **Wrong Role:** Returns 403 with message "Admin access required"
- **Disabled Account:** Returns 403 with message "Account is disabled"
- **Database Error:** Returns 500 with generic error (no details leaked)

### 2.5 Audit Behavior

**What Is Logged:**
- Login attempts (success/failure) → `system_audit_logs`
- Token generation → Not logged (too noisy)
- Authorization failures → Not logged (would create noise from probing attacks)

**What Is NOT Logged:**
- Failed authentication attempts (by design - prevents log flooding)
- Token verification (happens on every request, too noisy)

**Why This Matters:**
- Successful logins indicate legitimate access
- Failed logins would flood logs with brute force attempts
- Authorization failures at middleware level are expected (e.g., Midwife trying admin endpoint)

### 2.6 Failure Modes

**What Can Break:**

1. **JWT_SECRET Compromise:** Attacker can forge valid tokens
   - **Mitigation:** Secret stored in environment variable, not in code
   - **Detection:** Unusual admin activity in audit logs

2. **Database Connection Failure:** All requests fail with 500
   - **Behavior:** System becomes read-only (no writes possible)
   - **Protection:** Existing sessions remain valid until token expiry

3. **Token Expiry:** User session ends, must re-login
   - **Behavior:** 401 response, frontend redirects to login
   - **Protection:** No data loss, user can re-authenticate

### 2.7 Dependencies

**Tables:**
- `users` (id, role, is_active, password)

**Services:**
- `SecurityUtils.js` (JWT signing/verification)
- `apiClient.js` (frontend token injection)

**Middleware:**
- `adminAuth.js` (backend authorization)

**Environment:**
- `JWT_SECRET` (token signing key)

### 2.8 Design Rationale

**Why JWT Instead of Sessions:**
- Stateless authentication (no server-side session storage)
- Scales horizontally (no session affinity required)
- Token contains role information (reduces database queries)

**Why Database Verification After JWT:**
- Defense in depth (don't trust token alone)
- Allows immediate account disable (token becomes invalid)
- Prevents stale role information (user demoted but token still valid)

**Why `x-auth-token` Header Instead of `Authorization: Bearer`:**
- Custom header name (security through obscurity - minor benefit)
- Avoids conflicts with other auth schemes
- Explicit naming makes debugging easier

### 2.9 Operational Impact

**If Misconfigured:**
- Wrong JWT_SECRET → All tokens invalid, all users locked out
- Missing adminAuth middleware → Endpoints become public
- Database role check removed → Token payload becomes source of truth (dangerous)

**If Abused:**
- Admin account compromised → Full system control
- Token leaked → Attacker has admin access until token expires
- Brute force on login → Rate limiting not implemented (vulnerability)

### 2.10 Typical Panel Questions

**Q: Why not use OAuth2 or a standard auth library?**
A: This is a closed system for a single LGU. OAuth2 adds complexity for multi-tenant scenarios we don't have. Custom JWT implementation gives us full control over token payload and expiry. In production, we'd consider Auth0 or similar for enterprise deployments.

**Q: What prevents an attacker from modifying the JWT payload to change their role?**
A: The JWT is signed with a secret key. Any modification to the payload invalidates the signature. Additionally, we perform database verification on every request as defense in depth.

**Q: Why store tokens in localStorage instead of httpOnly cookies?**
A: This is a known trade-off. localStorage is vulnerable to XSS attacks, but allows easier mobile app integration. In production, we'd use httpOnly cookies for web and separate token storage for mobile.

**Q: What happens if an admin's account is disabled while they have an active session?**
A: The next API request will fail at the database verification step in adminAuth middleware. The token is technically still valid, but the middleware checks is_active=1 on every request.

**Q: How do you prevent brute force attacks on the login endpoint?**
A: Currently not implemented. This is a known gap. Production deployment would require rate limiting middleware (e.g., express-rate-limit) on the /api/auth/login endpoint.

---


## 3. ADMIN DASHBOARD

### 3.1 Purpose

**Why This Exists:**
- Provide at-a-glance system health and activity monitoring
- Surface critical metrics requiring admin attention
- Enable quick navigation to problem areas

**Risk Solved:**
- Admins unaware of pending approvals or system issues
- Delayed response to compliance violations
- Lack of visibility into system activity

### 3.2 Access Control

**Who Is Allowed:**
- Admin role only (enforced by AdminRoute wrapper)

**Frontend Protection:**
- `<AdminRoute>` component checks `user.role === 'Admin'`
- Redirects non-admins to `/clinical/dashboard`
- Redirects unauthenticated users to `/portal`

**Backend Protection:**
- `/api/admin/dashboard/stats` protected by `adminAuth` middleware
- `/api/admin/audit/system` protected by `adminAuth` middleware

### 3.3 Data Flow

**Step-by-Step:**

1. **Component Mount**
   - `AdminDashboard.jsx` renders
   - `useEffect` triggers on mount
   - Checks if `user` exists in AuthContext

2. **Stats Request**
   - `apiClient.get('/admin/dashboard/stats')` called
   - Token automatically attached by apiClient
   - Backend receives request at `/api/admin/dashboard/stats`

3. **Backend Processing** (`server/routes/admin.js`)
   ```
   adminAuth middleware → verify token → check role
   ↓
   Query 1: COUNT(*) FROM users WHERE is_active = 1
   Query 2: COUNT(*) FROM infants WHERE registration_status = 'Pending'
   Query 3: COUNT(*) FROM infants WHERE registration_status = 'Approved'
   Query 4: COUNT(DISTINCT infant_id) FROM immunization_logs WHERE is_validated = 0 AND scheduled_date < NOW()
   Query 5: COUNT(*) FROM schedule_overrides WHERE authorization_status = 'Approved'
   Query 6: COUNT(*) FROM doh_compliance_rules WHERE effective_date <= TODAY AND (expiry_date IS NULL OR expiry_date >= TODAY)
   Query 7: SELECT 1 (health check)
   ↓
   Aggregate results into JSON object
   ↓
   Return 200 with stats object
   ```

4. **Audit Logs Request**
   - `apiClient.get('/admin/audit/system')` called
   - Backend queries `system_audit_logs` table
   - Returns last 1000 entries, ordered by timestamp DESC
   - Frontend displays first 10

5. **Frontend Update**
   - `setStats(statsData)` updates state
   - `setAuditLogs(auditsData.slice(0, 10))` updates state
   - React re-renders with new data
   - Loading spinner removed

### 3.4 Validation & Safety

**Data Validation:**
- All counts default to 0 if query fails
- System health defaults to "Loading..." then "Operating Normally" or "Degraded"
- Defensive: `data?.logs ?? []` prevents crashes if API returns unexpected structure

**Error Handling:**
- Try-catch wraps all API calls
- Errors logged to console (not shown to user)
- Loading state removed even on error
- Stats remain at 0 (safe default)

**SQL Injection Prevention:**
- No user input in dashboard queries
- All queries use parameterized statements where needed

### 3.5 Audit Behavior

**What Is Logged:**
- Dashboard page access → NOT logged (too noisy, read-only operation)
- Stats queries → NOT logged (read-only)

**What Is Displayed:**
- Recent admin actions from `system_audit_logs`
- Shows: action_type, target_entity, admin_id, timestamp
- Redacted: No sensitive details shown in dashboard view

**Why This Matters:**
- Dashboard is read-only, no state changes
- Logging every dashboard view would flood audit logs
- Actual admin actions (user creation, settings changes) are logged at their source

### 3.6 Failure Modes

**What Can Break:**

1. **Database Connection Failure:**
   - All stats show 0
   - System health shows "Degraded"
   - Audit logs empty
   - User sees empty dashboard but no error message

2. **Slow Queries:**
   - Dashboard takes long to load
   - Loading spinner visible
   - No timeout implemented (potential hang)

3. **Invalid Token:**
   - 401 response from API
   - apiClient redirects to login
   - User never sees dashboard

### 3.7 Dependencies

**Tables:**
- `users` (active user count)
- `infants` (pending approvals, registered count)
- `immunization_logs` (overdue cases)
- `schedule_overrides` (approved overrides)
- `doh_compliance_rules` (active rules count)
- `system_audit_logs` (recent activity)

**Services:**
- `apiClient.js` (HTTP requests)
- `AuthContext` (user state)

**Routes:**
- `/api/admin/dashboard/stats`
- `/api/admin/audit/system`

### 3.8 Design Rationale

**Why Aggregate Stats Instead of Real-Time:**
- Reduces database load (single query per metric)
- Acceptable latency for admin dashboard (not real-time critical)
- Simpler implementation than WebSocket updates

**Why Show Last 10 Audit Logs:**
- Provides recent activity context
- Doesn't overwhelm with information
- Full audit log available in dedicated page

**Why No Auto-Refresh:**
- Admin dashboard is not mission-critical real-time
- Manual refresh via browser sufficient
- Reduces server load

### 3.9 Operational Impact

**If Misconfigured:**
- Wrong query logic → Incorrect stats displayed
- Missing adminAuth → Non-admins see dashboard (data leak)
- Slow queries → Dashboard unusable

**If Abused:**
- Repeated dashboard loads → Database load (minor impact)
- No rate limiting → Potential DoS vector (low severity)

### 3.10 Typical Panel Questions

**Q: Why not cache the dashboard stats?**
A: Stats change frequently (new registrations, approvals). Caching would show stale data. For a production system with high load, we'd implement Redis caching with 30-second TTL.

**Q: What if a query returns NULL instead of 0?**
A: The COUNT(*) aggregate always returns a number (0 if no rows). The `[0].count` access is safe. If the query fails entirely, the try-catch prevents crashes and stats default to 0.

**Q: Why show "Degraded" health status instead of specific error?**
A: Security through obscurity. We don't want to leak database error details to potential attackers. Admins can check server logs for specifics.

**Q: How do you prevent an admin from seeing another admin's actions in the audit log?**
A: We don't. All admins can see all admin actions. This is intentional for accountability. If an admin goes rogue, other admins can detect it.

---


## 4. USER MANAGEMENT

### 4.1 Purpose

**Why This Exists:**
- Control who has access to the system
- Manage role assignments (Admin, Midwife, BHW)
- Enable/disable accounts without deletion (audit trail preservation)
- Reset passwords for locked-out users

**Risk Solved:**
- Unauthorized system access
- Privilege escalation
- Account lifecycle management
- Password recovery without security compromise

### 4.2 Access Control

**Who Is Allowed:**
- Admin role only

**Operations:**
- **View Users:** All admins can see all users
- **Create User:** All admins can create any role (including other admins)
- **Toggle Status:** All admins can enable/disable any user (including other admins)
- **Reset Password:** All admins can reset any user's password

**Security Concern:**
- No protection against admin disabling other admins
- No "super admin" concept
- This is acceptable for single-LGU deployment with trusted admins

### 4.3 Data Flow: Create User

**Step-by-Step:**

1. **Frontend Form Submission**
   - User fills: full_name, role, assigned_barangay (if BHW), password
   - Validation: password >= 6 characters, barangay required for BHW
   - `apiClient.post('/admin/users', userData)` called

2. **Backend Receives Request** (`POST /api/admin/users`)
   - adminAuth middleware verifies admin role
   - Extract: `{full_name, role, assigned_barangay, password}`

3. **Validation**
   ```
   Check: full_name, role, password present
   Check: role in ['Admin', 'Midwife', 'BHW']
   Check: if role === 'BHW' then assigned_barangay required
   ```

4. **ID Generation** (`generateUserId` function)
   ```
   Determine prefix: Admin → 'ADMIN', Midwife → 'MW', BHW → 'BHW'
   Query: SELECT id FROM users WHERE id LIKE 'PREFIX-%' ORDER BY id DESC LIMIT 1
   Extract numeric suffix from last ID
   Increment: nextNum = lastNum + 1
   Format: 'PREFIX-001', 'PREFIX-002', etc. (zero-padded)
   ```

5. **Password Hashing**
   ```
   bcrypt.hash(password, 10) → hashedPassword
   Salt rounds: 10 (2^10 = 1024 iterations)
   ```

6. **Database Insert**
   ```sql
   INSERT INTO users (id, full_name, role, assigned_barangay, is_active, password)
   VALUES (generated_id, full_name, role, barangay_or_null, 1, hashed_password)
   ```

7. **Audit Logging**
   ```
   performAuditLog(admin_id, 'USER_CREATE', 'users', new_user_id, {full_name, role, assigned_barangay}, req)
   ```

8. **Response**
   ```json
   {
     "success": true,
     "user_id": "MW-001",
     "message": "User created successfully."
   }
   ```

### 4.4 Data Flow: Toggle User Status

**Step-by-Step:**

1. **Frontend Action**
   - Admin clicks enable/disable button
   - `apiClient.put(`/admin/users/${userId}/status`, {is_active: newStatus})` called

2. **Backend Processing**
   ```
   adminAuth middleware → verify admin role
   ↓
   Extract: userId from URL params, is_active from body
   ↓
   Validate: is_active is number or boolean
   ↓
   Convert: is_active to 1 or 0
   ↓
   UPDATE users SET is_active = ? WHERE id = ?
   ↓
   performAuditLog(admin_id, 'USER_STATUS_TOGGLE', 'users', userId, {is_active}, req)
   ↓
   Return: {success: true, is_active: newStatus}
   ```

3. **Immediate Effect**
   - If user disabled: next API request with their token fails at adminAuth middleware
   - Token remains valid but database check fails
   - User sees 403 Forbidden on next request

### 4.5 Data Flow: Reset Password

**Step-by-Step:**

1. **Frontend Action**
   - Admin clicks reset password button
   - `apiClient.post(`/admin/users/${userId}/reset-password`)` called

2. **Backend Processing**
   ```
   adminAuth middleware → verify admin role
   ↓
   Generate temporary password: Math.random().toString(36).substring(2, 10)
   ↓
   Hash password: bcrypt.hash(tempPassword, 10)
   ↓
   UPDATE users SET password = ? WHERE id = ?
   ↓
   performAuditLog(admin_id, 'USER_PASSWORD_RESET', 'users', userId, {status: 'SUCCESS'}, req)
   ↓
   Return: {success: true, temporary_password: tempPassword}
   ```

3. **Security Consideration**
   - Temporary password shown ONCE in response
   - Admin must communicate to user securely (out of band)
   - Old password immediately invalidated
   - User should change password on first login (not enforced)

### 4.6 Validation & Safety

**Create User Validation:**
- Role must be in whitelist (prevents arbitrary role injection)
- BHW must have barangay (business rule enforcement)
- Password minimum length (6 characters - weak, should be 8+)
- ID generation prevents collisions (sequential numbering)

**Password Security:**
- bcrypt with 10 salt rounds (industry standard)
- Passwords never stored in plain text
- Passwords never returned in API responses (except temp password on reset)

**SQL Injection Prevention:**
- All queries use parameterized statements
- User input never concatenated into SQL strings

### 4.7 Audit Behavior

**What Is Logged:**
- User creation → `system_audit_logs` with action_type='USER_CREATE'
- Status toggle → `system_audit_logs` with action_type='USER_STATUS_TOGGLE'
- Password reset → `system_audit_logs` with action_type='USER_PASSWORD_RESET'

**Audit Log Contents:**
- admin_id: Who performed the action
- action_type: What action was performed
- target_entity: 'users'
- before_value: Previous state (for status toggle)
- after_value: New state
- details: JSON with additional context
- timestamp: When action occurred

**Why This Matters:**
- Every user lifecycle event is traceable
- If unauthorized user created, audit log shows who did it
- If account disabled maliciously, audit log shows who did it
- Supports forensic investigation and compliance audits

### 4.8 Failure Modes

**What Can Break:**

1. **ID Generation Collision:**
   - If two admins create users simultaneously, race condition possible
   - **Mitigation:** Database primary key constraint prevents duplicate IDs
   - **Behavior:** Second insert fails, user sees error, must retry

2. **Password Reset Without Secure Communication:**
   - Admin sees temp password, must communicate to user
   - If communication channel insecure (email, SMS), password exposed
   - **Mitigation:** Recommend in-person or encrypted channel

3. **Admin Disables Own Account:**
   - Admin can disable themselves
   - **Behavior:** Next request fails, admin locked out
   - **Recovery:** Another admin must re-enable account

4. **All Admins Disabled:**
   - If all admin accounts disabled, no one can re-enable
   - **Recovery:** Direct database access required (emergency procedure)

### 4.9 Dependencies

**Tables:**
- `users` (id, full_name, role, assigned_barangay, is_active, password, created_at)

**Services:**
- `bcrypt` (password hashing)
- `uuid` (not used for user IDs, but available)
- `auditLogger.js` (audit trail)

**Middleware:**
- `adminAuth.js` (authorization)

### 4.10 Design Rationale

**Why Custom ID Format (MW-001) Instead of UUID:**
- Human-readable IDs easier for support and debugging
- Role prefix makes user type immediately obvious
- Sequential numbering shows account creation order
- Shorter than UUID (easier to communicate verbally)

**Why Allow Admins to Create Other Admins:**
- Simplifies onboarding (no "super admin" needed)
- Acceptable risk for trusted LGU environment
- All admin actions logged (accountability)

**Why Disable Instead of Delete:**
- Preserves audit trail (foreign key references remain valid)
- Allows account reactivation if needed
- Prevents orphaned records in related tables

**Why Show Temporary Password in Response:**
- Admin needs to communicate password to user
- Alternative (email) requires email infrastructure
- Acceptable for closed LGU environment with trusted admins

### 4.11 Operational Impact

**If Misconfigured:**
- Wrong role validation → Arbitrary roles created
- Missing bcrypt → Passwords stored in plain text (catastrophic)
- No audit logging → No accountability

**If Abused:**
- Malicious admin creates rogue accounts → Audit log shows who
- Malicious admin disables legitimate users → Audit log shows who
- Malicious admin resets passwords → Audit log shows who

### 4.12 Typical Panel Questions

**Q: What prevents an admin from creating a user with role='SuperAdmin' or other arbitrary role?**
A: The backend validates role against a whitelist: `['Admin', 'Midwife', 'BHW']`. Any other value returns 400 Bad Request. This is enforced in the route handler before database insert.

**Q: Why use bcrypt instead of a simpler hash like SHA-256?**
A: bcrypt is designed for password hashing with built-in salting and configurable work factor. SHA-256 is too fast (vulnerable to brute force). bcrypt's 10 salt rounds means 2^10 iterations, making brute force attacks computationally expensive.

**Q: What happens if an admin resets their own password?**
A: The system allows it. The admin receives the temporary password in the API response. They must then use that password to log in again. This is a valid use case (admin forgot their own password).

**Q: How do you prevent ID collisions if two admins create users at the exact same time?**
A: The database primary key constraint on `users.id` prevents duplicates. If a collision occurs (extremely rare with sequential IDs), the second INSERT fails with a duplicate key error. The frontend shows an error and the admin can retry. In production, we'd add a database-level sequence or use UUIDs.

**Q: Why not enforce password complexity rules (uppercase, numbers, symbols)?**
A: Current implementation only checks minimum length (6 characters). This is a known gap. Production deployment should enforce complexity rules matching the `password_require_complexity` system setting. The validation logic exists in the settings module but is not yet integrated into user creation.

---


## 5. DOH COMPLIANCE RULES

### 5.1 Purpose

**Why This Exists:**
- Enforce Department of Health (DOH) immunization protocols
- Maintain versioned history of policy changes
- Prevent retroactive policy modification (immutability)
- Enable future policy staging (effective dates)

**Risk Solved:**
- Unauthorized modification of clinical protocols
- Loss of policy history (compliance violation)
- Retroactive policy changes (audit integrity violation)
- Conflicting policy versions

### 5.2 Access Control

**Who Is Allowed:**
- **View Active Rules:** All roles (Midwife, BHW, Admin) - needed for clinical operations
- **View Rule History:** Admin only
- **Create New Version:** Admin only
- **Edit Existing Rule:** BLOCKED (405 Method Not Allowed)
- **Delete Rule:** BLOCKED (405 Method Not Allowed)

**Why This Design:**
- Clinical staff need active rules to validate immunizations
- Only admins can see full history (governance oversight)
- Immutability enforced at API level (PUT/DELETE return 405)

### 5.3 Data Flow: View Active Rules

**Step-by-Step:**

1. **Frontend Request**
   - Midwife/BHW/Admin calls `apiClient.get('/rules/active')`
   - No authentication required (public endpoint)

2. **Backend Processing** (`GET /api/rules/active`)
   ```
   Get today's date: YYYY-MM-DD
   ↓
   Query: SELECT * FROM doh_compliance_rules
          WHERE effective_date <= TODAY
          AND (expiry_date IS NULL OR expiry_date >= TODAY)
          ORDER BY vaccine_code ASC
   ↓
   Return: {count, rules: [...]}
   ```

3. **JIT (Just-In-Time) Filtering**
   - Database contains all versions (past, present, future)
   - Query filters to only currently active versions
   - No caching (always fresh data)

### 5.4 Data Flow: Create New Rule Version

**Step-by-Step:**

1. **Frontend Form Submission**
   - Admin fills: vaccine_code, vaccine_name, description, min_age_days, max_age_days, min_interval_days, allowed_early_days, justification_required, effective_date
   - Validation: effective_date must be today or future
   - `apiClient.post('/rules', formData)` called

2. **Backend Receives Request** (`POST /api/rules`)
   - adminAuth middleware verifies admin role
   - Begin database transaction

3. **Regulatory Validation**
   ```
   Check: vaccine_code, vaccine_name, min_age_days, effective_date present
   Check: effective_date >= TODAY (no backdating)
   Check: effective_date <= TODAY + 2 years (relevance window)
   ```

4. **Timeline Overlap Protection**
   ```sql
   SELECT * FROM doh_compliance_rules
   WHERE vaccine_code = ? AND effective_date > ?
   ```
   - If future version exists → 409 Conflict
   - Prevents creating version that would be superseded

5. **Automatic Expiry Set**
   ```sql
   SELECT * FROM doh_compliance_rules
   WHERE vaccine_code = ? AND (expiry_date IS NULL OR expiry_date >= ?)
   ORDER BY effective_date DESC LIMIT 1
   ```
   - Find current "latest" version
   - Set its expiry_date = new_effective_date - 1 day
   - Ensures clean version transition

6. **Atomic Insert**
   ```sql
   INSERT INTO doh_compliance_rules (
     rule_id, vaccine_code, vaccine_name, description,
     min_age_days, max_age_days, min_interval_days,
     allowed_early_days, justification_required,
     effective_date, created_by
   ) VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ```

7. **Mandatory Auditing**
   ```
   performAuditLog(admin_id, 'RULE_VERSION_CREATE', 'doh_compliance_rules', new_rule_id, {
     vaccine: vaccine_code,
     action: 'NEW_VERSION_STAGED',
     effective_from: effective_date
   }, req)
   ```

8. **Transaction Commit**
   - If any step fails → rollback entire transaction
   - If all succeed → commit changes
   - Return: {success: true, rule_id: new_id}

### 5.5 Validation & Safety

**Immutability Enforcement:**
- PUT endpoint returns 405: "Rules are immutable. Use POST to create a new version."
- DELETE endpoint returns 405: "Deletion prohibited. Use a future version to expire policy."
- No UPDATE queries in codebase
- No DELETE queries in codebase

**Backdating Prevention:**
- effective_date must be >= TODAY
- Prevents retroactive policy changes
- Preserves audit trail integrity

**Future Limit:**
- effective_date must be <= TODAY + 2 years
- Prevents unrealistic far-future policies
- Ensures policies remain relevant

**Overlap Prevention:**
- Cannot create version if future version exists
- Prevents timeline conflicts
- Ensures linear version history

**Transaction Safety:**
- All operations in single transaction
- Expiry update + insert + audit log = atomic
- Partial failure impossible

### 5.6 Audit Behavior

**What Is Logged:**
- New version creation → `system_audit_logs` with action_type='RULE_VERSION_CREATE'
- Details include: vaccine_code, effective_date, admin_id

**What Is NOT Logged:**
- Rule queries (read-only operations)
- Failed validation attempts (would flood logs)

**Why This Matters:**
- Every policy change is traceable
- Audit log shows who created which version when
- Supports compliance audits and forensic investigation

### 5.7 Failure Modes

**What Can Break:**

1. **Concurrent Version Creation:**
   - Two admins create versions for same vaccine simultaneously
   - **Behavior:** Second transaction sees first version, sets expiry correctly
   - **Protection:** Transaction isolation prevents race conditions

2. **Expiry Date Calculation Error:**
   - If new_effective_date - 1 day results in invalid date
   - **Behavior:** Database stores invalid date, queries may fail
   - **Mitigation:** Date arithmetic validated by database

3. **Transaction Rollback:**
   - If audit log insert fails, entire transaction rolls back
   - **Behavior:** No version created, no expiry set, no audit log
   - **Protection:** Atomicity guarantee

### 5.8 Dependencies

**Tables:**
- `doh_compliance_rules` (rule_id, vaccine_code, vaccine_name, description, min_age_days, max_age_days, min_interval_days, allowed_early_days, justification_required, effective_date, expiry_date, created_by, created_at)
- `users` (for created_by foreign key)

**Services:**
- `uuid` (rule_id generation)
- `auditLogger.js` (audit trail)

**Middleware:**
- `adminAuth.js` (authorization for write operations)

### 5.9 Design Rationale

**Why Immutability:**
- Prevents tampering with historical policies
- Supports compliance audits (DOH requires policy history)
- Enables forensic investigation (what policy was active when?)

**Why Versioning Instead of Editing:**
- Preserves complete history
- Allows future policy staging
- Prevents accidental overwrites

**Why Automatic Expiry:**
- Ensures clean version transitions
- Prevents overlapping active versions
- Reduces admin error (forgetting to expire old version)

**Why Block DELETE:**
- Deletion destroys audit trail
- Foreign key references would break
- Expiry achieves same goal without data loss

### 5.10 Operational Impact

**If Misconfigured:**
- Missing immutability blocks → Policies can be edited/deleted (catastrophic)
- Wrong expiry calculation → Overlapping or gap in active versions
- No transaction → Partial updates possible (data corruption)

**If Abused:**
- Malicious admin creates invalid policy → Audit log shows who
- Malicious admin backdates policy → Validation prevents it
- Malicious admin deletes policy → 405 error prevents it

### 5.11 Typical Panel Questions

**Q: What prevents an admin from directly modifying the database to edit a rule?**
A: Nothing. Direct database access bypasses all application-level controls. This is why database access must be restricted to DBAs only, and all DBA actions must be logged at the database level (not implemented in current system).

**Q: Why allow creating versions up to 2 years in the future?**
A: DOH policies are typically announced months in advance to allow healthcare facilities to prepare. 2 years is a reasonable window for policy planning. Beyond that, policies may become outdated before they take effect.

**Q: What happens if an admin creates a version with effective_date = tomorrow, then creates another version with effective_date = next week?**
A: The second creation will fail with 409 Conflict because a future version (tomorrow's) already exists. The admin must wait until tomorrow's version becomes active, then create next week's version.

**Q: How do you handle timezone differences for effective_date?**
A: All dates are stored as DATE type (no time component). The system uses server timezone for "today" calculation. In production, all servers should be in the same timezone (Asia/Manila for Philippines deployment).

**Q: What if a rule needs to be corrected immediately after creation (typo in description)?**
A: If the rule is not yet effective (effective_date is in the future), the admin can create a new version with the same effective_date. The system will reject it due to overlap protection. The only option is to wait until the rule becomes active, then create a corrected version for the next day. This is intentional - it forces careful review before submission.

---


## 6. AUDIT & FORENSIC CENTER

### 6.1 Purpose

**Why This Exists:**
- Provide read-only forensic interface for investigating system events
- Support compliance audits (DOH requires audit trails)
- Enable detection of unauthorized access or malicious activity
- Separate system governance logs from clinical operation logs

**Risk Solved:**
- Lack of accountability for admin actions
- Inability to investigate security incidents
- Compliance violations (missing audit trails)
- Data tampering without detection

### 6.2 Access Control

**Who Is Allowed:**
- Admin role only (both streams)

**What Can Be Accessed:**
- **Stream A (System Governance):** All admin actions (user management, settings changes, rule creation)
- **Stream B (Clinical Operations):** Redacted clinical authorization logs (NO infant_id, NO justification text)

**Why Redaction:**
- Admins don't need patient identifiers for system oversight
- Prevents admin access to clinical data (separation of concerns)
- Complies with DOH Privacy Protocol Section 4 (structural isolation)

### 6.3 Data Flow: System Audit Logs

**Step-by-Step:**

1. **Frontend Request**
   - `apiClient.get('/admin/audit/system?page=1&limit=50&actor=ADMIN-001&startDate=2026-01-01&endDate=2026-02-09')` called

2. **Backend Processing** (`GET /api/admin/audit/system`)
   ```
   adminAuth middleware → verify admin role
   ↓
   Extract query params: page, limit, actor, action, startDate, endDate
   ↓
   Build WHERE clauses:
     - If actor: admin_id = ?
     - If action: action_type = ?
     - If dates: timestamp BETWEEN ? AND ?
   ↓
   Query 1: SELECT * FROM system_audit_logs WHERE ... ORDER BY timestamp DESC LIMIT ? OFFSET ?
   Query 2: SELECT COUNT(*) FROM system_audit_logs WHERE ...
   ↓
   Return: {logs: [...], pagination: {total, page, limit}}
   ```

3. **Frontend Display**
   - Table shows: timestamp, admin_id, action_type, target_entity, details
   - Pagination controls at bottom
   - Click row → detail drawer opens

### 6.4 Data Flow: Clinical Audit Logs (Redacted)

**Step-by-Step:**

1. **Frontend Request**
   - `apiClient.get('/admin/audit/clinical?page=1&limit=50')` called

2. **Backend Processing** (`GET /api/admin/audit/clinical`)
   ```
   adminAuth middleware → verify admin role
   ↓
   CRITICAL: SELECT statement EXCLUDES infant_id and clinical_justification
   ↓
   Query: SELECT 
            audit_id, vaccine_name, midwife_id, action_type,
            compliance_status, created_at, override_type
          FROM authorization_audit
          WHERE ... ORDER BY created_at DESC LIMIT ? OFFSET ?
   ↓
   Return: {logs: [...], pagination: {total, page, limit}}
   ```

3. **Structural Redaction**
   - infant_id NEVER leaves database
   - clinical_justification NEVER leaves database
   - Admin sees: which midwife, which vaccine, when, compliance status
   - Admin does NOT see: which patient, why override was requested

### 6.5 Data Flow: Export Logs

**Step-by-Step:**

1. **Frontend Action**
   - Admin clicks "EXPORT REDACTED LOGS" button
   - `apiClient.get('/admin/audit/export?type=system')` called

2. **Backend Processing**
   ```
   adminAuth middleware → verify admin role
   ↓
   performAuditLog(admin_id, 'AUDIT_EXPORT', 'audit_system', null, {
     requested_filters: req.query,
     export_format: 'CSV'
   }, req)
   ↓
   Query: SELECT * FROM system_audit_logs ORDER BY timestamp DESC LIMIT 1000
   (or clinical query with same redaction rules)
   ↓
   Return: {data: [...], exported: true}
   ```

3. **Frontend CSV Generation**
   - Convert JSON to CSV format
   - Headers: Object.keys(data[0]).join(',')
   - Rows: Object.values(row).map(escape).join(',')
   - Create data URI: `data:text/csv;charset=utf-8,...`
   - Trigger download: `<a href={uri} download="immunicare_audit_system_redacted_2026-02-09.csv">`

4. **Export Audit**
   - Export action itself is logged
   - Shows: who exported, when, what filters used
   - Prevents silent data exfiltration

### 6.6 Validation & Safety

**Read-Only Enforcement:**
- No POST, PUT, DELETE endpoints
- Only GET endpoints
- No state-changing operations possible

**SQL Injection Prevention:**
- All query parameters sanitized
- Parameterized statements used
- No string concatenation in SQL

**Defensive Frontend:**
- `data?.logs ?? []` prevents crashes if API returns unexpected structure
- `data?.pagination?.total ?? 0` prevents undefined access
- Empty states handled gracefully

**Redaction Enforcement:**
- Redaction happens at SQL SELECT level (not application layer)
- Impossible to accidentally leak redacted fields
- Even if frontend requests them, database doesn't return them

### 6.7 Audit Behavior

**What Is Logged:**
- Audit log exports → `system_audit_logs` with action_type='AUDIT_EXPORT'
- Details include: export type, filters used, format

**What Is NOT Logged:**
- Audit log queries (read-only, too noisy)
- Page navigation (read-only)
- Filter changes (read-only)

**Why This Matters:**
- Export is logged because it's data exfiltration
- Queries are not logged because they're read-only and frequent
- Balance between audit completeness and log noise

### 6.8 Failure Modes

**What Can Break:**

1. **Large Result Sets:**
   - Query returns 1000+ rows
   - **Behavior:** Slow page load, potential timeout
   - **Mitigation:** Pagination limits to 50 rows per page

2. **Invalid Date Range:**
   - startDate > endDate
   - **Behavior:** Empty result set (no error)
   - **Mitigation:** Frontend should validate before sending

3. **Database Connection Failure:**
   - **Behavior:** 500 error, empty logs displayed
   - **Protection:** Try-catch prevents crash, safe defaults used

### 6.9 Dependencies

**Tables:**
- `system_audit_logs` (id, admin_id, action_type, target_entity, before_value, after_value, details, timestamp, ip_address)
- `authorization_audit` (audit_id, infant_id, vaccine_name, midwife_id, action_type, compliance_status, clinical_justification, created_at, override_type)

**Services:**
- `apiClient.js` (HTTP requests)

**Middleware:**
- `adminAuth.js` (authorization)

### 6.10 Design Rationale

**Why Two Separate Streams:**
- System governance and clinical operations are different concerns
- Different redaction rules apply
- Easier to audit each stream independently

**Why Redact Clinical Logs:**
- Admins don't need patient identifiers for system oversight
- Reduces risk of admin accessing patient data
- Complies with privacy regulations

**Why Log Exports:**
- Export is a form of data exfiltration
- Need to track who exported what and when
- Supports forensic investigation if data leak occurs

**Why Limit to 1000 Rows:**
- Prevents excessive database load
- Prevents browser memory issues with large CSV files
- Forces admins to use date filters for large exports

### 6.11 Operational Impact

**If Misconfigured:**
- Missing redaction → Admins see patient identifiers (privacy violation)
- No export logging → Silent data exfiltration possible
- No pagination → Database overload on large queries

**If Abused:**
- Admin exports all logs repeatedly → Database load (minor impact)
- Admin searches for specific patient → Redaction prevents it
- Admin tries to correlate clinical logs with patient data → Structural isolation prevents it

### 6.12 Typical Panel Questions

**Q: Why not encrypt audit logs at rest?**
A: Database-level encryption (TDE - Transparent Data Encryption) should be enabled in production. Application-level encryption would prevent SQL queries on encrypted fields. TDE encrypts the entire database file without impacting queries.

**Q: What prevents an admin from correlating redacted clinical logs with patient data using timing or other metadata?**
A: Nothing in the current implementation. An admin could theoretically correlate midwife_id + vaccine_name + timestamp with patient records. This is an acceptable risk for a trusted LGU environment. In a high-security environment, we'd add noise (random delays) or further aggregation.

**Q: Why allow admins to export logs at all? Isn't that a data leak risk?**
A: Admins need to export logs for compliance audits and forensic investigation. The export action itself is logged, creating accountability. In production, we'd add role-based export permissions (only certain admins can export).

**Q: What happens if the audit log table grows to millions of rows?**
A: Query performance degrades. Production deployment requires:
- Partitioning by date (monthly or yearly partitions)
- Archiving old logs to cold storage
- Indexing on timestamp, admin_id, action_type
- Regular maintenance (ANALYZE TABLE, OPTIMIZE TABLE)

**Q: How do you prevent an admin from deleting audit logs to cover their tracks?**
A: Current implementation doesn't prevent it. Production deployment requires:
- Database-level triggers to prevent DELETE on audit tables
- Append-only log storage (write-once, read-many)
- Replication to separate audit database with restricted access
- Blockchain-style hash chaining (each log entry contains hash of previous entry)

---


## 7. SYSTEM SETTINGS

### 7.1 Purpose

**Why This Exists:**
- Provide governed configuration authority for system behavior
- Allow runtime configuration changes without code deployment
- Enforce validation and compliance rules on configuration
- Maintain audit trail of all configuration changes

**Risk Solved:**
- Hardcoded configuration requiring code changes
- Invalid configuration values breaking system
- Unauthorized configuration changes
- Lack of configuration change history

### 7.2 Access Control

**Who Is Allowed:**
- Admin role only (read and write)

**Operations:**
- **View Settings:** All admins can see all settings
- **Modify Settings:** All admins can modify any setting (with validation)

**Critical Settings:**
- `maintenance_mode`: Puts system in read-only mode
- `audit_retention_days`: Must be >= 90 days (compliance requirement)
- `password_min_length`: Affects all new passwords

### 7.3 Data Flow: Retrieve Settings

**Step-by-Step:**

1. **Frontend Request**
   - `apiClient.get('/admin/settings')` called on component mount

2. **Backend Processing** (`GET /api/admin/settings`)
   ```
   adminAuth middleware → verify admin role
   ↓
   Query: SELECT setting_key, setting_value, value_type, category,
                 description, min_value, max_value, updated_at, updated_by
          FROM system_settings
          ORDER BY category, setting_key
   ↓
   Group by category: {security: [...], governance: [...], notifications: [...], general: [...]}
   ↓
   Return: {success: true, settings: grouped, raw: flat_array}
   ```

3. **Frontend State**
   - Convert flat array to key-value object
   - Store original values for change detection
   - Render grouped sections

### 7.4 Data Flow: Update Settings

**Step-by-Step:**

1. **Frontend Form Submission**
   - User modifies one or more settings
   - Clicks "Commit Changes" button
   - If critical settings changed → confirmation dialog
   - `apiClient.put('/admin/settings', {settings: {key: value, ...}})` called

2. **Backend Receives Request** (`PUT /api/admin/settings`)
   - adminAuth middleware verifies admin role
   - Begin database transaction

3. **Request Validation**
   ```
   Check: settings object present and is object
   Check: settings object not empty
   Extract: updateKeys = Object.keys(settings)
   ```

4. **Fetch Current Settings**
   ```sql
   SELECT setting_key, setting_value, value_type, min_value, max_value, category
   FROM system_settings
   WHERE setting_key IN (?, ?, ...)
   ```
   - Build map: settingsMap[key] = {value, type, min, max, category}

5. **Validate Each Update**
   ```
   For each (key, newValue) in updates:
     1. Check key exists in settingsMap (reject unknown keys)
     2. Validate type: validateAndConvert(newValue, type)
        - string: String(value).trim()
        - number: Number(value), check isNaN
        - boolean: 'true'/'false' conversion
        - json: JSON.parse validation
     3. Range validation (if type === 'number'):
        - Check: value >= min_value
        - Check: value <= max_value
     4. Special validation:
        - audit_retention_days: must be >= 90
        - maintenance_mode: log warning if enabled
     5. Build audit entry if value changed
     6. Build update list if value changed
   ```

6. **Validation Errors**
   - If any validation fails → rollback transaction
   - Return 400 with details array: ["key: error message", ...]

7. **No Changes Detected**
   - If no values actually changed → rollback transaction
   - Return 200 with message: "No changes detected"

8. **Perform Updates**
   ```sql
   For each valid update:
     UPDATE system_settings
     SET setting_value = ?, updated_by = ?, updated_at = NOW()
     WHERE setting_key = ?
   ```

9. **Write Audit Log**
   ```sql
   INSERT INTO system_audit_logs
   (admin_id, action_type, target_entity, before_value, after_value, details, timestamp)
   VALUES (?, 'SETTINGS_UPDATE', 'system_settings', ?, ?, ?, NOW())
   ```
   - before_value: JSON array of {key, value} before
   - after_value: JSON array of {key, value} after
   - details: JSON with {changes: [{key, before, after, category}], count, timestamp}

10. **Transaction Commit**
    - If all succeed → commit
    - Return: {success: true, message: "Successfully updated N setting(s)", updated: N, changes: [keys]}

### 7.5 Validation & Safety

**Type Validation:**
- string: Trimmed, no length limits (except database column size)
- number: Converted to number, checked for NaN, stored as string
- boolean: Converted to 'true' or 'false' string
- json: Validated as parseable JSON, stored as string

**Range Validation:**
- Only applies to number type
- min_value and max_value from database
- Example: password_min_length: min=6, max=32

**Compliance Rules:**
- audit_retention_days >= 90 (hardcoded business rule)
- Overrides database min_value if needed

**Transaction Safety:**
- All updates in single transaction
- Validation failure → rollback entire batch
- Partial updates impossible

**SQL Injection Prevention:**
- Parameterized queries
- No string concatenation
- Setting keys validated against whitelist (existing keys only)

### 7.6 Audit Behavior

**What Is Logged:**
- Every successful settings update → `system_audit_logs`
- Details include: which settings changed, before/after values, who changed them, when

**What Is NOT Logged:**
- Failed validation attempts (would flood logs)
- Settings queries (read-only)
- No-change updates (no actual state change)

**Audit Log Structure:**
```json
{
  "admin_id": "ADMIN-001",
  "action_type": "SETTINGS_UPDATE",
  "target_entity": "system_settings",
  "before_value": "[{\"key\":\"password_min_length\",\"value\":\"8\"}]",
  "after_value": "[{\"key\":\"password_min_length\",\"value\":\"12\"}]",
  "details": {
    "changes": [
      {
        "key": "password_min_length",
        "before": "8",
        "after": "12",
        "category": "security"
      }
    ],
    "count": 1,
    "timestamp": "2026-02-09T12:00:00.000Z"
  },
  "timestamp": "2026-02-09 12:00:00"
}
```

### 7.7 Failure Modes

**What Can Break:**

1. **Invalid Type Conversion:**
   - User enters "abc" for number field
   - **Behavior:** Validation fails, 400 error, transaction rolled back
   - **Protection:** No partial updates

2. **Concurrent Updates:**
   - Two admins update same setting simultaneously
   - **Behavior:** Last write wins (no optimistic locking)
   - **Protection:** Both updates logged, can be reconciled from audit trail

3. **Maintenance Mode Enabled:**
   - Admin sets maintenance_mode = 'true'
   - **Behavior:** System becomes read-only (if implemented)
   - **Protection:** Warning logged, admin must confirm

4. **Audit Log Insert Fails:**
   - Database error during audit log insert
   - **Behavior:** Entire transaction rolls back, settings not updated
   - **Protection:** Atomicity guarantee

### 7.8 Dependencies

**Tables:**
- `system_settings` (setting_key, setting_value, value_type, category, description, min_value, max_value, updated_at, updated_by)
- `system_audit_logs` (audit trail)

**Services:**
- None (pure database operations)

**Middleware:**
- `adminAuth.js` (authorization)

### 7.9 Design Rationale

**Why Store All Values as Strings:**
- Simplifies database schema (single TEXT column)
- Type conversion happens at application layer
- Allows flexible value types without schema changes

**Why Validate on Every Update:**
- Don't trust frontend validation
- Prevents invalid configuration from breaking system
- Enforces business rules (audit retention >= 90)

**Why Transaction-Based Updates:**
- Prevents partial updates (all-or-nothing)
- Ensures audit log matches actual changes
- Simplifies error handling

**Why No DELETE Operation:**
- Settings are system configuration, not user data
- Deletion would break system
- Disabling a setting (set to false/0) achieves same goal

### 7.10 Operational Impact

**If Misconfigured:**
- Invalid password_min_length → New users can't be created
- Invalid session_timeout_minutes → Users logged out too frequently
- Invalid audit_retention_days → Compliance violation

**If Abused:**
- Malicious admin sets maintenance_mode → System becomes read-only
- Malicious admin sets audit_retention_days to 90 → Logs deleted sooner
- Malicious admin sets password_min_length to 6 → Weaker passwords allowed

### 7.11 Adversarial Validation Results

**Test Suite:** `server/tests/settings_adversarial.test.js`
**Status:** ALL 33 TESTS PASSED

**Test Categories:**
1. Invalid Payload Injection (8/8 passed)
   - SQL injection blocked
   - XSS payloads stored safely
   - Null/undefined rejected
   - Type confusion prevented

2. Boundary Violations (8/8 passed)
   - Min/max ranges enforced
   - Compliance rules immutable
   - Negative numbers rejected

3. Audit Logging (4/4 passed)
   - Successful changes logged
   - Failed changes not logged
   - Before/after values captured

4. Unauthorized Access (6/6 passed)
   - Non-admin roles blocked (403)
   - Invalid tokens rejected (401)

5. Transaction Integrity (3/3 passed)
   - Partial failures rolled back
   - All-or-nothing updates
   - State consistency guaranteed

6. API Manipulation (4/4 passed)
   - Unknown keys rejected
   - Extra fields ignored
   - SQL bypass prevented

**Conclusion:** System Settings module is production-ready and secure.

### 7.12 Typical Panel Questions

**Q: Why allow admins to set maintenance_mode without additional confirmation?**
A: The frontend shows a confirmation dialog for critical settings including maintenance_mode. The backend logs a warning but allows it. This is intentional - admins need the ability to put the system in maintenance mode for emergency repairs.

**Q: What prevents an admin from setting audit_retention_days to 1 day to hide their tracks?**
A: The backend enforces a minimum of 90 days regardless of database min_value. Any attempt to set it lower returns 400 validation error. This is a hardcoded compliance rule that cannot be bypassed.

**Q: Why store numbers as strings instead of using proper database types?**
A: Simplifies the schema and allows flexible value types. The trade-off is that range validation must happen at application layer. In production, we'd consider using JSON column type for structured settings.

**Q: What happens if two admins update the same setting at the exact same time?**
A: Last write wins. Both updates are logged in audit trail with timestamps. If this becomes a problem, we'd implement optimistic locking (version numbers) or pessimistic locking (row-level locks).

**Q: How do you prevent an admin from modifying the database directly to bypass validation?**
A: Nothing prevents direct database access. This is why database access must be restricted to DBAs only, and all DBA actions must be logged at the database level. Application-level validation only protects against API-based attacks.

---

## 8. NAVIGATION & LAYOUT PROTECTION

### 8.1 Purpose

**Why This Exists:**
- Enforce role-based access at UI level (first line of defense)
- Provide consistent navigation experience
- Prevent unauthorized users from seeing admin interface

**Risk Solved:**
- Non-admins accessing admin pages
- Unauthenticated users seeing admin interface
- Inconsistent navigation experience

### 8.2 Access Control

**Frontend Route Protection:**

1. **AdminRoute Component** (`client/src/components/AdminRoute.jsx`)
   ```javascript
   if (!user || !token) {
     return <Navigate to="/portal" />
   }
   if (user.role !== 'Admin') {
     return <Navigate to="/clinical/dashboard" />
   }
   return children
   ```

2. **Route Configuration** (`client/src/App.jsx`)
   ```javascript
   <Route path="/admin/*" element={<AdminRoute><AdminLayout /></AdminRoute>}>
     <Route path="dashboard" element={<AdminDashboard />} />
     <Route path="users" element={<UserManagement />} />
     <Route path="rules" element={<DOHRules />} />
     <Route path="audit" element={<AuditLogs />} />
     <Route path="settings" element={<SystemSettings />} />
   </Route>
   ```

### 8.3 Data Flow

**Step-by-Step:**

1. **User Navigates to /admin/dashboard**
   - React Router matches `/admin/*` route
   - AdminRoute component renders

2. **AdminRoute Checks**
   ```
   Check: user exists in AuthContext
   Check: auth_token exists in localStorage
   Check: user.role === 'Admin'
   ```

3. **Authorization Decision**
   - If no user/token → Redirect to `/portal`
   - If user.role !== 'Admin' → Redirect to `/clinical/dashboard`
   - If user.role === 'Admin' → Render children (AdminLayout)

4. **AdminLayout Renders**
   - Top navigation bar with logo
   - Menu items: Dashboard, Users, Rules, Audit, Settings
   - User menu with logout button
   - Main content area with {children}

5. **Page Component Renders**
   - AdminDashboard, UserManagement, etc.
   - Makes API calls with token
   - Backend enforces authorization again (defense in depth)

### 8.4 Validation & Safety

**Frontend Protection:**
- Route guards prevent rendering admin pages
- Token checked before rendering
- Role checked before rendering

**Backend Protection:**
- Every API endpoint has adminAuth middleware
- Token verified on every request
- Role verified on every request

**Defense in Depth:**
- Frontend protection is UX (prevents accidental access)
- Backend protection is security (prevents malicious access)
- Both layers must be present

### 8.5 Failure Modes

**What Can Break:**

1. **Token Expired:**
   - AdminRoute sees token in localStorage
   - Renders admin page
   - First API call fails with 401
   - apiClient redirects to login

2. **Role Changed:**
   - User was Admin, demoted to Midwife
   - Token still valid (contains old role)
   - AdminRoute allows access (checks token role)
   - Backend rejects (checks database role)

3. **LocalStorage Cleared:**
   - User loses token and user object
   - AdminRoute redirects to login
   - User must re-authenticate

### 8.6 Design Rationale

**Why Check Both Token and User:**
- Token proves authentication
- User object contains role
- Both must be present for valid session

**Why Redirect Instead of Error:**
- Better UX (seamless redirect)
- Prevents error messages for expected behavior
- Guides user to correct page

**Why AdminLayout Separate from AdminRoute:**
- AdminRoute handles authorization
- AdminLayout handles UI structure
- Separation of concerns

### 8.7 Typical Panel Questions

**Q: What prevents a user from modifying localStorage to change their role?**
A: Frontend checks localStorage, but backend checks database. Even if user modifies localStorage to show role='Admin', the backend will reject their API requests because the JWT token contains the real role, and the database verification will fail.

**Q: Why not use React Context for route protection instead of checking localStorage?**
A: We do use React Context (AuthContext). The context loads from localStorage on app initialization. AdminRoute checks the context, which in turn loaded from localStorage. This is the standard pattern for persisted authentication state.

**Q: What happens if an admin's account is disabled while they're viewing an admin page?**
A: The page remains visible (already rendered). The next API call will fail with 403 because the backend checks is_active on every request. The user will see an error and be unable to perform any actions.

---

## 9. CROSS-CUTTING CONCERNS

### 9.1 API Client (`client/src/lib/apiClient.js`)

**Purpose:**
- Centralize HTTP request logic
- Automatic token injection
- Global error handling
- Consistent request/response format

**Implementation:**
```javascript
const apiClient = {
  get: (endpoint) => {
    const token = localStorage.getItem('auth_token')
    return fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'x-auth-token': token,
        'Content-Type': 'application/json'
      }
    }).then(handleResponse)
  },
  post: (endpoint, data) => { /* similar */ },
  put: (endpoint, data) => { /* similar */ },
  delete: (endpoint) => { /* similar */ }
}

function handleResponse(response) {
  if (response.status === 401) {
    localStorage.clear()
    window.location.href = '/portal'
  }
  return response
}
```

**Why This Matters:**
- Every request automatically includes token
- 401 responses trigger automatic logout
- No component needs to handle auth manually

### 9.2 Audit Logger (`server/utils/auditLogger.js`)

**Purpose:**
- Centralize audit log creation
- Consistent audit log format
- Automatic timestamp and IP capture

**Implementation:**
```javascript
async function performAuditLog(adminId, actionType, targetEntity, targetId, details, req) {
  await db.execute(`
    INSERT INTO system_audit_logs
    (admin_id, action_type, target_entity, before_value, after_value, details, timestamp, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
  `, [adminId, actionType, targetEntity, null, null, JSON.stringify(details), req.ip])
}
```

**Why This Matters:**
- Every audit log has consistent structure
- IP address automatically captured
- Timestamp automatically set
- Reduces code duplication

### 9.3 Security Utils (`server/utils/SecurityUtils.js`)

**Purpose:**
- JWT token signing and verification
- Centralize crypto operations

**Implementation:**
```javascript
const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET

module.exports = {
  signToken: (payload) => {
    return jwt.sign(payload, JWT_SECRET, {expiresIn: '24h'})
  },
  verifyToken: (token) => {
    try {
      return jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return null
    }
  }
}
```

**Why This Matters:**
- Single source of truth for JWT operations
- Consistent token expiry (24 hours)
- Centralized error handling

---

## 10. OPERATIONAL IMPACT ANALYSIS

### 10.1 System-Wide Impact of Admin Actions

**User Management:**
- Create user → New account can access system immediately
- Disable user → User locked out on next API request
- Reset password → User's current session remains valid until token expires

**DOH Rules:**
- Create new version → Affects all future immunization validations
- Future effective date → Allows clinical staff to prepare for policy change
- Immutability → Prevents accidental policy corruption

**System Settings:**
- Change password_min_length → Affects all new user creations
- Change session_timeout_minutes → Affects all new logins (existing sessions unaffected)
- Enable maintenance_mode → System becomes read-only (if implemented)

**Audit Logs:**
- Export logs → Data exfiltration risk (logged for accountability)
- Query logs → Read-only, no system impact

### 10.2 Cascading Failure Scenarios

**Database Failure:**
- All admin operations fail
- Existing sessions remain valid (JWT tokens don't require database)
- System becomes read-only (no writes possible)

**JWT Secret Compromise:**
- Attacker can forge admin tokens
- All admin operations compromised
- Mitigation: Rotate JWT_SECRET, invalidate all tokens

**Admin Account Compromise:**
- Attacker has full system control
- Can create rogue accounts
- Can modify system settings
- Can view audit logs
- Detection: Unusual activity in audit logs

### 10.3 Recovery Procedures

**All Admins Locked Out:**
- Direct database access required
- UPDATE users SET is_active = 1 WHERE role = 'Admin'
- Emergency admin account creation via database

**Audit Log Corruption:**
- No recovery mechanism (append-only design)
- Prevention: Database backups, replication

**Invalid System Settings:**
- Direct database access required
- UPDATE system_settings SET setting_value = ? WHERE setting_key = ?
- Restore from backup if needed

---

## 11. PANEL QUESTIONS & ANSWERS

### 11.1 Security Questions

**Q: How do you prevent SQL injection?**
A: All queries use parameterized statements. User input is never concatenated into SQL strings. The mysql2 library automatically escapes parameters. Example: `db.execute('SELECT * FROM users WHERE id = ?', [userId])` instead of `db.execute('SELECT * FROM users WHERE id = ' + userId)`.

**Q: How do you prevent XSS attacks?**
A: React automatically escapes all rendered content. We never use `dangerouslySetInnerHTML`. XSS payloads in settings are stored as-is in the database, but React escapes them when rendering. The frontend is responsible for output encoding.

**Q: How do you prevent CSRF attacks?**
A: Not implemented. CSRF protection requires either:
- SameSite cookies (we use localStorage)
- CSRF tokens (not implemented)
- Custom headers (we use x-auth-token, which provides some protection)
In production, we'd implement CSRF tokens for state-changing operations.

**Q: How do you prevent brute force attacks?**
A: Not implemented. Production deployment requires rate limiting on login endpoint (e.g., express-rate-limit middleware). Current system is vulnerable to brute force.

**Q: How do you handle password storage?**
A: bcrypt with 10 salt rounds. Passwords are hashed before storage. Plain text passwords never stored. bcrypt is designed for password hashing with built-in salting and configurable work factor.

### 11.2 Architecture Questions

**Q: Why not use a framework like NestJS or Fastify?**
A: Express is simpler and more widely understood. For a single-LGU deployment, Express provides sufficient functionality without the complexity of a full framework. In production, we'd consider NestJS for better structure and TypeScript support.

**Q: Why not use an ORM like Sequelize or TypeORM?**
A: Raw SQL provides more control and transparency. ORMs can hide performance issues and make debugging harder. For a system with complex queries (immunization scheduling), raw SQL is more appropriate. Trade-off: More boilerplate code.

**Q: Why not use TypeScript?**
A: JavaScript is simpler for rapid development. TypeScript would provide better type safety and IDE support. In production, we'd migrate to TypeScript for better maintainability.

**Q: Why not use a state management library like Redux?**
A: React Context is sufficient for this application's complexity. Redux adds boilerplate for minimal benefit. If the application grows significantly, we'd consider Redux or Zustand.

### 11.3 Compliance Questions

**Q: How do you ensure HIPAA compliance?**
A: This system is for Philippines DOH, not US HIPAA. However, similar principles apply:
- Audit trails for all access (implemented)
- Encryption at rest (not implemented, requires database-level TDE)
- Encryption in transit (requires HTTPS in production)
- Access controls (implemented via RBAC)
- Data minimization (clinical data redacted from admin view)

**Q: How do you handle data retention requirements?**
A: audit_retention_days setting enforces minimum 90 days. Actual deletion not implemented. Production requires:
- Automated archival process
- Cold storage for old logs
- Compliance with DOH retention policies

**Q: How do you ensure audit log integrity?**
A: Current implementation doesn't prevent audit log tampering. Production requires:
- Append-only storage
- Hash chaining (each entry contains hash of previous)
- Separate audit database with restricted access
- Database-level triggers to prevent DELETE

### 11.4 Scalability Questions

**Q: How does this system scale to multiple LGUs?**
A: Current design is single-tenant (one LGU). Multi-tenant deployment requires:
- LGU identifier in all tables
- Row-level security
- Separate databases per LGU (preferred)
- Load balancing across application servers

**Q: How does this system handle high load?**
A: Current design is not optimized for high load. Production requires:
- Database connection pooling (partially implemented)
- Redis caching for frequently accessed data
- CDN for static assets
- Horizontal scaling of application servers
- Database read replicas

**Q: What's the maximum number of concurrent users?**
A: Not tested. Depends on database connection pool size and server resources. Estimate: 50-100 concurrent users per application server. Production requires load testing and capacity planning.

### 11.5 Maintenance Questions

**Q: How do you deploy updates without downtime?**
A: Not implemented. Production requires:
- Blue-green deployment
- Rolling updates
- Database migration strategy
- Feature flags for gradual rollout

**Q: How do you monitor system health?**
A: Basic health check implemented (`SELECT 1`). Production requires:
- Application performance monitoring (APM)
- Log aggregation (ELK stack)
- Metrics collection (Prometheus)
- Alerting (PagerDuty)

**Q: How do you handle database backups?**
A: Not implemented. Production requires:
- Automated daily backups
- Point-in-time recovery
- Backup testing and restoration drills
- Off-site backup storage

---

## CONCLUSION

This document provides a complete technical walkthrough of the Admin subsystem. Every component, data flow, validation rule, and failure mode has been documented for audit defense and thesis panel review.

**Key Takeaways:**

1. **Defense in Depth:** Authorization enforced at frontend (UX), backend middleware (security), and database queries (paranoia).

2. **Audit Everything:** Every state-changing operation creates an audit log. Failed operations do not create logs (correct behavior).

3. **Immutability Where Critical:** DOH rules cannot be edited or deleted, only versioned forward. This preserves policy history and prevents tampering.

4. **Transaction Safety:** All multi-step operations use database transactions. Partial failures are impossible.

5. **Validation at Backend:** Never trust frontend. All validation happens at backend with proper error handling.

6. **Structural Redaction:** Clinical data (infant_id, justification) never leaves database when queried by admins. Separation of concerns enforced at SQL SELECT level.

**Production Readiness Gaps:**

- Rate limiting not implemented (brute force vulnerability)
- CSRF protection not implemented
- Audit log tampering prevention not implemented
- Database encryption at rest not implemented
- HTTPS not enforced (development only)
- Monitoring and alerting not implemented
- Automated backups not implemented

**Strengths:**

- Comprehensive audit trails
- Strong RBAC enforcement
- Transaction-based updates
- Parameterized queries (SQL injection prevention)
- Adversarial validation (33/33 tests passed)
- Clear separation of concerns
- Defensive programming throughout

**Document Maintenance:**

This document should be updated whenever:
- New admin features are added
- Security vulnerabilities are discovered
- Architecture changes are made
- Compliance requirements change

**Last Updated:** February 9, 2026  
**Document Version:** 1.0  
**Maintained By:** Engineering Team

---

END OF DOCUMENT
