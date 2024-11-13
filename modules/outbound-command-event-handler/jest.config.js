"use strict"

// jest.config.js

// Reference: https://kulshekhar.github.io/ts-jest/docs/getting-started/paths-mapping/#jest-config-with-helper
const { pathsToModuleNameMapper } = require('ts-jest')
// In the following statement, replace `./tsconfig` with the path to your `tsconfig` file
// which contains the path mapping (ie the `compilerOptions.paths` option):
const { compilerOptions } = require('./tsconfig.json');


module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverage: false,
  collectCoverageFrom: [
    "./src/**/*.ts"
  ],
  coverageReporters: ["json", "lcov"],
  clearMocks: true,
  // coverageThreshold: {
  //   "global": {
  //     "branches": 75,
  //     "functions": 80,
  //     "lines": 80,
  //     "statements": -10
  //   }
  // },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' })
}
