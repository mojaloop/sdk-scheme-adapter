"use strict"

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  clearMocks: true,
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
    "^.+\\.(js|jsx|mjs)$": "ts-jest"
  },
  transformIgnorePatterns: [
    "/node_modules/(?!serialize-error|non-error|@mojaloop/central-services-shared|@mojaloop/event-sdk|uuid).+\\.js$",
    "/dist/"
  ]
}