/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Paweł Marzec - pawel.marzec@modusbox.com                         *
 **************************************************************************/

'use strict';
const util = require('util');

const PSM = require('./common').PersistentStateMachine;
const MojaloopRequests = require('@mojaloop/sdk-standard-components').MojaloopRequests;

const specStateMachine = {
    init: 'start',
    transitions: [
        { name: 'init', from: 'none', to: 'start' },
        { name: 'requestPartiesInformation', from: 'start', to: 'succeeded' },
        { name: 'error', from: '*', to: 'errored' },
    ],
    methods: {
        // workflow methods
        run,
        getResponse,

        // specific transitions handlers methods
        onRequestPartiesInformation,
    }
};

/**
 * @name run
 * @description run the workflow logic
 * @param {string} type     - the party type
 * @param {string} id       - the party id
 * @param {string} [subId]  - the optional party subId
 * @returns {Object} - the http response payload
 */
async function run(type, id, subId) {
    // input validation
    const channel = channelName(type, id, subId);
    if (channel.indexOf('-undefined-') != -1) {
        throw new Error('PartiesModel.run required at least two string arguments: \'type\' and \'id\'');
    }

    const { data, logger } = this.context;
    try {
        // run transitions based on incoming state
        switch(data.currentState) {
            case 'start':
                // the first transition is requestPartiesInformation
                await this.requestPartiesInformation(type, id, subId);
                // don't await to finish the save
                this.saveToCache();
                logger.log(`Party information requested for /${type}/${id}/${subId},  currentState: ${data.currentState}`);
    
            // eslint-disable-next-line no-fallthrough
            case 'succeeded':
                // all steps complete so return
                logger.log('Party information retrieved successfully');
                return this.getResponse();

            case 'errored':
                // stopped in errored state
                logger.log('State machine in errored state');
                return;
        }
    } catch (err) {
        logger.log(`Error running Parties model: ${util.inspect(err)}`);

        // as this function is recursive, we don't want to error the state machine multiple times
        if(data.currentState !== 'errored') {
            // err should not have a requestPartiesInformationState property here!
            if(err.requestPartiesInformationState) {
                logger.log('State machine is broken');
            }
            // transition to errored state
            await this.error(err);

            // avoid circular ref between requestPartiesInformationState.lastError and err
            err.requestPartiesInformationState = JSON.parse(JSON.stringify(this.getResponse()));
        }
        throw err;
    }
}

const mapCurrentState = {
    start: 'WAITING_FOR_REQUEST_PARTY_INFORMATION',
    succeeded: 'COMPLETED',
    errored: 'ERROR_OCCURRED'
};

/**
 * @name getResponse
 * @description returns the http response payload depending on which state machine is
 * @returns {Object} - the http response payload
 */
function getResponse() {
    const { data, logger } = this.context;
    let resp = { ...data };
    
    // project some of our internal state into a more useful
    // representation to return to the SDK API consumer
    resp.currentState = mapCurrentState[data.currentState];

    // handle unexpected state
    if(!resp.currentState) {
        logger.error(`Parties model response being returned from an unexpected state: ${data.currentState}. Returning ERROR_OCCURRED state`);
        resp.currentState = mapCurrentState.errored;
    }

    return resp;
}
/**
 * @name onRequestPartiesInformation
 * @description generates the pub/sub channel name
 * @param {string} type     - the party type
 * @param {string} id       - the party id
 * @param {string} [subId]  - the optional party subId
 * @returns {string} - the pub/sub channel name
 */
async function onRequestPartiesInformation(fsm, type, id, subId) {
    const { cache, logger } = this.context;
    const { requests } = this.handlersContext;
    logger.push({ type, id, subId }).error('onReqeustPartiesInformation - arguments')
    const channel = channelName(type, id, subId);
    let sid;

    // eslint-disable-next-line no-async-promise-executor
    return new Promise( async(resolve, reject) => {
        try {
            // in InboundServer/handlers is implemented putPartiesById handler 
            sid = await cache.subscribe(channel, async (channel, message, sid) => {
                // unsubscribe first
                cache.unsubscribe(channel, sid);

                // protect against malformed JSON message
                try { 
                    const parsed = JSON.parse(message);
                    this.context.data = {
                        ...parsed,
                        currentState: this.state
                    };
                    resolve();
                } catch(err) {
                    reject(err); 
                }
            });
            
            // GET /parties request to the switch
            const res = await requests.getParties(type, id, subId);
            
            logger.push({ res }).log(' RequestPartiesInformation sent to peer');
            
        } catch(error) {
            logger.push(error).error('RequestPartiesInformation error');
            cache.unsubscribe(channel, sid);
            reject(error);
        }
    });
}


/**
 * @name channelName
 * @description generates the pub/sub channel name
 * @param {string} type     - the party type
 * @param {string} id       - the party id
 * @param {string} [subId]  - the optional party subId
 * @returns {string} - the pub/sub channel name
 */
function channelName(type, id, subId) {
    const tokens = ['parties', type, id, subId];
    return tokens.map(x => `${x}`).join('-');
}


/**
 * @name generateKey
 * @description generates the cache key used to store state machine
 * @param {string} type     - the party type
 * @param {string} id       - the party id
 * @param {string} [subId]  - the optional party subId
 * @returns {string} - the cache key
 */
function generateKey(type, id, subId) {
    return `key-${channelName(type, id, subId)}`;
}


/**
 * @name injectHandlersContext
 * @description injects the config into state machine data, so it will be accessible to on transition notification handlers via `this.handlersContext`
 * @param {Object} config   - config to be injected into state machine data
 * @returns {Object}        - the altered specStateMachine
 */
function injectHandlersContext(config) {
    return { 
        ...specStateMachine,
        data: {
            handlersContext: {
                config: { ...config }, // injects config property
                requests:  new MojaloopRequests({
                    logger: config.logger,
                    peerEndpoint: config.peerEndpoint,
                    alsEndpoint: config.alsEndpoint,
                    dfspId: config.dfspId,
                    tls: config.tls,
                    jwsSign: config.jwsSign,
                    jwsSignPutParties: config.jwsSignPutParties,
                    jwsSigningKey: config.jwsSigningKey,
                    wso2Auth: config.wso2Auth
                })
            }
        }
    };
}


/**
 * @name create
 * @description creates a new instance of state machine specified in specStateMachine ^
 * @param {Object} data     - payload data
 * @param {String} key      - the cache key where state machine will store the payload data after each transition
 * @param {Object} config   - the additional configuration for transition handlers
 */
async function create(data, key, config) {
    const spec = injectHandlersContext(config, specStateMachine);
    return PSM.create(data, config.cache, key, config.logger, spec);
}


/**
 * @name loadFromCache
 * @description loads state machine from cache by given key and specify the additional config for transition handlers
 * @param {String} key      - the cache key used to retrieve the state machine from cache
 * @param {Object} config   - the additional configuration for transition handlers
 */
async function loadFromCache(key, config) {
    const customCreate = async (data, _cache, key) => create(data, key, config);
    return PSM.loadFromCache(config.cache, key, config.logger, specStateMachine, customCreate);
}


module.exports = {
    channelName,
    create,
    generateKey,
    loadFromCache,

    // exports for testing purposes
    mapCurrentState
};

