/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Matt Kingston - matt.kingston@modusbox.com                       *
 **************************************************************************/
'use strict';

const ws = require('ws');
const jsonPatch = require('fast-json-patch');
const { generateSlug } = require('random-word-slugs');
const { getInternalEventEmitter, INTERNAL_EVENTS } = require('./events');

const ControlServerEventEmitter = getInternalEventEmitter();


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
    PATCH: 'PATCH'
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
            Array.isArray(v.data)) {
            return new Buffer(v.data);
        }
        return v;
    });
};


const buildMsg = (verb, msg, data, id = generateSlug(4)) => serialise({
    verb,
    msg,
    data,
    id,
});

const buildPatchConfiguration = (oldConf, newConf, id) => {
    const patches = jsonPatch.compare(oldConf, newConf);
    return buildMsg(VERB.PATCH, MESSAGE.CONFIGURATION, patches, id);
};

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
        }
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
    constructor({ logger, appConfig = {} }) {
        super({ clientTracking: true, port: appConfig.control.port });

        this._logger = logger;
        this._port = appConfig.control.port;
        this._appConfig = appConfig;
        this._clientData = new Map();

        this.on('error', err => {
            this._logger.push({ error: err }).error('Unhandled websocket error occurred. Shutting down.');
            process.exit(1);
        });

        this.on('connection', (socket, req) => {
            const logger = this._logger.push({
                url: req.url,
                ip: 'localhost',
                remoteAddress: req.socket.remoteAddress,
            });
            logger.log('Websocket connection received');
            this._clientData.set(socket, { ip: req.connection.remoteAddress, logger });

            socket.on('close', (code, reason) => {
                logger.push({ code, reason }).log('Websocket connection closed');
                this._clientData.delete(socket);
            });

            socket.on('message', this._handle(socket, logger));
        });
        this._logger.push(this.address()).log('running on');
    }

    // Close the server then wait for all the client sockets to close
    async stop() {
        const closing = new Promise(resolve => this.close(resolve));
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
                logger.push({ data, err }).log('Couldn\'t parse received message');
                client.send(build.ERROR.NOTIFY.JSON_PARSE_ERROR());
            }
            logger.push({ msg }).log('Handling received message');
            switch (msg.msg) {
                case MESSAGE.CONFIGURATION:
                    switch (msg.verb) {
                        case VERB.READ:
                            (async () => {
                                const jwsCerts = await this.populateConfig();
                                client.send(build.CONFIGURATION.NOTIFY(jwsCerts, msg.id));
                            })();
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

    async populateConfig(){
        return this._appConfig;
    }


    /**
     * Register this server instance to receive internal server messages
     * from other modules.
     */
    registerInternalEvents() {
        ControlServerEventEmitter.on(INTERNAL_EVENTS.SERVER.BROADCAST_CONFIG_CHANGE, (params) => this.broadcastConfigChange(params));
    }

    /**
     * Broadcast configuration change to all connected clients.
     *
     * @param {object} params Updated configuration
     */
    broadcastConfigChange(updatedConfig) {
        const updateConfMsg = build.CONFIGURATION.PATCH({}, updatedConfig, generateSlug(4));
        this.broadcast(updateConfMsg);
    }

    /**
   * Broadcasts a protocol message to all connected clients.
   *
   * @param {string} msg
   */
    broadcast(msg) {
        this.clients.forEach((client) => {
            if (client.readyState === ws.OPEN) {
                client.send(msg);
            }
        });
    }
}


module.exports = {
    Server,
    build,
    MESSAGE,
    VERB,
    ERROR,
};
