'use strict'

const assert = require('assert').strict

const protocolVersions = {
  anyVersion: Symbol('Any version'),
  ONE: ['1', '1.0', '1.1']
}

const protocolVersionsMap = [
  { key: '1', value: '0' },
  { key: '1', value: '1' }
]

// Some convenience functions for generating regexes for header matching

const generateContentTypeRegex = resource =>
  new RegExp(`^application/vnd\\.interoperability\\.${resource}\\+json\\s{0,1};\\s{0,1}version=(\\d+\\.\\d+)$`)

const generateAcceptRegex = resource =>
  new RegExp(`^${generateSingleAcceptRegexStr(resource)}(,${generateSingleAcceptRegexStr(resource)})*$`)

const generateSingleAcceptRegexStr = resource =>
  `application/vnd\\.interoperability\\.${resource}\\+json(\\s{0,1};\\s{0,1}version=\\d+(\\.\\d+)?)?`

const parseContentTypeHeader = (resource, header) => {
  assert(typeof header === 'string')

  // Create the validation regex
  const r = generateContentTypeRegex(resource)

  // Test the header
  const match = header.match(r)
  if (match === null) {
    return { valid: false }
  }

  return {
    valid: true,
    version: match[1]
  }
}

const parseAcceptHeader = (resource, header) => {
  assert(typeof header === 'string')

  // Create the validation regex
  const r = generateAcceptRegex(resource)

  // Test the header
  if (header.match(r) === null) {
    return { valid: false }
  }

  // The header contains a comma-delimited set of versions, extract these
  const versions = new Set(header
    .split(',')
    .map(verStr => verStr.match(new RegExp(generateSingleAcceptRegexStr(resource)))[1])
    .map(match => match === undefined ? protocolVersions.anyVersion : match.split('=')[1])
  )

  return {
    valid: true,
    versions
  }
}

module.exports = {
  protocolVersions,
  protocolVersionsMap,
  generateAcceptRegex,
  generateContentTypeRegex,
  parseAcceptHeader,
  parseContentTypeHeader
}
