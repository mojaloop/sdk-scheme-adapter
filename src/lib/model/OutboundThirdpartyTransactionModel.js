/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Sridhar Voruganti - sridhar.voruganti@modusbox.com               *
 **************************************************************************/

'use strict';

const util = require('util');
const { uuid } = require('uuidv4');
const PSM = require('./common').PersistentStateMachine;
const ThirdpartyRequests = require('@mojaloop/sdk-standard-components').ThirdpartyRequests;


const specStateMachine = {
    transitions: [
        { name: 'getThirdPartyTransaction', from: 'getTransaction', to: 'transactionSuccess' },
        { name: 'postThirdPartyTransaction', from: 'postTransaction', to: 'transactionSuccess' },
        { name: 'error', from: '*', to: 'errored' },
    ],
    methods: {
        // workflow methods
        run,
        getResponse,

        // specific transitions handlers methods
        onGetThirdPartyTransaction,
        onPostThirdPartyTransaction
    }
};

const mapCurrentState = {
    getTransaction: 'WAITING',
    postTransaction: 'WAITING',
    transactionSuccess: 'COMPLETED',
    errored: 'ERROR_OCCURRED'
};

function notificationChannel(id) {
    // mvp validation
    if (!(id && id.toString().length > 0)) {
        throw new Error('OutboundThirdpartyTransactionModel.notificationChannel: \'id\' parameter is required');
    }

    // channel name
    return `3ptrxnreq_${id}`;
}

async function publishNotifications(cache, id, value) {
    const channel = notificationChannel(id);
    return cache.publish(channel, value);
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
                requests:  new ThirdpartyRequests({
                    logger: config.logger,
                    peerEndpoint: config.peerEndpoint,
                    alsEndpoint: config.alsEndpoint,
                    quotesEndpoint: config.quotesEndpoint,
                    transfersEndpoint: config.transfersEndpoint,
                    transactionRequestsEndpoint: config.transactionRequestsEndpoint,
                    dfspId: config.dfspId,
                    tls: config.outbound.tls,
                    jwsSign: config.jwsSign,
                    jwsSignPutParties: config.jwsSignPutParties,
                    jwsSigningKey: config.jwsSigningKey,
                    wso2: config.wso2,
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

    if(!data.hasOwnProperty('transactionRequestId')) {
        data.transactionRequestId = uuid();
    }

    const spec = injectHandlersContext(config, specStateMachine);
    return PSM.create(data, config.cache, key, config.logger, spec);
}


/**
 * loads state machine from cache by given key and specify the additional config for transition handlers
 * @param {String} key      - the cache key used to retrieve the state machine from cache
 * @param {Object} config   - the additional configuration for transition handlers
 */
async function loadFromCache(key, config) {
    const customCreate = async (data, cache, key /**, logger, stateMachineSpec **/) => create(data, key, config);
    return PSM.loadFromCache(config.cache, key, config.logger, specStateMachine, customCreate);
}

/**
 * runs the workflow
 */
async function run() {
    const { data, logger } = this.context;
    try {
        // run transitions based on incoming state
        switch(data.currentState) {
            case 'getTransaction':
                await this.getThirdPartyTransaction();
                logger.log(`GET Thirdparty transaction requested for ${data.transactionRequestId},  currentState: ${data.currentState}`);
                break;

            case 'postTransaction':
                await this.postThirdPartyTransaction();
                logger.log(`POST Thirdparty transaction requested for ${data.transactionRequestId},  currentState: ${data.currentState}`);
                break;

            case 'transactionSuccess':
                // all steps complete so return
                logger.log('ThirdpartyTransaction completed successfully');
                return this.getResponse();

            case 'errored':
                // stopped in errored state
                logger.log('State machine in errored state');
                return;
        }

        logger.log(`Thirdparty request model state machine transition completed in state: ${this.state}. Recursing to handle next transition.`);
        return this.run();

    } catch (err) {
        logger.log(`Error running ThirdPartyTransaction model: ${util.inspect(err)}`);

        // as this function is recursive, we don't want to error the state machine multiple times
        if(data.currentState !== 'errored') {
            // err should not have a transactionState property here!
            if(err.transactionState) {
                logger.log('State machine is broken');
            }
            // transition to errored state
            await this.error(err);

            // avoid circular ref between transactionState.lastError and err
            err.transactionState = JSON.parse(JSON.stringify(this.getResponse()));
        }
        throw err;
    }
}

async function onGetThirdPartyTransaction() {
    const { data, cache, logger } = this.context;
    const { requests } = this.handlersContext;
    const transferKey = notificationChannel(data.transactionRequestId);
    let subId;

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        try {

            subId = await cache.subscribe(transferKey, (cn, message, subId) => {
                try {
                    const parsed = JSON.parse(message);
                    this.context.data = {
                        ...parsed.data,
                        currentState: this.state
                    };
                    resolve();
                } catch(err) {
                    reject(err);
                } finally {
                    if(subId) {
                        cache.unsubscribe(subId);
                    }
                }
            });

            // Not sure what should be the destination FSP so using null for now.
            const res = await requests.getThirdpartyRequestsTransactions(data.transactionRequestId, null);
            logger.push({ res }).log('Thirdparty transaction request sent to peer');

        } catch(error) {
            logger.push(error).error('GET thirdparty transaction request error');
            if(subId) {
                cache.unsubscribe(subId);
            }
            reject(error);
        }
    });
}

async function onPostThirdPartyTransaction() {
    const { data, cache, logger } = this.context;
    const { requests } = this.handlersContext;
    const transferKey = notificationChannel(data.transactionRequestId);
    let subId;

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        try {

            subId = await cache.subscribe(transferKey, (cn, message, subId) => {
                try {
                    const parsed = JSON.parse(message);
                    this.context.data = {
                        ...parsed.data,
                        currentState: this.state
                    };
                    resolve();
                } catch(err) {
                    reject(err);
                } finally {
                    if(subId) {
                        cache.unsubscribe(subId);
                    }
                }
            });

            const request = {
                ...data
            };

            // Request is routed to switch and then to the payer's fsp.
            const res = await requests.postThirdpartyRequestsTransactions(request, data.payer.partyIdInfo.fspId);
            logger.push({ res }).log('Thirdparty transaction request sent to peer');

        } catch(error) {
            logger.push(error).error('GET thirdparty transaction request error');
            if(subId) {
                cache.unsubscribe(subId);
            }
            reject(error);
        }
    });
}

/**
 * Returns an object representing the final state of the transaction request suitable for the outbound API
 *
 * @returns {object} - Response representing the result of the transaction request process
 */
function getResponse() {
    const { data, logger } = this.context;
    let resp = { ...data };

    // project some of our internal state into a more useful
    // representation to return to the SDK API consumer
    resp.currentState = mapCurrentState[data.currentState];

    // handle unexpected state
    if(!resp.currentState) {
        logger.log(`OutboundThirdpartyTransaction model response being returned from an unexpected state: ${data.currentState}. Returning ERROR_OCCURRED state`);
        resp.currentState = mapCurrentState.errored;
    }

    return resp;
}

module.exports = {
    create,
    loadFromCache,
    notificationChannel,
    publishNotifications,

    // exports for testing purposes
    mapCurrentState
};
