module.exports = {
    verbose: true,
    collectCoverageFrom: [
        '**/src/**/**/*.js'
    ],
    coverageThreshold: {
        global: {
            statements: 74,
            functions: 71,
            branches: 57,
            lines: 74
        }
    },
    clearMocks: true,
    moduleNameMapper: {
        "^~/(.*)$": "<rootDir>/src/$1"
    }
};
