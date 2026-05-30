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
    '<rootDir>/tests/hostile_verification.test.js',
    '<rootDir>/tests/doh_governance.test.js',
    '<rootDir>/tests/audit_enforcement.test.js',
    '<rootDir>/tests/pending_validations.test.js',
    '<rootDir>/tests/settings_adversarial.test.js',
    '<rootDir>/tests/OverrideScopeLimitation.property.test.js',
    '<rootDir>/tests/EnhancedNIPScheduleEngine.property.test.js',
    '<rootDir>/tests/clinical.scenarios.test.js',
    '<rootDir>/tests/AuthorizationController.test.js',
    '<rootDir>/tests/AuthorizationController.property.test.js',
    '<rootDir>/tests/AuditTrailImmutability.property.test.js',
    '<rootDir>/tests/AuditTrailCompleteness.property.test.js',
    '<rootDir>/tests/infant_registration_foreign_key.test.js'
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
