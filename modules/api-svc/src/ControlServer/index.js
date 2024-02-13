/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Matt Kingston - matt.kingston@modusbox.com                       *
 **************************************************************************/

// This server has deliberately been written separate from any other server in the SDK. There is
// some reasonable argument that it could be part of the outbound or test server. It has not been
// incorporated in either as, at the time of writing, it is intended to be maintained in a
// proprietary fork. Therefore, keeping it independent of other servers will avoid the maintenance
// burden that would otherwise be associated with incorporating it with those.
//
// It inherits from the Server class from the 'ws' websocket library for Node, which in turn
// inherits from EventEmitter. We exploit this to emit an event when a reconfigure message is sent
// to this server. Then, when this server's reconfigure method is called, it reconfigures itself
// and sends a message to all clients notifying them of the new application configuration.
//
// It expects new configuration to be supplied as an array of JSON patches. It therefore exposes
// the current configuration to


const ws = require('ws');
const jsonPatch = require('fast-json-patch');
const { generateSlug } = require('random-word-slugs');
const _ = require('lodash');


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
 * Events emitted by the control server
 *************************************************************************/
const EVENT = {
    RECONFIGURE: 'RECONFIGURE',
};

/**************************************************************************
 * Private convenience functions
 *************************************************************************/
const serialise = JSON.stringify;
const deserialise = (msg) => {
    //reviver function
    return JSON.parse(msg.toString(), (k, v) => {
        if (
            v !== null            &&
          typeof v === 'object' &&
          'type' in v           &&
          v.type === 'Buffer'   &&
          'data' in v           &&
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

const getWsIp = (req) => [
    req.socket.remoteAddress,
    ...(
        req.headers['x-forwarded-for']
            ? req.headers['x-forwarded-for'].split(/\s*,\s*/)
            : []
    )
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
        }
    },
};

/**************************************************************************
 * Client
 *
 * The Control Client. Client for the websocket control API.
 * Used to hot-restart the SDK.
 *
 * logger    - Logger- see SDK logger used elsewhere
 * address   - address of control server
 * port      - port of control server
 *************************************************************************/
class Client extends ws {
    constructor({ address = 'localhost', port, logger }) {
        super(`ws://${address}:${port}`);
        this._logger = logger;
    }

    // Really only exposed so that a user can import only the client for convenience
    get Build() {
        return build;
    }

    static async Create(...args) {
        const result = new Client(...args);
        await new Promise((resolve, reject) => {
            result.on('open', resolve);
            result.on('error', reject);
        });
        return result;
    }

    async send(msg) {
        const data = typeof msg === 'string' ? msg : serialise(msg);
        this._logger.push({ data }).log('Sending message');
        return new Promise((resolve) => super.send.call(this, data, resolve));
    }

    // Receive a single message
    async receive() {
        return new Promise((resolve) => this.once('message', (data) => {
            const msg = deserialise(data);
            this._logger.push({ msg }).log('Received');
            resolve(msg);
        }));
    }
}

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
    constructor({ logger, port = 0, appConfig = {} }) {
        super({ clientTracking: true, port });

        this._logger = logger;
        this._port = port;
        this._appConfig = appConfig;
        this._clientData = new Map();

        this.on('error', err => {
            this._logger.push({ err })
                .log('Unhandled websocket error occurred. Shutting down.');
            process.exit(1);
        });

        this.on('connection', (socket, req) => {
            const logger = this._logger.push({
                url: req.url,
                ip: getWsIp(req),
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


    async notifyClientsOfCurrentConfig() {
        const updateConfMsg = build.CONFIGURATION.NOTIFY(this._appConfig);
        const logError = (socket, message) => (err) =>
            this._logger
                .push({ message, ip: this._clientData.get(socket).ip, err })
                .log('Error sending reconfigure notification to client');
        const sendToAllClients = (msg) => Promise.all(
            [...this.clients.values()].map((socket) =>
                (new Promise((resolve) => socket.send(msg, resolve))).catch(logError(socket, msg))
            )
        );
        return await sendToAllClients(updateConfMsg);
    }

    _handle(client, logger) {
        return (data) => {
            // TODO: json-schema validation of received message- should be pretty straight-forward
            // and will allow better documentation of the API
            let msg;
            try {
                msg = deserialise(data);
            } catch (err) {
                logger.push({ data }).log('Couldn\'t parse received message');
                client.send(build.ERROR.NOTIFY.JSON_PARSE_ERROR());
            }
            logger.push({ msg }).log('Handling received message');
            switch (msg.msg) {
                case MESSAGE.CONFIGURATION:
                    switch (msg.verb) {
                        case VERB.READ:
                            client.send(build.CONFIGURATION.NOTIFY(this._appConfig, msg.id));
                            break;
                        case VERB.NOTIFY: {
                            const dup = structuredClone(this._appConfig); // fast-json-patch explicitly mutates
                            _.merge(dup, msg.data);
                            this._logger.push({ oldConf: this._appConfig, newConf: dup }).log('Emitting new configuration');
                            this.emit(EVENT.RECONFIGURE, dup);
                            break;
                        }
                        case VERB.PATCH: {
                            // TODO: validate the incoming patch? Or assume clients have used the
                            // client library?
                            const dup = structuredClone(this._appConfig); // fast-json-patch explicitly mutates
                            jsonPatch.applyPatch(dup, msg.data);
                            logger.push({ oldConf: this._appConfig, newConf: dup }).log('Emitting new configuration');
                            this.emit(EVENT.RECONFIGURE, dup);
                            break;
                        }
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
}

module.exports = {
    Client,
    Server,
    build,
    MESSAGE,
    VERB,
    ERROR,
    EVENT,
};
