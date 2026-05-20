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
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)'
  ]
};