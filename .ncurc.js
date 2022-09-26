module.exports = {
    reject: [
      // v0.2.0 of the these libraries introduces various changes to base
      // classes used in `private-shared-lib`.
      // https://github.com/mojaloop/platform-shared-lib.
      // https://github.com/mojaloop/project/issues/2949
      '@mojaloop/platform-shared-lib-nodejs-kafka-client-lib',
      '@mojaloop/platform-shared-lib-messaging-types-lib',
    ]
  }
