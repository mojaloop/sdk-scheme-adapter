
/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Coil
 - Donovan Changfoot <donovan.changfoot@coil.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 * ModusBox
 - Miguel de Barros <miguel.debarros@modusbox.com>
 - Roman Pietrzak <roman.pietrzak@modusbox.com>

 --------------
******/

'use strict'

import { fastify as Fastify, FastifyInstance, RouteShorthandOptions } from 'fastify'
import { Server, IncomingMessage, ServerResponse } from 'http'
import { ILogger } from '@mojaloop/sdk-scheme-adapter-domain-lib'

export type TApiServerOptions = {
  host: string
  port: number
  metricCallback: () => Promise<any>
  healthCallback: () => Promise<any>
}

export class ApiServer {
  private readonly _logger: ILogger
  private readonly _options: TApiServerOptions
  private _serverOptions: TApiServerOptions
  private readonly _server: FastifyInstance<Server, IncomingMessage, ServerResponse>

  constructor (opts: TApiServerOptions, logger: ILogger) {
    this._logger = logger
    this._options = opts
    this._server = Fastify({
      // todo here
    })
  }

  async init (): Promise<void> {
    const defaultHttpServerOptions: TApiServerOptions = {
      host: '0.0.0.0',
      port: 3000,
      metricCallback: async () => undefined,
      healthCallback: async () => undefined
    }

    // copy default config
    this._serverOptions = { ...defaultHttpServerOptions }
    // override any values with the options given to the client
    Object.assign(this._serverOptions, this._options)

    this._logger.isInfoEnabled() && this._logger.info(`Http Server starting with opts: ${JSON.stringify(this._serverOptions)}`)

    const routeHealthOpts: RouteShorthandOptions = {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: {
                type: 'string'
              },
              version: {
                type: 'string'
              },
              name: {
                type: 'string'
              }
            }
          }
        }
      }
    }

    this._server.get('/health', routeHealthOpts, async (request, reply) => {
      // console.log(reply.res) // this is the http.ServerResponse with correct typings!
      // this._logger.isDebugEnabled() && this._logger.debug(JSON.stringify(reply.res))
      const response = await this._serverOptions.healthCallback()
      await reply.code(200).send(response)
    })

    const routeMetricOpts: RouteShorthandOptions = {
      schema: {
        response: {
          200: {
            type: 'string'
          }
        }
      }
    }

    this._server.get('/metrics', routeMetricOpts, async (request, reply) => {
      // console.log(reply.res) // this is the http.ServerResponse with correct typings!
      // this._logger.isDebugEnabled() && logger.debug(JSON.stringify(reply.res))
      const response = await this._serverOptions.metricCallback()
      await reply.code(200).send(response)
    })

    // Run the server!
    await this._server.listen(this._serverOptions.port, this._serverOptions.host)

    this._logger.isInfoEnabled() && this._logger.info(`Http Server start on port:${this._serverOptions.port}, host: ${this._serverOptions.host}`)

    // Run the server!
    // this._server..listen(this._options.port, this._options.host, function (err, address) {
    //   if (err) {
    //    this._logger.isErrorEnabled() && logger.error(err)
    //     process.exit(1)
    //   }
    //   this._logger.isInfoEnabled() && logger.info(`server listening on ${address}`)
    // })
  }

  async destroy (): Promise<void> {
    await this._server.close()
  }
}
