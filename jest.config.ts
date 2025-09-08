import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: ['src/lib/**/*.{ts,tsx}'],
}

export default config

