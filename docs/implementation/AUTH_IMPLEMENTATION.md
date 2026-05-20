# Production-Grade Authentication Pipeline Implementation

## Overview
This document explains the centralized authentication system implemented to resolve systemic 401 Unauthorized errors across all Admin pages.

## Problem Statement
The frontend was not properly storing or sending authentication tokens, causing 401 errors on:
- `/api/admin/dashboard/stats`
- `/api/admin/users`
- `/api/admin/audit/system`
- `/api/rules/admin/view`

## Backend Expectation
The `adminAuth` middleware expects:
```
Header: x-auth-token
Value: <JWT token>
```

## Solution Architecture

### 1. Token Storage (localStorage)
**Location**: `localStorage`
- `auth_token` - JWT authentication token
- `user` - JSON stringified user object

**Why localStorage over sessionStorage?**
- Persists across browser tabs
- Survives page refreshes
- Better UX for admin workflows

### 2. Centralized API Client
**File**: `client/src/lib/apiClient.js`

**Features**:
- Automatic token injection on every request
- Centralized error handling
- Global 401 redirect logic
- RESTful methods (GET, POST, PUT, DELETE, PATCH)

**How it works**:
```javascript
// Automatically reads token from localStorage
const token = localStorage.getItem('auth_token');

// Attaches to every request
headers['x-auth-token'] = token;

// Handles 401 globally
if (response.status === 401) {
    localStorage.clear();
    window.location.href = '/portal';
}
```

### 3. Updated AuthContext
**File**: `client/src/contexts/AuthContext.jsx`

**Changes**:
- Switched from `sessionStorage` to `localStorage`
- Simplified key names (`auth_token`, `user`)
- Added error handling for corrupted data
- Provides `login()`, `logout()`, and `user` state

### 4. Enhanced Route Guards
**File**: `client/src/components/AdminRoute.jsx`

**Security checks**:
1. User object exists in context
2. Token exists in localStorage
3. User role is 'Admin'

If any check fails → redirect to `/portal`

### 5. Refactored Admin Pages
All admin pages now use `apiClient` instead of manual `fetch()`:

#### Before:
```javascript
const response = await fetch('/api/admin/users', {
    headers: { 'x-auth-token': user.authToken }
});
```

#### After:
```javascript
const response = await apiClient.get('/admin/users');
```

**Refactored files**:
- `AdminDashboard.jsx`
- `UserManagement.jsx`
- `DOHRules.jsx`
- `SystemSettings.jsx`
- `AuditLogs.jsx`

## Token Flow Diagram

```
┌─────────────┐
│ User Login  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ POST /api/auth/login    │
│ Returns: { authToken }  │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ AuthContext.login()     │
│ Saves to localStorage:  │
│ - auth_token            │
│ - user                  │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Navigate to dashboard   │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ AdminRoute checks:      │
│ 1. User exists?         │
│ 2. Token exists?        │
│ 3. Role === 'Admin'?    │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Component loads         │
│ Calls apiClient.get()   │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ apiClient reads token   │
│ from localStorage       │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Attaches header:        │
│ x-auth-token: <token>   │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Backend validates       │
│ via adminAuth           │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Success: Data returned  │
│ 401: Auto logout        │
└─────────────────────────┘
```

## Where Token is Attached

The token is automatically attached in **one place only**:

**File**: `client/src/lib/apiClient.js`
**Method**: `request()`
**Line**: ~50

```javascript
async request(endpoint, options = {}) {
    const token = this.getToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // TOKEN ATTACHED HERE
    if (token) {
        headers['x-auth-token'] = token;
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });
    
    // 401 HANDLED HERE
    if (response.status === 401) {
        this.handleUnauthorized();
        throw new Error('Unauthorized - redirecting to login');
    }
}
```

## Security Features

### 1. Automatic Logout on 401
If the backend returns 401 (expired/invalid token):
- Clear localStorage
- Redirect to login
- Prevent further requests

### 2. Defense in Depth
- Route guards check token existence
- Backend validates token cryptographically
- Role verification on both client and server

### 3. No Token Exposure
- Token never logged to console
- Not exposed in component props
- Centralized in one secure location

## Testing Checklist

### Manual Testing
1. ✅ Login as Admin → token saved to localStorage
2. ✅ Navigate to Admin Dashboard → loads without 401
3. ✅ Navigate to User Management → loads without 401
4. ✅ Navigate to DOH Rules → loads without 401
5. ✅ Navigate to Audit Logs → loads without 401
6. ✅ Navigate to System Settings → loads without 401
7. ✅ Delete token from localStorage → auto redirect to login
8. ✅ Modify token in localStorage → 401 → auto logout

### DevTools Network Tab
Every admin API request should show:
```
Request Headers:
x-auth-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

## Migration Notes

### What Changed
- ❌ Removed: Manual `fetch()` calls with headers
- ❌ Removed: `user.authToken` references
- ✅ Added: `apiClient` import
- ✅ Added: Centralized token management
- ✅ Changed: `sessionStorage` → `localStorage`

### What Stayed the Same
- Backend RBAC (unchanged)
- Middleware logic (unchanged)
- Route structure (unchanged)
- User roles (unchanged)

## Success Criteria

✅ Dashboard loads without 401
✅ Users page loads without 401
✅ DOH page loads without 401
✅ Audit page loads without 401
✅ Settings page loads without 401
✅ Token deleted → automatic logout
✅ Invalid token → automatic logout
✅ Network tab shows `x-auth-token` header

## Future Enhancements

1. **Token Refresh**: Implement automatic token renewal before expiry
2. **Request Queuing**: Queue requests during token refresh
3. **Retry Logic**: Retry failed requests once after token refresh
4. **Token Expiry Warning**: Warn user before session expires
5. **Activity Tracking**: Auto-logout after inactivity period

## Troubleshooting

### Issue: Still getting 401 errors
**Check**:
1. Is token in localStorage? (DevTools → Application → Local Storage)
2. Is token being sent? (DevTools → Network → Request Headers)
3. Is token valid? (Check backend logs)

### Issue: Redirect loop
**Check**:
1. Is login saving token correctly?
2. Is AdminRoute checking token?
3. Is apiClient reading token?

### Issue: Token not persisting
**Check**:
1. Browser privacy settings
2. localStorage quota
3. Third-party cookie blocking

## Files Modified

### Created
- `client/src/lib/apiClient.js` (NEW)

### Modified
- `client/src/contexts/AuthContext.jsx`
- `client/src/components/AdminRoute.jsx`
- `client/src/pages/admin/AdminDashboard.jsx`
- `client/src/pages/admin/UserManagement.jsx`
- `client/src/pages/admin/DOHRules.jsx`
- `client/src/pages/admin/SystemSettings.jsx`
- `client/src/pages/admin/AuditLogs.jsx`

## Conclusion

The authentication pipeline is now production-grade with:
- ✅ Centralized token management
- ✅ Automatic header injection
- ✅ Global error handling
- ✅ Secure storage
- ✅ Clean component code
- ✅ No security compromises

All admin pages now load successfully without 401 errors while maintaining strict RBAC enforcement.
