'use strict'

const Chance = require('chance')
// TODO: this should be parametrised a bit more, and we should test a range of specific, and
// randomly-generated resources
const RESOURCE = 'parties'
const {
  generateAcceptRegex,
  generateContentTypeRegex
} = require('../../../../../src/lib/util/headerValidation')
const {
  generateAcceptHeader,
  generateAcceptVersions,
  generateContentTypeHeader,
  generateContentTypeVersion,
  validAcceptHeaders,
  invalidAcceptHeaders,
  validContentTypeHeaders,
  invalidContentTypeHeaders
} = require('./support')
const chance = new Chance()

// The actual regex for the resource we're testing
const acceptRes = generateAcceptRegex(RESOURCE)

describe('Validation tests', () => {

  describe('accept header tests', () => {
    it('Run positive accept header test suite', async () => {
      const positiveTestSuite = validAcceptHeaders(RESOURCE)
      const failures = positiveTestSuite.filter(h => h.match(acceptRes) === null)
      expect(failures.length).toEqual(0)
    });

    it('Run negative accept header test suite', async () => {
      const negativeTestSuite = invalidAcceptHeaders(RESOURCE)
      const failures = negativeTestSuite.filter(h => h.match(acceptRes) !== null)
      expect(failures.length).toEqual(0)
    });

    it('Run negative accept fuzz', async () => {
      // Removed a, A from chance's default string pool. This prevents a chance (the adjective, not
      // the noun) generation of a valid header. We could equally have removed any other letter in
      // the string '/.+abcdeijlnoprstvyABCDEIJLNOPRSTVY', containing each character in a valid
      // version header.
      const pool = 'bcdefghijklmnopqrstuvwxyzBCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()[]'
      const negativeFuzzTestSuite = Array.from({ length: 100000 }, () => chance.string({ pool }) + chance.string())
      const failures = negativeFuzzTestSuite.filter(h => h.match(acceptRes) !== null)
      expect(failures.length).toEqual(0)
    });

    it('Run positive accept header fuzz', async () => {
      const positiveFuzzTestSuite = Array.from({ length: 100000 },
        () => generateAcceptHeader(RESOURCE, generateAcceptVersions()))
      const failures = positiveFuzzTestSuite.filter(h => h.match(acceptRes) === null)
      expect(failures.length).toEqual(0)
    });
  })

  describe('content-type header tests', () => {
    const contentTypeRes = generateContentTypeRegex(RESOURCE)

    it('Run positive content-type header test suite', async () => {
      const positiveTestSuite = validContentTypeHeaders(RESOURCE)
      const failures = positiveTestSuite.filter(h => h.match(contentTypeRes) === null)
      expect(failures.length).toEqual(0)
    });

    it('Run negative content-type header test suite', async () => {
      const negativeTestSuite = invalidContentTypeHeaders(RESOURCE)
      const failures = negativeTestSuite.filter(h => h.match(contentTypeRes) !== null)
      expect(failures.length).toEqual(0)
    });

    it('Run negative content-type header fuzz', async () => {
      // Removed a, A from chance's default string pool. This prevents a chance (the adjective, not
      // the noun) generation of a valid header. We could equally have removed any other letter in
      // the string '/.+abcdeijlnoprstvyABCDEIJLNOPRSTVY', containing each character in a valid
      // version header.
      const pool = 'bcdefghijklmnopqrstuvwxyzBCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()[]'
      const negativeFuzzTestSuite = Array.from({ length: 100000 }, () => chance.string({ pool }) + chance.string())
      const failures = negativeFuzzTestSuite.filter(h => h.match(contentTypeRes) !== null)
      expect(failures.length).toEqual(0)
    });

    it('Run positive content-type header fuzz', async () => {
      const positiveFuzzTestSuite = Array.from({ length: 100000 },
        () => generateContentTypeHeader(RESOURCE, generateContentTypeVersion()))
      const failures = positiveFuzzTestSuite.filter(h => h.match(contentTypeRes) === null)
      expect(failures.length).toEqual(0)
    });
  })
});

