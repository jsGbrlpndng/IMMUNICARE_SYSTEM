// Jest setup file
// Global test configuration and utilities

// Set test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  // Uncomment to suppress console.log during tests
  // log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};