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
      "branches": 26,
      "functions": 51,
      "lines": 43,
      "statements": -160
    }
  }
}
