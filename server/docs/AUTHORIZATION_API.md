# Authorization API Endpoints

This document describes the authorization endpoints for the Schedule Override Audit System.

## Base URL
All endpoints are prefixed with `/api/authorization`

## Authentication
All endpoints require clinical authentication (Midwife role).

## Endpoints

### 1. POST /api/authorization/request
Request clinical authorization for a vaccination schedule override.

**Request Body:**
```json
{
  "infant_id": "uuid",
  "vaccine_name": "string",
  "midwife_id": "uuid"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Authorization request created successfully",
  "authorization_request": {
    "requestId": "uuid",
    "infantId": "uuid",
    "vaccineId": "string",
    "midwifeId": "uuid",
    "overrideType": "OVERDUE|OUT_OF_WINDOW|BLOCKED_DOSE",
    "scheduleStatus": {
      "status": "string",
      "message": "string",
      "ageInDays": "number",
      "calculatedDate": "date",
      "currentDate": "date"
    },
    "infantInfo": {
      "name": "string",
      "dob": "date"
    },
    "midwifeInfo": {
      "name": "string"
    },
    "requestTimestamp": "date",
    "status": "PENDING"
  }
}
```

**Error Responses:**
- `400`: Missing required fields
- `403`: Unauthorized (invalid midwife role)
- `404`: Resource not found (infant or midwife)
- `500`: Internal server error

---

### 2. POST /api/authorization/process
Process a clinical authorization decision.

**Request Body:**
```json
{
  "requestId": "uuid",
  "infantId": "uuid",
  "vaccineId": "string",
  "midwifeId": "uuid",
  "clinicalJustification": "string (min 10 chars, max 1000 chars)",
  "overrideType": "OVERDUE|OUT_OF_WINDOW|BLOCKED_DOSE"
}
```

**Success Response (200 for approved, 403 for rejected):**
```json
{
  "success": true|false,
  "message": "Authorization approved successfully|Authorization rejected",
  "authorization_result": {
    "authorized": true|false,
    "authorizationId": "uuid|null",
    "complianceStatus": {
      "compliant": true|false,
      "violations": ["string"],
      "score": "number"
    },
    "auditTrailId": "uuid",
    "effectiveStatus": "LATE_BUT_APPROVED|REJECTED",
    "reason": "string",
    "timestamp": "date"
  }
}
```

**Error Responses:**
- `400`: Missing required fields (requestId or clinicalJustification)
- `500`: Internal server error

---

### 3. GET /api/authorization/history/:infantId
Get authorization history for a specific infant.

**URL Parameters:**
- `infantId`: UUID of the infant

**Success Response (200):**
```json
{
  "success": true,
  "infant_id": "uuid",
  "count": "number",
  "authorization_history": [
    {
      "auditId": "uuid",
      "infantId": "uuid",
      "vaccineName": "string",
      "midwifeId": "uuid",
      "actionType": "APPROVED|REJECTED",
      "clinicalJustification": "string",
      "overrideType": "OVERDUE|OUT_OF_WINDOW|BLOCKED_DOSE",
      "complianceStatus": {
        "compliant": true|false,
        "violations": ["string"],
        "score": "number"
      },
      "sessionMetadata": {},
      "createdAt": "date",
      "immutable": true
    }
  ]
}
```

**Error Responses:**
- `500`: Internal server error

---

### 4. GET /api/authorization/validate/:infantId/:vaccineName
Pre-validate if an authorization request would be compliant with DOH guidelines.

**URL Parameters:**
- `infantId`: UUID of the infant
- `vaccineName`: Name of the vaccine (URL encoded if contains spaces)

**Success Response (200):**
```json
{
  "success": true,
  "infant_id": "uuid",
  "vaccine_name": "string",
  "compliant": true|false,
  "compliance_score": "number",
  "violations": ["string"],
  "warnings": ["string"]
}
```

**Error Responses:**
- `500`: Internal server error

---

## Usage Examples

### Example 1: Request Authorization
```javascript
const response = await fetch('/api/authorization/request', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': 'midwife-uuid'
  },
  body: JSON.stringify({
    infant_id: 'infant-uuid',
    vaccine_name: 'BCG',
    midwife_id: 'midwife-uuid'
  })
});

const data = await response.json();
console.log(data.authorization_request);
```

### Example 2: Process Authorization
```javascript
const response = await fetch('/api/authorization/process', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': 'midwife-uuid'
  },
  body: JSON.stringify({
    requestId: 'request-uuid',
    infantId: 'infant-uuid',
    vaccineId: 'BCG',
    midwifeId: 'midwife-uuid',
    clinicalJustification: 'Patient has medical necessity for delayed vaccination schedule due to recent illness',
    overrideType: 'OVERDUE'
  })
});

const data = await response.json();
if (data.success) {
  console.log('Authorization approved:', data.authorization_result);
} else {
  console.log('Authorization rejected:', data.authorization_result.reason);
}
```

### Example 3: Get Authorization History
```javascript
const response = await fetch('/api/authorization/history/infant-uuid', {
  headers: {
    'x-user-id': 'midwife-uuid'
  }
});

const data = await response.json();
console.log(`Found ${data.count} authorization records`);
data.authorization_history.forEach(record => {
  console.log(`${record.vaccineName}: ${record.actionType} - ${record.clinicalJustification}`);
});
```

### Example 4: Pre-validate Authorization
```javascript
const response = await fetch('/api/authorization/validate/infant-uuid/BCG', {
  headers: {
    'x-user-id': 'midwife-uuid'
  }
});

const data = await response.json();
if (data.compliant) {
  console.log('Authorization would be approved');
} else {
  console.log('Authorization would be rejected:', data.violations);
}
```

---

## Integration with AuthorizationController

All endpoints integrate with the `AuthorizationController` service which handles:
- Request validation
- Clinical justification validation
- DOH compliance checking
- Audit trail logging
- Authorization decision processing

The controller ensures that:
1. All authorization requests have valid midwife credentials
2. Clinical justifications meet minimum quality standards
3. DOH compliance rules are enforced (minimum intervals, catch-up protocols)
4. Complete audit trails are maintained for all authorization activities
5. NIP Schedule Engine authority is preserved (dates are never modified)

---

## Error Handling

All endpoints follow consistent error handling patterns:
- Validation errors return 400 with details
- Authentication/authorization errors return 403
- Resource not found errors return 404
- Server errors return 500 with error details

Error responses include:
```json
{
  "error": "Error type",
  "details": "Detailed error message"
}
```

---

## Security Considerations

1. **Authentication**: All endpoints require clinical authentication middleware
2. **Authorization**: Only midwives can access these endpoints
3. **Audit Trail**: All authorization activities are logged immutably
4. **Session Tracking**: User session metadata is captured for security auditing
5. **Input Validation**: All inputs are validated before processing

---

## Testing

Comprehensive unit tests are available in `server/tests/authorization_routes.test.js`:
- 17 test cases covering all endpoints
- Success and error scenarios
- Input validation
- Error handling
- Mock-based testing for isolation

Run tests with:
```bash
npm test -- authorization_routes.test.js
```
