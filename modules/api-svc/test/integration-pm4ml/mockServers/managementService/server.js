/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Matt Kingston - matt.kingston@modusbox.com                       *
 **************************************************************************/

const ws = require('ws');
const jsonPatch = require('fast-json-patch');
const randomPhrase = require('./lib/randomphrase');

const INIT_CONFIG = require('./initConfig')

/**************************************************************************
 * The message protocol messages, verbs, and errors
 *************************************************************************/
const MESSAGE = {
  CONFIGURATION: 'CONFIGURATION',
  ERROR: 'ERROR',
};

const VERB = {
  READ: 'READ',
  NOTIFY: 'NOTIFY',
  PATCH: 'PATCH',
};

const ERROR = {
  UNSUPPORTED_MESSAGE: 'UNSUPPORTED_MESSAGE',
  UNSUPPORTED_VERB: 'UNSUPPORTED_VERB',
  JSON_PARSE_ERROR: 'JSON_PARSE_ERROR',
};

/**************************************************************************
 * Private convenience functions
 *************************************************************************/
const serialise = JSON.stringify;
const deserialise = (msg) => {
  //reviver function
  return JSON.parse(msg.toString(), (k, v) => {
    if (
      v !== null &&
      typeof v === 'object' &&
      'type' in v &&
      v.type === 'Buffer' &&
      'data' in v &&
      Array.isArray(v.data)
    ) {
      return Buffer.from(v.data);
    }
    return v;
  });
};

const buildMsg = (verb, msg, data, id = randomPhrase()) =>
  serialise({
    verb,
    msg,
    data,
    id,
  });

const buildPatchConfiguration = (oldConf, newConf, id) => {
  const patches = jsonPatch.compare(oldConf, newConf);
  return buildMsg(VERB.PATCH, MESSAGE.CONFIGURATION, patches, id);
};

const getWsIp = (req) => [
  req.socket.remoteAddress,
  ...(req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(/\s*,\s*/) : []),
];

/**************************************************************************
 * build
 *
 * Public object exposing an API to build valid protocol messages.
 * It is not the only way to build valid messages within the protocol.
 *************************************************************************/
const build = {
  CONFIGURATION: {
    PATCH: buildPatchConfiguration,
    READ: (id) => buildMsg(VERB.READ, MESSAGE.CONFIGURATION, {}, id),
    NOTIFY: (config, id) => buildMsg(VERB.NOTIFY, MESSAGE.CONFIGURATION, config, id),
  },
  ERROR: {
    NOTIFY: {
      UNSUPPORTED_MESSAGE: (id) => buildMsg(VERB.NOTIFY, MESSAGE.ERROR, ERROR.UNSUPPORTED_MESSAGE, id),
      UNSUPPORTED_VERB: (id) => buildMsg(VERB.NOTIFY, MESSAGE.ERROR, ERROR.UNSUPPORTED_VERB, id),
      JSON_PARSE_ERROR: (id) => buildMsg(VERB.NOTIFY, MESSAGE.ERROR, ERROR.JSON_PARSE_ERROR, id),
    },
  },
};

/**************************************************************************
 * Server
 *
 * The Control Server. Exposes a websocket control API.
 * Used to hot-restart the SDK.
 *
 * logger    - Logger- see SDK logger used elsewhere
 * port      - HTTP port to host on
 * appConfig - The configuration for the entire application- supplied here as this class uses it to
 *             validate reconfiguration requests- it is not used for configuration here, however
 * server    - optional HTTP/S server on which to serve the websocket
 *************************************************************************/

class Server extends ws.Server {
  _logger;
  _clientData;
  _currentConfig;
  _isConfigUpdated;
  _heartbeatInterval;

  constructor(opts) {
    super({ clientTracking: true, port: opts.port });

    this._logger = opts.logger;
    this._clientData = new Map();
    this._initConfig();
    this._isConfigUpdated = false;

    this.on('error', (err) => {
      this._logger.push({ err }).log('Unhandled websocket error occurred. Shutting down.');
      process.exit(1);
    });

    this.on('connection', (socket, req) => {
      const logger = this._logger.push({
        url: req.url,
        ip: getWsIp(req),
        remoteAddress: req.socket.remoteAddress,
      });
      logger.log('Websocket connection received');
      this._clientData.set(socket, { ip: req.connection.remoteAddress, logger, isAlive: true });

      socket.on('pong', () => {
        const clientData = this._clientData.get(socket);
        if (clientData) {
          clientData.isAlive = true;
        }
      });

      socket.on('close', (code, reason) => {
        logger.push({ code, reason }).log('Websocket connection closed');
        this._clientData.delete(socket);
      });

      socket.on('message', this._handle(socket, logger));
    });
    this._logger.push(this.address()).log('running on');
    this._startHeartbeat();
  }

  _startHeartbeat() {
    this._heartbeatInterval = setInterval(() => {
      this.clients.forEach((client) => {
        const clientData = this._clientData.get(client);
        if (clientData && !clientData.isAlive) {
          client.terminate();
          this._clientData.delete(client);
          return;
        }
        if (clientData) {
          clientData.isAlive = false;
        }
        client.ping();
      });
    }, 30000);
  }

  _stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  _setConfig(newConfig) {
    this._isConfigUpdated = true;
    this._currentConfig = newConfig;
  }

  _initConfig() {
    this._isConfigUpdated = false;
    this._currentConfig = INIT_CONFIG;
  }

  // Close the server then wait for all the client sockets to close
  async stop() {
    this._stopHeartbeat();
    const closing = new Promise((resolve) => this.close(resolve));
    for (const client of this.clients) {
      client.terminate();
    }
    await closing;
    this._logger.log('Control server shutdown complete');
  }

  _handle(client, logger) {
    return (data) => {
      // TODO: json-schema validation of received message- should be pretty straight-forward
      // and will allow better documentation of the API
      let msg;
      try {
        msg = deserialise(data);
      } catch (err) {
        logger.push({ data }).log("Couldn't parse received message");
        client.send(build.ERROR.NOTIFY.JSON_PARSE_ERROR());
      }
      logger.push({ msg }).log('Handling received message');
      switch (msg.msg) {
        case MESSAGE.CONFIGURATION:
          switch (msg.verb) {
            case VERB.READ:
              logger.log('Sending configuration');
              client.send(build.CONFIGURATION.NOTIFY(this._currentConfig));
              break;
            default:
              client.send(build.ERROR.NOTIFY.UNSUPPORTED_VERB(msg.id));
              break;
          }
          break;
        default:
          client.send(build.ERROR.NOTIFY.UNSUPPORTED_MESSAGE(msg.id));
          break;
      }
    };
  }

  /**
   * Update configuration and broadcast the change
   */
  updateNewConfig(updatedConfig) {
    this._setConfig(updatedConfig);
    const updateConfMsg = build.CONFIGURATION.NOTIFY(this._currentConfig, randomPhrase());
    this._logger.log('Sending updated configuration');
    this.broadcast(updateConfMsg);
  }

  /**
   * Update outbound tls configuration and broadcast the change
   */
  updateOutboundTLSConfig(outboundTLSConfig) {
    const newConfig = structuredClone(this._currentConfig);
    newConfig.outbound.tls = outboundTLSConfig;
    this.updateNewConfig(newConfig)
  }

  /**
   * Reset the configuration to initial values
   */
  resetConfig() {
    if (this._isConfigUpdated) {
      this._initConfig();
      const updateConfMsg = build.CONFIGURATION.NOTIFY(this._currentConfig, randomPhrase());
      this._logger.log('Resetting configuration to initial values...');
      this.broadcast(updateConfMsg);
    } else {
      this._logger.log('Skipping reset, nothing changed.');
    }
  }

  /**
   * Broadcasts a protocol message to all connected clients.
   *
   * @param {string} msg
   */
  broadcast(msg) {
    this.clients.forEach((client) => {
      if (client.readyState === ws.WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }
}

module.exports = { Server, build, MESSAGE, VERB, ERROR };
