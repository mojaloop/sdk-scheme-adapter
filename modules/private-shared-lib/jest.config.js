"use strict"

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverage: false,
  collectCoverageFrom: ["./src/**/*.ts"],
  coverageReporters: ["json", "lcov"],
  clearMocks: true,
  coverageThreshold: {
    "global": {
      "branches": 0,
      "functions": 0,
      "lines": 0,
      "statements": 0
    }
  },
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
    "^.+\\.(js|jsx|mjs)$": "ts-jest"
  },
  transformIgnorePatterns: [
    "/node_modules/(?!serialize-error|non-error|@mojaloop/central-services-shared|@mojaloop/event-sdk|uuid).+\\.js$",
    "/dist/"
  ]
}
