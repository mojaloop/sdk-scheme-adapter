'use strict';

module.exports = {
    verbose: true,
    testEnvironment: 'node',
    collectCoverage: true,
    collectCoverageFrom: ['./**/*.js'],
    coverageReporters: ['json', 'lcov', 'text'],
    clearMocks: false,
    reporters: ['jest-junit', 'default']
};