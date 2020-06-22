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
const { uuid } = require('uuidv4');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const PSM = require('./common').PersistentStateMachine;


const specStateMachine = {
    init: 'start',
    transitions: [
        { name: 'init', from: 'none', to: 'start' },
        { name: 'requestAuthorization', from: 'start', to: 'waitingForAuthorization' },
        { name: 'authorizationReceived', from: 'waitingForAuthorization', to: 'succeeded'},
        { name: 'error', from: '*', to: 'errored' },    
    ],
    methods: {
        // workflow methods
        run,
        getResponse,

        // specific transitions handlers methods
        onRequestAuthorization,
        onAuthorizationReceived
    }
};

/**
 * runs the workflow
 */
async function run() {
    const { data, logger } = this.context;
    try {
        // run transitions based on incoming state
        switch(data.currentState) {
            case 'start':
                // the first transition is requestAuthorization
                await this.requestAuthorization();
                logger(`Authorization requested for ${data.transactionRequestId}`);
                return this.getResponse();

            case 'waitingForAuthorization':
                await this.authorizationReceived();
                logger(`Authorization received for ${data.transactionRequestId}`);
                return this.getResponse();

            case 'succeeded':
                // all steps complete so return
                logger.log('Authorization completed successfully');
                return this.getResponse();

            case 'errored':
                // stopped in errored state
                logger.log('State machine in errored state');
                return;
        }

        // now call ourselves recursively to deal with the next transition
        // in this scenario defined in switch statement ^ this part of code is not reachable because of return in every case !!!
        // logger.log(`Authorization model state machine transition completed in state: ${this.state}. Recursing to handle next transition.`);
        // return run();

    } catch (err) {
        logger.log(`Error running authorizations model: ${util.inspect(err)}`);

        // as this function is recursive, we don't want to error the state machine multiple times
        if(data.currentState !== 'errored') {
            // err should not have a authorizationState property here!
            if(err.authorizationState) {
                logger.log('State machine is broken');
            }
            // transition to errored state
            await this.error(err);

            // avoid circular ref between authorizationState.lastError and err
            err.authorizationState = JSON.parse(JSON.stringify(this.getResponse()));
        }
        throw err;
    }
}


const authorizationStateEnum = {
    WAITING_FOR_AUTHORIZATION: 'WAITING_FOR_AUTHORIZATION',
    ERROR_OCCURRED: 'ERROR_OCCURRED',
    COMPLETED: 'COMPLETED'
};

/**
 * Returns an object representing the final state of the authorization suitable for the outbound API
 *
 * @returns {object} - Response representing the result of the authorization process
 */
function getResponse() {
    const { data, logger } = this.context;

    // we want to project some of our internal state into a more useful
    // representation to return to the SDK API consumer
    let resp = { ...data };

    switch(data.currentState) {
        case 'waitingForAuthorization':
            resp.currentState = authorizationStateEnum.WAITING_FOR_AUTHORIZATION;
            break;

        case 'succeeded':
            resp.currentState = authorizationStateEnum.COMPLETED;
            break;

        case 'errored':
            resp.currentState = authorizationStateEnum.ERROR_OCCURRED;
            break;

        default:
            logger.log(`Authorization model response being returned from an unexpected state: ${this.data.currentState}. Returning ERROR_OCCURRED state`);
            resp.currentState = authorizationStateEnum.ERROR_OCCURRED;
            break;
    }

    return resp;
}


/**
 * Requests Authorization
 * Starts the authorization process by sending a POST /authorizations request to switch;
 * than await for a notification on PUT /authorizations/<transactionRequestId> from the cache that the Authorization has been resolved 
 */
async function onRequestAuthorization() {
    const { data, cache, logger } = this.context;
    const { requests, config } = this.handlersContext;
    const authorizationId = `authorizations_${data.transactionRequestId}`;
    let subId;
    
    // promisify https://nodejs.org/api/util.html#util_util_promisify_original
    const subscribe = util.promisify(cache.subscribe).bind(cache);

    try {
        // in InboundServer/handlers is implemented putAuthorizationsById handler where this event is fired
        subId = await subscribe(authorizationId, async (channel, message) => {

            // TODO: maybe it is better to call this.run instead???
            await this.authorizationReceived(message);
            cache.unsubscribe(subId);
        });

        // POST /authorization request to the switch
        const postRequest = buildPostAuthorizationsRequest(data, config);
        const res = requests.postAuthorizations(postRequest);
        logger.push({ res }).log('Authorizations request sent to peer');

    } catch(error) {
        cache.unsubscribe(subId);
        throw error;
    }
}


/**
 * Propagates the Authorization
 * we got the notification on PUT /authorizations/<transactionRequestId> @ InboundServer
 * so we can propagate it back to DFSP
 * 
 * 
 */
async function onAuthorizationReceived(message) {
    const { body } = message;
    const { data } = this.context;
    data.authorizationReceivedBody = body;
}


function buildPostAuthorizationsRequest(data, config) {
    // TODO: the request object must be valid to schema defined in sdk-standard-components
    const request = {
        ...data
    };

    return request;
}

/**
 * injects the config into state machine data
 * so it will be accessible to on transition notification handlers via `this.handlersContext`
 * 
 * @param {Object} config               - config to be injected into state machine data
 * @param {Object} specStateMachine     - specState machine to be altered
 * @returns {Object}                    - the altered specStateMachine
 */
function injectHandlersContext(config, specStateMachine) {
    return { 
        ...specStateMachine,
        data: {
            handlersContext: {
                config, // injects config property
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
 * creates a new instance of state machine specified in specStateMachine ^
 * 
 * @param {Object} data     - payload data
 * @param {String} key      - the cache key where state machine will store the payload data after each transition
 * @param {Object} config   - the additional configuration for transition handlers
 */
async function create(data, key, config) {
    const spec = injectHandlersContext(config, specStateMachine);
    return PSM.create(data, config.cache, key, config.logger, spec);
}


/**
 * loads state machine from cache by given key and specify the additional config for transition handlers
 * @param {String} key      - the cache key used to retrieve the state machine from cache
 * @param {Object} config   - the additional configuration for transition handlers
 */
async function loadFromCache(key, config) {
    const spec = injectHandlersContext(config, specStateMachine);
    return PSM.loadFromCache(config.cache, key, config.logger, spec, create);
}

module.exports = {
    create,
    loadFromCache
};