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
      "branches": 9,
      "functions": 5,
      "lines": 27,
      "statements": 27
    }
  }
}