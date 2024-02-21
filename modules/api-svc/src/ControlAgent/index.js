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
 * Events emitted by the control client
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
    /**
     * Consider this a private constructor.
     * `Client` instances outside of this class should be created via the `Create(...args)` static method.
     */
    constructor({ address = 'localhost', port, logger, appConfig }) {
        super(`ws://${address}:${port}`);
        this._logger = logger;
        this._appConfig = appConfig;
    }

    // Really only exposed so that a user can import only the client for convenience
    get Build() {
        return build;
    }

    static Create(...args) {
        return new Promise((resolve, reject) => {
            const client = new Client(...args);
            client.on('open', () => resolve(client));
            client.on('error', (err) => reject(err));
            client.on('message', client._handle);
        });
    }

    async send(msg) {
        const data = typeof msg === 'string' ? msg : serialise(msg);
        this._logger.isDebugEnabled() && this._logger.push({ data }).debug('Sending message');
        return new Promise((resolve) => super.send.call(this, data, resolve));
    }

    // Receive a single message
    async receive() {
        return new Promise((resolve) => this.once('message', (data) => {
            const msg = deserialise(data);
            this._logger.isDebugEnabled() && this._logger.push({ msg }).debug('Received');
            resolve(msg);
        }));
    }

    // Close connection
    async stop() {
        this._logger.isInfoEnabled() && this._logger.info('Control client shutting down...');
        this.close();
    }

    // Handle incoming message from the server.
    _handle(data) {
        // TODO: json-schema validation of received message- should be pretty straight-forward
        // and will allow better documentation of the API
        let msg;
        try {
            msg = deserialise(data);
        } catch (err) {
            this._logger.isErrorEnabled() && this._logger.push({ data }).console.error();('Couldn\'t parse received message');
            this.send(build.ERROR.NOTIFY.JSON_PARSE_ERROR());
        }
        this._logger.isDebugEnabled() && this._logger.push({ msg }).debug('Handling received message');
        switch (msg.msg) {
            case MESSAGE.CONFIGURATION:
                switch (msg.verb) {
                    case VERB.NOTIFY: {
                        const dup = JSON.parse(JSON.stringify(this._appConfig)); // fast-json-patch explicitly mutates
                        _.merge(dup, msg.data);
                        this._logger.isDebugEnabled() && this._logger.push({ oldConf: this._appConfig, newConf: dup }).debug('Emitting new configuration');
                        this.emit(EVENT.RECONFIGURE, dup);
                        break;
                    }
                    case VERB.PATCH: {
                        const dup = JSON.parse(JSON.stringify(this._appConfig)); // fast-json-patch explicitly mutates
                        jsonPatch.applyPatch(dup, msg.data);
                        this._logger.isDebugEnabled() && this._logger.push({ oldConf: this._appConfig, newConf: dup }).debug('Emitting new configuration');
                        this.emit(EVENT.RECONFIGURE, dup);
                        break;
                    }
                    default:
                        this.send(build.ERROR.NOTIFY.UNSUPPORTED_VERB(msg.id));
                        break;
                }
                break;
            default:
                this.send(build.ERROR.NOTIFY.UNSUPPORTED_MESSAGE(msg.id));
                break;
        }

    }
}



module.exports = {
    Client,
    build,
    MESSAGE,
    VERB,
    ERROR,
    EVENT,
};
