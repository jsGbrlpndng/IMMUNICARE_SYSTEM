module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'services/**/*.js',
    'routes/**/*.js',
    '!**/node_modules/**'
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '<rootDir>/tests/integration/hostile_verification.test.js',
    '<rootDir>/tests/integration/doh_governance.test.js',
    '<rootDir>/tests/integration/audit_enforcement.test.js',
    '<rootDir>/tests/integration/pending_validations.test.js',
    '<rootDir>/tests/integration/settings_adversarial.test.js',
    '<rootDir>/tests/property/OverrideScopeLimitation.property.test.js',
    '<rootDir>/tests/property/EnhancedNIPScheduleEngine.property.test.js',
    '<rootDir>/tests/integration/clinical.scenarios.test.js',
    '<rootDir>/tests/unit/AuthorizationController.test.js',
    '<rootDir>/tests/property/AuthorizationController.property.test.js',
    '<rootDir>/tests/property/AuditTrailImmutability.property.test.js',
    '<rootDir>/tests/property/AuditTrailCompleteness.property.test.js',
    '<rootDir>/tests/integration/infant_registration_foreign_key.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^uuid$': '<rootDir>/tests/mocks/uuid.js'
  },
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)'
  ]
};
