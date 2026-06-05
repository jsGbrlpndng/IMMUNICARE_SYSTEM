const ACTION_LABELS = {
    AUTH_LOGIN_SUCCESS: 'Logged In',
    AUTH_LOGIN_FAILED: 'Failed Login Attempt',
    AUTH_PASSWORD_UPDATE_REQUIRED: 'Password Update Required',
    AUTH_PASSWORD_CHANGE_FAILED: 'Failed Password Change',
    AUTH_PASSWORD_CHANGED: 'Changed Password',
    AUTH_REAUTH_SUCCESS: 'Unlocked Session',
    AUTH_REAUTH_FAILED: 'Failed Session Unlock',
    AUTH_LOGOUT: 'Logged Out',
    SESSION_IDLE_LOCKED: 'Session Locked Due to Inactivity',
    CREATE_INFANT: 'Registered Infant',
    INFANT_REGISTERED: 'Registered Infant',
    INFANT_ARCHIVED_FROM_FOLLOW_UP: 'Archived Infant Follow-up',
    VACCINATION_CREATE: 'Recorded Vaccine Dose',
    VACCINATION_UPDATE: 'Updated Vaccine Dose',
    FOLLOW_UP_CREATE: 'Created Follow-up Task',
    FOLLOW_UP_AUTO_GENERATE: 'Created Follow-up Tasks',
    FOLLOW_UP_ACKNOWLEDGE: 'Acknowledged Follow-up Task',
    FOLLOW_UP_COMPLETE: 'Completed Follow-up Task',
    FOLLOW_UP_CONFIRM: 'Confirmed Follow-up Task',
    FOLLOW_UP_VISIT_LOGGED: 'Logged Follow-up Visit',
    USER_CREATE: 'Created Staff Account',
    USER_CREATED: 'Created Staff Account',
    USER_STATUS_TOGGLE: 'Changed Staff Account Status',
    USER_PASSWORD_RESET: 'Reset Staff Password',
    USER_DELETE_BLOCKED_CLINICAL_RECORDS: 'Blocked Staff Account Deletion',
    USER_DELETE: 'Deleted Staff Account',
    SYSTEM_CONFIG_UPDATE: 'Updated System Settings',
    M1_TARGETS_BULK_UPDATE: 'Updated Annual Barangay Targets',
    AUDIT_EXPORT: 'Exported Audit Records'
};

const TARGET_LABELS = {
    auth: 'System Authentication',
    infants: 'Infant Record',
    vaccinations: 'Vaccination Record',
    infant_schedules: 'Vaccination Schedule',
    follow_up_logs: 'Follow-up Log',
    follow_up_tasks: 'Follow-up Assignment',
    users: 'Staff Account',
    m1_immunization_targets: 'Barangay Target Configuration',
    system_settings: 'System Settings',
    audit_logs: 'Audit Log Export',
    doh_compliance_rules: 'DOH Compliance Rule'
};

const ROLE_LABELS = {
    'Super Admin': 'Head Nurse',
    Admin: 'Barangay Midwife',
    Midwife: 'Midwife',
    Nurse: 'Nurse',
    BHW: 'BHW',
    Caregiver: 'Caregiver',
    Staff: 'Clinic Staff',
    Unknown: 'Clinic Staff'
};

const FIELD_LABELS = {
    actor_role: 'Staff Role',
    actor_name: 'Staff Name',
    assigned_barangay: 'Assigned Barangay',
    target_barangay: 'Barangay',
    barangay: 'Barangay',
    barangay_id: 'Barangay',
    infant_id: 'Infant Record',
    infant_name: 'Infant Name',
    name: 'Name',
    mother_name: "Mother's Name",
    contact_number: 'Contact Number',
    vaccine_code: 'Vaccine',
    antigen: 'Vaccine',
    dose_number: 'Dose Number',
    administered_date: 'Date Given',
    dob: 'Date of Birth',
    date_of_birth: 'Date of Birth',
    first_name: 'First Name',
    middle_name: 'Middle Name',
    last_name: 'Last Name',
    mothers_maiden_name: "Mother's Name",
    caregiver_name: 'Caregiver Name',
    caregiver_phone: 'Contact Number',
    sex: 'Sex',
    validation_status: 'Validation Status',
    status: 'Status',
    reason: 'Reason',
    attempts: 'Login Attempts',
    role: 'Staff Role',
    full_name: 'Staff Name',
    is_active: 'Account Status',
    ip_address: 'Device Address',
    user_agent: 'Device / Browser',
    row_count: 'Rows Exported',
    target_id: 'Record Reference',
    old_values: 'Before',
    new_values: 'After',
    before: 'Before',
    after: 'After'
};

const REASON_LABELS = {
    USER_NOT_FOUND: 'User ID was not found',
    CAREGIVER_PASSWORD_LOGIN_BLOCKED: 'Caregiver password login is not allowed',
    INVALID_ROLE: 'Unsupported staff role',
    USER_INACTIVE: 'Staff account is disabled',
    USER_LOCKED: 'Staff account is temporarily locked',
    LOCK_THRESHOLD_REACHED: 'Too many failed login attempts',
    INVALID_PASSWORD: 'Incorrect password',
    NO_BARANGAY_ASSIGNMENT: 'No active barangay assignment',
    INVALID_BARANGAY_SCOPE: 'Invalid barangay assignment',
    INVALID_CURRENT_PASSWORD: 'Incorrect current password'
};

const SYSTEM_FIELD_BLOCKLIST = new Set([
    'id',
    'created_at',
    'updated_at',
    'deleted_at',
    'archived_at',
    'password',
    'password_hash',
    'temporary_password',
    'token',
    'refresh_token',
    'access_token'
]);

const CREATION_IDENTIFIER_FIELDS = [
    'infant_name',
    'registration_data.infant_name',
    'name',
    'registration_data.name',
    'first_name',
    'registration_data.first_name',
    'last_name',
    'registration_data.last_name',
    'dob',
    'registration_data.dob',
    'date_of_birth',
    'registration_data.date_of_birth',
    'sex',
    'registration_data.sex',
    'mothers_maiden_name',
    'registration_data.mothers_maiden_name',
    'mother_name',
    'registration_data.mother_name',
    'caregiver_name',
    'registration_data.caregiver_name',
    'caregiver_phone',
    'registration_data.caregiver_phone',
    'contact_number',
    'registration_data.contact_number'
];

const titleCase = (value = '') => String(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const formatAuditAction = (value = '') => {
    const key = String(value || '').trim().toUpperCase();
    return ACTION_LABELS[key] || titleCase(key) || '-';
};

export const formatAuditRole = (value = '') => ROLE_LABELS[value] || titleCase(value) || 'Clinic Staff';

const leafKey = (key = '') => String(key).split('.').pop();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_SEARCH_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

const stringifyForSearch = (value) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const containsUuid = (value) => UUID_PATTERN.test(String(value || '').trim()) || UUID_SEARCH_PATTERN.test(stringifyForSearch(value));

export const formatAuditTarget = (targetEntityOrRow = {}, targetRecordId = undefined, targetName = undefined) => {
    const row = typeof targetEntityOrRow === 'object' && targetEntityOrRow !== null
        ? targetEntityOrRow
        : { target_entity: targetEntityOrRow, target_record_id: targetRecordId, target_name: targetName };
    const readableName = String(row.target_name || '').trim();
    if (readableName) return readableName;
    const entity = String(row.target_entity || '').trim();
    const label = TARGET_LABELS[entity] || titleCase(entity) || 'Clinical Record';
    if (!row.target_record_id || containsUuid(row.target_record_id)) return label;
    return `${label} (${row.target_record_id})`;
};

export const formatAuditScope = (row = {}) => {
    if (row.barangay_name) return `${row.barangay_name} Barangay`;
    if (row.scope_type === 'SYSTEM') return 'System Activity';
    return 'Barangay Activity';
};

export const formatAuditField = (key = '') => {
    const leafKey = String(key).split('.').pop();
    return FIELD_LABELS[leafKey] || titleCase(leafKey || key);
};

export const formatAuditValue = (key = '', value) => {
    if (value === undefined || value === null || value === '') return '-';
    const leafKey = String(key).split('.').pop();

    if (leafKey === 'reason') return REASON_LABELS[value] || titleCase(value);
    if (leafKey === 'role' || leafKey === 'actor_role' || leafKey === 'target_role') return formatAuditRole(value);
    if (leafKey === 'is_active') return value ? 'Active' : 'Inactive';
    if (leafKey === 'password' || leafKey === 'password_hash' || leafKey === 'temporary_password') return '[Protected]';
    if (Array.isArray(value)) return value.map((item) => formatAuditValue(key, item)).join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);

    return String(value);
};

const safeObject = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return { value };
    }
};

const flattenAuditObject = (value, prefix = '') => {
    const object = safeObject(value);
    return Object.entries(object).reduce((rows, [key, item]) => {
        const label = prefix ? `${prefix}.${key}` : key;
        let maybeNested = item;
        if (typeof item === 'string' && /^[\[{]/.test(item.trim())) {
            maybeNested = safeObject(item);
        }
        if (maybeNested && typeof maybeNested === 'object' && !Array.isArray(maybeNested)) {
            return rows.concat(flattenAuditObject(maybeNested, label));
        }
        rows.push([label, item]);
        return rows;
    }, []);
};

export const isAuditSystemField = (key = '') => {
    const leaf = leafKey(key).toLowerCase();
    return leaf === 'id'
        || leaf.endsWith('_id')
        || leaf.includes('password')
        || leaf.includes('token')
        || leaf.endsWith('_at')
        || SYSTEM_FIELD_BLOCKLIST.has(leaf);
};

const hasUuidValue = (oldValue, newValue) => containsUuid(oldValue) || containsUuid(newValue);

const normalizedValue = (value) => {
    if (value === undefined || value === null) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

const valuesDiffer = (oldValue, newValue) => normalizedValue(oldValue) !== normalizedValue(newValue);

const isEmptyAuditObject = (value) => flattenAuditObject(value).length === 0;

const isUpdateAction = (action = '') => {
    const key = String(action || '').toUpperCase();
    return key.includes('UPDATE') || key.includes('CORRECT') || key.includes('STATUS') || key.includes('TOGGLE');
};

const isCreationAction = (action = '') => {
    const key = String(action || '').toUpperCase();
    return key.includes('CREATE') || key.includes('REGISTER') || key.includes('APPROVE');
};

const valueFromMap = (map, keys) => {
    for (const key of keys) {
        if (map.has(key) && map.get(key) !== undefined && map.get(key) !== null && map.get(key) !== '') {
            return map.get(key);
        }
    }
    return '';
};

const buildCreationSummaryRows = (newMap) => {
    const firstName = valueFromMap(newMap, ['first_name', 'registration_data.first_name']);
    const middleName = valueFromMap(newMap, ['middle_name', 'registration_data.middle_name']);
    const lastName = valueFromMap(newMap, ['last_name', 'registration_data.last_name']);
    const infantName = valueFromMap(newMap, ['infant_name', 'registration_data.infant_name', 'name', 'registration_data.name'])
        || [firstName, middleName, lastName].filter(Boolean).join(' ');
    const dob = valueFromMap(newMap, ['dob', 'registration_data.dob', 'date_of_birth', 'registration_data.date_of_birth']);
    const sex = valueFromMap(newMap, ['sex', 'registration_data.sex']);
    const motherName = valueFromMap(newMap, [
        'mothers_maiden_name',
        'registration_data.mothers_maiden_name',
        'mother_name',
        'registration_data.mother_name',
        'caregiver_name',
        'registration_data.caregiver_name'
    ]);
    const contactNumber = valueFromMap(newMap, [
        'caregiver_phone',
        'registration_data.caregiver_phone',
        'contact_number',
        'registration_data.contact_number'
    ]);

    return [
        ['infant_name', infantName],
        ['dob', dob],
        ['mothers_maiden_name', motherName],
        ['sex', sex],
        ['caregiver_phone', contactNumber]
    ]
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => ({
            key,
            oldValue: '',
            newValue: value,
            changed: true
        }));
};

export const buildAuditDeltaRows = ({ action, oldValues, newValues } = {}) => {
    const oldEntries = flattenAuditObject(oldValues);
    const newEntries = flattenAuditObject(newValues);
    const oldMap = new Map(oldEntries);
    const newMap = new Map(newEntries);

    if (isCreationAction(action) && isEmptyAuditObject(oldValues)) {
        const summaryRows = buildCreationSummaryRows(newMap);
        if (summaryRows.length > 0) return summaryRows;
    }

    const keys = Array.from(new Set([...oldMap.keys(), ...newMap.keys()]))
        .filter((key) => !isAuditSystemField(key))
        .filter((key) => {
            if (!isCreationAction(action)) return true;
            return CREATION_IDENTIFIER_FIELDS.includes(key) || CREATION_IDENTIFIER_FIELDS.includes(leafKey(key));
        })
        .sort();

    return keys
        .map((key) => ({
            key,
            oldValue: oldMap.has(key) ? oldMap.get(key) : '',
            newValue: newMap.has(key) ? newMap.get(key) : '',
            changed: valuesDiffer(oldMap.get(key), newMap.get(key))
        }))
        .filter((row) => !isAuditSystemField(row.key))
        .filter((row) => !hasUuidValue(row.oldValue, row.newValue))
        .filter((row) => !isUpdateAction(action) || row.changed);
};

export const buildAuditTechnicalRows = ({ oldValues, newValues, metadata } = {}) => {
    const rows = [];
    flattenAuditObject(metadata).forEach(([key, value]) => rows.push([`metadata.${key}`, value]));
    flattenAuditObject(oldValues)
        .filter(([key, value]) => isAuditSystemField(key) || containsUuid(value))
        .forEach(([key, value]) => rows.push([`before.${key}`, value]));
    flattenAuditObject(newValues)
        .filter(([key, value]) => isAuditSystemField(key) || containsUuid(value))
        .forEach(([key, value]) => rows.push([`after.${key}`, value]));
    return rows;
};
