# Midwife Dashboard Hardening - Quick Start Guide

## 🎯 Mission
Transform the Midwife Dashboard into a production-grade clinical command center with zero crashes, complete audit trails, and strict governance enforcement.

## 📋 Specification Location
- **Requirements**: `.kiro/specs/midwife-dashboard-hardening/requirements.md`
- **Design**: `.kiro/specs/midwife-dashboard-hardening/design.md`
- **Tasks**: `.kiro/specs/midwife-dashboard-hardening/tasks.md`
- **Summary**: `MIDWIFE_DASHBOARD_HARDENING_SPEC.md`

## 🚨 Critical Non-Negotiables

### 1. Justification Modal MUST BE UNBYPASSABLE
```jsx
// ❌ WRONG - Can be bypassed
<Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>

// ✅ CORRECT - Cannot be bypassed
<Modal 
  isOpen={isOpen} 
  onClose={null}  // Disable outside click
  closeOnEscape={false}  // Disable escape key
>
```

### 2. Every Clinical Action MUST Create Audit Entry
```javascript
// ❌ WRONG - No audit
await updateInfantStatus(infantId, 'approved');

// ✅ CORRECT - With audit and rollback
const connection = await db.getConnection();
try {
  await connection.beginTransaction();
  await updateInfantStatus(infantId, 'approved', connection);
  await createAuditLog(auditData, connection);
  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
}
```

### 3. All Data Access MUST Be Defensive
```javascript
// ❌ WRONG - Will crash on null
const name = infant.first_name;
const vaccines = data.vaccines.map(v => v.name);

// ✅ CORRECT - Defensive
const name = infant?.first_name || "Unknown";
const vaccines = (data?.vaccines || []).map(v => v?.name || "Unknown");
```

### 4. Role Boundaries MUST Be Enforced
```javascript
// ❌ WRONG - Client-side only
if (user.role === 'Midwife') {
  showClinicalDashboard();
}

// ✅ CORRECT - Server-side verification
router.use(clinicalAuth);  // Middleware blocks admins
```

### 5. No Optimistic UI Updates
```javascript
// ❌ WRONG - Updates UI before server confirms
setInfants(prev => prev.filter(i => i.id !== infantId));
await approveInfant(infantId);

// ✅ CORRECT - Wait for server confirmation
const result = await approveInfant(infantId);
if (result.success) {
  setInfants(prev => prev.filter(i => i.id !== infantId));
}
```

## 🏗️ Implementation Order

### Phase 1: Backend (Week 1)
1. Create `server/routes/clinical.js`
2. Implement 10 API endpoints (see design doc)
3. Add transaction safety to all actions
4. Add audit logging to all actions
5. Create database triggers for immutability

### Phase 2: Frontend (Weeks 2-3)
1. Create `ClinicalDashboard.jsx` with error boundaries
2. Build Clinical Overview section
3. Build Infants Queue section
4. Build Pending Authorizations section
5. **Build Justification Modal (CRITICAL)**
6. Build Defer Reason Modal
7. Build Recent Actions section
8. Build Quick Stats section

### Phase 3: Integration (Week 4)
1. Connect all components to APIs
2. Add error handling for all HTTP codes
3. Verify audit trail creation
4. Verify role-based access control
5. Test crash scenarios

### Phase 4: Testing (Week 5)
1. Write unit tests (80% coverage)
2. Write integration tests
3. **Write property-based tests (5 properties)**
4. Write end-to-end tests

### Phase 5: Hardening (Week 6)
1. Performance optimization
2. Security audit
3. Accessibility compliance
4. Load testing

### Phase 6: Deployment (Week 7)
1. Documentation
2. Deployment preparation
3. Production deployment
4. Post-deployment verification

## 🧪 Property-Based Tests (MUST IMPLEMENT)

### Test 1: Audit Completeness
```javascript
forAll(clinicalDecision, async (decision) => {
  const beforeCount = await getAuditCount(decision.infant_id);
  await processClinicalDecision(decision);
  const afterCount = await getAuditCount(decision.infant_id);
  return afterCount === beforeCount + 1;
});
```

### Test 2: Override Justification
```javascript
forAll(overrideRequest, async (request) => {
  if (request.action === 'OVERRIDE') {
    const result = await processAuthorization(request);
    if (result.success) {
      const audit = await getAuditEntry(result.audit_id);
      return audit.clinical_justification?.length >= 10;
    }
  }
  return true;
});
```

### Test 3: Audit Immutability
```javascript
forAll(auditEntry, async (entry) => {
  const created = await createAuditEntry(entry);
  const updateAttempt = await attemptUpdate(created.audit_id);
  const deleteAttempt = await attemptDelete(created.audit_id);
  return updateAttempt.error && deleteAttempt.error;
});
```

### Test 4: Role Enforcement
```javascript
forAll(user, endpoint, async (user, endpoint) => {
  if (user.role === 'Admin' && endpoint.type === 'clinical') {
    const response = await callEndpoint(endpoint, user.token);
    return response.status === 403;
  }
  return true;
});
```

### Test 5: Transaction Atomicity
```javascript
forAll(clinicalAction, async (action) => {
  mockAuditFailure();
  const result = await processClinicalDecision(action);
  const actionExists = await checkActionApplied(action.infant_id);
  return !result.success && !actionExists;
});
```

## 🔒 Security Checklist

- [ ] All API calls include `x-auth-token` header
- [ ] All API calls include `x-user-id` header
- [ ] Token validation on every request
- [ ] Role verification on every request
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS protection (sanitize input)
- [ ] CSRF protection (token validation)
- [ ] Rate limiting (100 req/min per user)
- [ ] Session timeout (60 minutes)
- [ ] Audit logs immutable (database triggers)

## 🛡️ Defensive Programming Checklist

- [ ] Optional chaining for all object access (`data?.field`)
- [ ] Nullish coalescing for defaults (`value ?? 0`)
- [ ] Array safety (`(arr || []).map()`)
- [ ] Error boundaries around components
- [ ] Try-catch around all async operations
- [ ] Fallback values for all data
- [ ] Loading states for all async operations
- [ ] Empty states for zero data
- [ ] Error states for failures
- [ ] Timeout handling for slow requests

## 📊 API Endpoints Quick Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/clinical/dashboard/overview` | Daily clinical overview |
| GET | `/api/clinical/infants/queue` | Assigned infants (paginated) |
| GET | `/api/clinical/authorizations/pending` | Pending authorizations |
| POST | `/api/clinical/authorizations/approve` | Approve vaccination |
| POST | `/api/clinical/authorizations/override` | Override with justification |
| POST | `/api/clinical/authorizations/defer` | Defer with reason |
| GET | `/api/clinical/actions/recent` | Recent clinical actions |
| GET | `/api/clinical/stats` | Quick statistics |

## 🎨 UI Component Hierarchy

```
ClinicalDashboard
├── ErrorBoundary
├── ClinicalOverview
│   ├── DueTodayCard
│   ├── OverdueCard
│   ├── PendingValidationsCard
│   └── AlertsCard
├── InfantsQueue
│   ├── SearchBar
│   ├── InfantsTable
│   └── Pagination
├── PendingAuthorizations
│   ├── AuthorizationCard
│   ├── JustificationModal (CRITICAL)
│   └── DeferReasonModal
├── RecentActions
│   └── ActionsList
└── QuickStats
    └── StatsGrid
```

## 🚀 Quick Commands

### Run Backend Tests
```bash
cd server
npm test
```

### Run Property-Based Tests
```bash
cd server
npm test -- --grep "Property:"
```

### Run Frontend Tests
```bash
cd client
npm test
```

### Start Development Server
```bash
# Backend
cd server
npm run dev

# Frontend
cd client
npm run dev
```

### Check Test Coverage
```bash
cd server
npm run test:coverage
```

## 📝 Code Review Checklist

### Before Submitting PR
- [ ] All tests passing (unit, integration, property-based, e2e)
- [ ] Test coverage >= 80%
- [ ] No console errors or warnings
- [ ] Defensive programming throughout
- [ ] Error boundaries in place
- [ ] Audit logging verified
- [ ] Role-based access control tested
- [ ] No bypass mechanisms
- [ ] No optimistic UI updates
- [ ] Documentation updated

### Reviewer Checklist
- [ ] Justification modal cannot be bypassed
- [ ] All clinical actions create audit entries
- [ ] Audit failure causes rollback
- [ ] Defensive rendering for all data states
- [ ] Error handling for all API calls
- [ ] Role boundaries enforced
- [ ] No hidden shortcuts or dev bypasses
- [ ] Property-based tests implemented
- [ ] Security best practices followed

## 🆘 Common Pitfalls to Avoid

### ❌ DON'T
- Allow justification modal to be closed without input
- Update UI before server confirms action
- Access data without null checks
- Skip audit logging for any clinical action
- Allow admins to access clinical endpoints
- Use optimistic UI updates
- Ignore error responses
- Skip transaction rollback on failure
- Hard-code role checks in UI only
- Skip property-based tests

### ✅ DO
- Enforce justification modal (no bypass)
- Wait for server confirmation before UI update
- Use defensive programming everywhere
- Create audit entry for every action
- Enforce role boundaries on server
- Use pessimistic UI updates
- Handle all error scenarios
- Implement transaction safety
- Verify roles on every API request
- Implement all 5 property-based tests

## 📞 Support

### Questions?
- Review specification documents in `.kiro/specs/midwife-dashboard-hardening/`
- Check design document for technical details
- Check tasks document for implementation steps

### Issues?
- Check error logs in browser console
- Check server logs in `server/server.log`
- Verify API responses in Network tab
- Run property-based tests to verify correctness

---

**Remember**: This is a production-grade clinical system. Patient safety depends on correct implementation. No shortcuts, no bypasses, no exceptions.

**Status**: Ready for Implementation  
**Estimated Timeline**: 7 weeks  
**Critical Path**: Justification Modal, Audit Trail, Property-Based Tests
