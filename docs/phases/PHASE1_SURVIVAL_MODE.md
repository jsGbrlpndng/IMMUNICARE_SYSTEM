# PHASE-1 SURVIVAL MODE
## Minimum Viable Safety - 3 Weeks to Safe Production

**Goal:** Deploy core clinical decision functionality with complete safety guarantees  
**Timeline:** 3 weeks  
**Tasks:** 30 critical tasks  
**Tests:** 8 critical tests (must pass 100%)

---

## Week 1: Backend Safety Layer (10 tasks)

### Database Foundation
```sql
-- Task 1: Create authorization_audit table (if not exists)
CREATE TABLE authorization_audit (
  audit_id VARCHAR(36) PRIMARY KEY,
  infant_id VARCHAR(50) NOT NULL,
  vaccine_name VARCHAR(100) NOT NULL,
  midwife_id VARCHAR(50) NOT NULL,
  action_type ENUM('APPROVED', 'DEFERRED', 'OVERRIDE') NOT NULL,
  clinical_justification VARCHAR(1000),
  override_type VARCHAR(50),
  compliance_status JSON,
  session_metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_immutable BOOLEAN DEFAULT TRUE
);

-- Task 2: Trigger - Prevent audit UPDATE
CREATE TRIGGER prevent_audit_update
BEFORE UPDATE ON authorization_audit
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Audit logs are immutable';
END;

-- Task 3: Trigger - Prevent audit DELETE
CREATE TRIGGER prevent_audit_delete
BEFORE DELETE ON authorization_audit
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Audit logs cannot be deleted';
END;
```

### API Endpoints
```javascript
// Task 4: POST /api/clinical/authorizations/approve
router.post('/authorizations/approve', clinicalAuth, async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    // Update infant status
    await connection.execute(
      'UPDATE infants SET registration_status = ? WHERE id = ?',
      ['Approved', req.body.infant_id]
    );
    
    // Create audit entry
    await connection.execute(
      'INSERT INTO authorization_audit (...) VALUES (...)',
      [auditData]
    );
    
    await connection.commit();
    res.json({ success: true, audit_id: auditData.audit_id });
    
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
});

// Task 5: POST /api/clinical/authorizations/override
router.post('/authorizations/override', clinicalAuth, async (req, res) => {
  const { clinical_justification } = req.body;
  
  // Validate justification
  if (!clinical_justification || clinical_justification.length < 10) {
    return res.status(400).json({ 
      success: false, 
      error: 'Justification must be at least 10 characters' 
    });
  }
  
  // Same transaction pattern as approve
  // ...
});

// Task 6: POST /api/clinical/authorizations/defer
router.post('/authorizations/defer', clinicalAuth, async (req, res) => {
  const { defer_reason } = req.body;
  
  // Validate reason
  const validReasons = ['FEVER', 'ILLNESS', 'CONTRAINDICATION', 'CAREGIVER_REQUEST', 'SUPPLY_ISSUE', 'OTHER'];
  if (!validReasons.includes(defer_reason)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid defer reason' 
    });
  }
  
  // Same transaction pattern
  // ...
});

// Task 7: GET /api/clinical/authorizations/pending
router.get('/authorizations/pending', clinicalAuth, async (req, res) => {
  const [authorizations] = await db.execute(`
    SELECT * FROM infants 
    WHERE registration_status = 'Pending'
    ORDER BY created_at ASC
  `);
  
  res.json({ success: true, authorizations: authorizations || [] });
});
```

---

## Week 2: Frontend Core (12 tasks)

### Justification Modal (CRITICAL)
```jsx
// Task 8-14: JustificationModal.jsx
const JustificationModal = ({ isOpen, onClose, onSubmit, infantName, vaccine }) => {
  const [justification, setJustification] = useState('');
  const isValid = justification.trim().length >= 10 && justification.length <= 1000;
  
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={null}  // Task 9: Disable outside click
      closeOnEscape={false}  // Task 10: Disable escape key
    >
      <ModalHeader>
        <AlertTriangle />
        <Title>Clinical Justification Required</Title>
      </ModalHeader>
      
      <ModalBody>
        <InfoBox>
          <p><strong>Infant:</strong> {infantName}</p>
          <p><strong>Vaccine:</strong> {vaccine}</p>
        </InfoBox>
        
        <Label>Clinical Justification *</Label>
        <Textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Provide detailed clinical reasoning..."
          rows={6}
          maxLength={1000}
        />
        
        {/* Task 11: Character count */}
        <CharacterCount>
          {justification.length} / 1000 characters
          {justification.length < 10 && (
            <span className="text-red-500"> (minimum 10 required)</span>
          )}
        </CharacterCount>
      </ModalBody>
      
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button 
          variant="primary" 
          onClick={() => onSubmit(justification)}
          disabled={!isValid}  // Task 12: Disable until valid
        >
          Submit Override
        </Button>
      </ModalFooter>
    </Modal>
  );
};
```

### Pessimistic UI Updates
```jsx
// Task 15-17: handleApprove with pessimistic update
const handleApprove = async (authorization) => {
  setProcessing(authorization.request_id);
  
  try {
    // Task 15: Call API first
    const response = await apiClient.post('/clinical/authorizations/approve', {
      infant_id: authorization.infant_id,
      vaccine: authorization.vaccine,
      midwife_id: user.id
    });
    
    const data = await response.json();
    
    // Task 16: Verify success
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Approval failed');
    }
    
    // Task 17: Update UI ONLY after server confirms
    setPendingAuthorizations(prev => 
      prev.filter(a => a.request_id !== authorization.request_id)
    );
    
    showSuccessMessage('Vaccination approved successfully');
    
  } catch (error) {
    // Task 18: Error handling - UI unchanged
    showErrorMessage(error.message || 'Approval failed');
  } finally {
    setProcessing(null);
  }
};
```

---

## Week 3: Verification (8 tasks)

### Property-Based Tests
```javascript
// Task 19: Audit completeness
test('Property: Every clinical decision has audit entry', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        infant_id: fc.string(),
        vaccine: fc.string(),
        midwife_id: fc.string(),
        action: fc.constantFrom('APPROVED', 'DEFERRED', 'OVERRIDE')
      }),
      async (decision) => {
        const beforeCount = await getAuditCount(decision.infant_id);
        await processClinicalDecision(decision);
        const afterCount = await getAuditCount(decision.infant_id);
        return afterCount === beforeCount + 1;
      }
    ),
    { numRuns: 100 }
  );
});

// Task 20: Override justification mandatory
test('Property: All overrides have justification >= 10 chars', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        infant_id: fc.string(),
        vaccine: fc.string(),
        midwife_id: fc.string(),
        action: fc.constant('OVERRIDE'),
        justification: fc.string()
      }),
      async (override) => {
        const result = await processOverride(override);
        if (result.success) {
          const audit = await getAuditEntry(result.audit_id);
          return audit.clinical_justification.length >= 10;
        }
        return true; // Rejected overrides are OK
      }
    ),
    { numRuns: 100 }
  );
});

// Task 21: Transaction atomicity
test('Property: Audit failure causes action rollback', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        infant_id: fc.string(),
        vaccine: fc.string(),
        midwife_id: fc.string()
      }),
      async (decision) => {
        // Simulate audit failure
        mockAuditFailure();
        
        const result = await processClinicalDecision(decision);
        const actionApplied = await checkActionApplied(decision.infant_id);
        
        // If audit failed, action should NOT be applied
        return !result.success && !actionApplied;
      }
    ),
    { numRuns: 100 }
  );
});
```

### Integration Tests
```javascript
// Task 22: Complete approve flow
test('Integration: Approve flow creates audit entry', async () => {
  const authorization = {
    infant_id: 'INF-TEST-001',
    vaccine: 'BCG',
    midwife_id: 'MW-001'
  };
  
  const response = await request(app)
    .post('/api/clinical/authorizations/approve')
    .set('x-auth-token', validToken)
    .set('x-user-id', 'MW-001')
    .send(authorization);
  
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  expect(response.body.audit_id).toBeDefined();
  
  // Verify audit entry exists
  const [audit] = await db.execute(
    'SELECT * FROM authorization_audit WHERE audit_id = ?',
    [response.body.audit_id]
  );
  
  expect(audit.length).toBe(1);
  expect(audit[0].action_type).toBe('APPROVED');
  expect(audit[0].infant_id).toBe('INF-TEST-001');
});

// Task 23: Override flow with justification
// Task 24: Defer flow with reason
// Task 25: Rollback on audit failure
// Task 26: End-to-end clinical decision
```

---

## Success Criteria (Must Pass 100%)

```bash
npm test -- --grep "CRITICAL"

Expected Output:
✓ Property: Audit completeness (100 iterations)
✓ Property: Override justification mandatory (100 iterations)
✓ Property: Transaction atomicity (100 iterations)
✓ Integration: Approve flow with audit
✓ Integration: Override flow with justification
✓ Integration: Defer flow with reason
✓ Integration: Rollback on audit failure
✓ E2E: Complete clinical decision workflow

8 passing (2.5s)
0 failing

✅ READY FOR PRODUCTION
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] All 30 tasks completed
- [ ] All 8 tests passing (100%)
- [ ] Database triggers deployed
- [ ] Justification modal tested (cannot bypass)
- [ ] Transaction rollback tested

### Deployment
- [ ] Deploy database migrations
- [ ] Deploy backend code
- [ ] Deploy frontend code
- [ ] Verify API endpoints
- [ ] Verify audit logging

### Post-Deployment
- [ ] Monitor error rates (target: 0%)
- [ ] Monitor audit creation (target: 100%)
- [ ] Monitor override justifications (target: 100% >= 10 chars)
- [ ] Monitor transaction failures (target: 0 partial successes)

---

## What's NOT in Phase-1 (Can Wait)

- Clinical overview dashboard
- Infants queue with search/sort
- Recent actions display
- Quick statistics
- Performance optimization
- Advanced monitoring
- Accessibility enhancements
- Mobile responsive design

**Rationale:** Phase-1 = Safety. Phase-2 = Usability.

---

**Status:** ✅ READY TO BEGIN  
**Timeline:** 3 weeks  
**Risk:** LOW (focused scope, comprehensive testing)  
**Next Action:** Start Week 1 - Backend Safety Layer
