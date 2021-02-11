module.exports = {
  // format version sem-ver
  // `v{major}.${minor}.${patch}`
  wait4: 'v0.1.0',

  // How many times should we retry waiting for a service?
  retries: 60,

  // How many ms to wait before retrying a service connection?
  waitMs: 2500,

  // services definitions
  services: [
    {
      name: 'sdk-scheme-adapter',

      // list of services to wait for
      wait4: [
        {
          description: 'Redis Cache',
          uri: 'redis:6379',
          method: 'ncat'
        },
        {
          description: 'ml-testing-toolkit',
          uri: 'ml-testing-toolkit:5000',
          method: 'ncat'
        }
      ]
    },
    {
      name: 'cicd-integration-tests',
      wait4: [
        {
          description: 'Inbound service',
          uri: 'localhost:4000',
          method: 'ncat'
        },
        {
          description: 'Outbound service',
          uri: 'localhost:4001',
          method: 'ncat'
        },
        {
          uri: 'localhost:5000',
          method: 'ncat'
        },
        {
          description: 'Redis Cache',
          uri: 'localhost:6379',
          method: 'ncat'
        }
      ]
    },
    {
      name: 'ml-testing-toolkit',
      wait4: [
        {
          description: 'Inbound service',
          uri: 'scheme-adapter:4000',
          method: 'ncat'
        },
        {
          description: 'MongoDB object store',
          uri: 'mongodb://mongo:27018/dfsps',
          method: 'mongo'
        }
      ]
    }
  ]
}
