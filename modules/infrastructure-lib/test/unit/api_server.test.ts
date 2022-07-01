import { SimpleLogger } from '@mojaloop/sdk-scheme-adapter-domain-lib/test/unit/utilities/simple_logger'
import axios from 'axios'
import { ApiServer, TApiServerOptions } from '../../src/index'

describe('Api Server', () => {
  let server: ApiServer
  const options: TApiServerOptions = {
    healthCallback: async () => ({ status: 'ok' }),
    metricCallback: async () => "metric1",
    port: 3000,
    host: 'localhost'
  }

  beforeAll(async () => {
    server = new ApiServer(options, new SimpleLogger())
    await server.init()
  })

  afterAll(async () => {
    await server.destroy()
  })

  test('health endpoint returns 200', async () => {
    const response = await axios.get('http://localhost:3000/health')

    expect(response.status).toBe(200)
    expect(response.data).toMatchObject({ status: 'ok' })
  })

  test('metric endpoint returns 200', async () => {
    const response = await axios.get('http://localhost:3000/metrics')

    expect(response.status).toBe(200)
    expect(response.data).toBe("metric1")
  })
})