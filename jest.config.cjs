module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/runtime/src'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@shared$': '<rootDir>/runtime/src/agent-studio/index.ts',
  },
};
