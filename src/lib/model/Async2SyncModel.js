/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2021 - All rights reserved.               *
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
const deferredJob = require('@internal/shared/deferredJob');

function generate({
    /**
     * @name channelNameMethod
     * @description generates the pub/sub channel name
     * @param {object} args     - the arguments passed as object, same as passed to `run, triggerDeferredJob, generateKey` method
     * @returns {string} - the pub/sub channel name
     */
    channelNameMethod,

    /**
     * @name requestActionMethod
     * @description invokes the call to switch
     * @param {object} requests - MojaloopRequests instance
     * @param {array} args - the arguments passed as object to `run` method
     */
    requestActionMethod,

    /**
     * @name argsValidationMethod
     * @description makes validation of args object, invoked in `run, triggerDeferredJob, generateKey` methods to ensure everything is going well
     * @param {object} requests - MojaloopRequests instance
     * @param {array} args - the arguments passed as object to `run` method
     */
    argsValidationMethod,

    // the name of the model, used for logging
    modelName
}) {


    const specStateMachine = {
        init: 'start',
        transitions: [
            { name: 'init', from: 'none', to: 'start' },
            { name: 'requestAction', from: 'start', to: 'succeeded' },
            { name: 'error', from: '*', to: 'errored' },
        ],
        methods: {
            // workflow methods
            run,
            getResponse,

            // specific transitions handlers methods
            onRequestAction
        }
    };

    /**
     * @name run
     * @description run the workflow logic
     * @param {arguments} args - arguments 
     * @returns {Object} - the http response payload
     */
    async function run(args) {
        // input validation, it should throws if any of args is invalid
        argsValidationMethod(args);

        const { data, logger } = this.context;
        try {
            // run transitions based on incoming state
            switch (data.currentState) {
                case 'start':
                    // the first transition is requestAction
                    await this.requestAction(args);
                    // don't await to finish the save
                    this.saveToCache();
        
                // eslint-disable-next-line no-fallthrough
                case 'succeeded':
                    // all steps complete so return
                    logger.log('Action called successfully');
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    logger.log('State machine in errored state');
                    return;
            }
        } catch (err) {
            logger.log(`Error running ${modelName} model: ${util.inspect(err)}`);

            // as this function is recursive, we don't want to error the state machine multiple times
            if (data.currentState !== 'errored') {
                // err should not have a requestActionState property here!
                if (err.requestActionState) {
                    logger.log('State machine is broken');
                }
                // transition to errored state
                await this.error(err);

                // avoid circular ref between requestActionState.lastError and err
                err.requestActionState = JSON.parse(JSON.stringify(this.getResponse()));
            }
            throw err;
        }
    }

    const mapCurrentState = {
        start: 'WAITING_FOR_ACTION',
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
        if (!resp.currentState) {
            logger.error(`${modelName} model response being returned from an unexpected state: ${data.currentState}. Returning ERROR_OCCURRED state`);
            resp.currentState = mapCurrentState.errored;
        }

        return resp;
    }
    /**
     * @name onRequestAction
     * @description generates the pub/sub channel name
     * @param {string} type     - the party type
     * @param {string} id       - the party id
     * @param {string} [subId]  - the optional party subId
     * @returns {string} - the pub/sub channel name
     */
    async function onRequestAction(fsm, args) {
        const { cache, logger } = this.context;
        const { requests, config } = this.handlersContext;
        logger.push({ args }).log('onRequestAction - arguments');
        
        return deferredJob(cache, channelNameMethod(args))
            .init(async (channel) => {
                const res = await requestActionMethod(requests, args);
                logger.push({ res, channel, args }).log('RequestAction call sent to peer, listening on response');
                return res;
            })
            .job((message) => {
                this.context.data = {
                    ...message,
                    currentState: this.state
                };
                logger.push({ message }).log('requestActionMethod message received');
            })
            .wait(config.requestProcessingTimeoutSeconds * 1000);
    }


    /**
     * 
     * @param {object} cache - the cache instance used to publish message
     * @param {object} message  - the message used to trigger deferred job
     * @param {object} args - args passed to channelNameMethod
     * @returns {Promise} - the promise which resolves when deferred job is invoked
     */
    function triggerDeferredJob({ cache, message, args }) {
        // input validation, it should throws if any of args is invalid
        argsValidationMethod(args);

        const cn = channelNameMethod(args);
        return deferredJob(cache, cn).trigger(message);
    }

    /**
     * @name generateKey
     * @description generates the cache key used to store state machine
     * @param {object} args - args passed to channelNameMethod

     * @returns {string} - the cache key
     */
    function generateKey(args) {
        // input validation, it should throws if any of args is invalid
        argsValidationMethod(args);

        return `key-${channelNameMethod(args)}`;
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
                    modelName,
                    config: { ...config }, // injects config property
                    requests: new MojaloopRequests({
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


    return {
        channelName: channelNameMethod,
        triggerDeferredJob,
        create,
        generateKey,
        loadFromCache,

        // exports for testing purposes
        mapCurrentState
    };
}

module.exports = {
    generate
};

