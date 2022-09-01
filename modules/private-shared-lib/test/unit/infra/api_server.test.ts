import {DefaultLogger} from '@mojaloop/logging-bc-client-lib';
import axios from 'axios'
import { ApiServer, TApiServerOptions } from '../../../src/index'
import {ILogger} from '@mojaloop/logging-bc-public-types-lib';

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion');

describe('Api Server', () => {
  let server: ApiServer
  const options: TApiServerOptions = {
    healthCallback: async () => ({ status: 'ok' }),
    metricCallback: async () => "metric1",
    port: 3000,
    host: 'localhost'
  }

  beforeAll(async () => {
    server = new ApiServer(options, logger)
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
