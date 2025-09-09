/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: ['src/lib/**/*.{ts,tsx}'],
}

module.exports = config
