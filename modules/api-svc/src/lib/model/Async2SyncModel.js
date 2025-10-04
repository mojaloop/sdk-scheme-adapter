/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 * Modusbox
 - Paweł Marzec <pawel.marzec@modusbox.com>
 --------------
 ******/
'use strict';
const safeStringify = require('fast-safe-stringify');
const PSM = require('./common').PersistentStateMachine;
const { SDKStateEnum } = require('./common');
const MojaloopRequests = require('@mojaloop/sdk-standard-components').MojaloopRequests;
const deferredJob = require('./lib').deferredJob;

function generate({
    /**
     * @name channelNameMethod
     * @description generates the pub/sub channel name
     * @param {object} args - the arguments passed as object, same as passed to `run, triggerDeferredJob, generateKey` method
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

    /**
     * @name reformatMessageMethod
     * @description reformats message received from PUB/SUB channel, it is optional method, if not specified identify function is used by default
     * @param {object} message - message received
     * @returns {object} - reformatted message
     */
    reformatMessageMethod,

    // the name of the model, used for logging
    modelName
}) {

    // don't reformat message if method not specified
    const reformatMessage = reformatMessageMethod || ((m) => m);

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
                    logger.isDebugEnabled && logger.debug('Action called successfully');
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    logger.isErrorEnabled && logger.error('State machine in errored state');
                    return;
            }
        } catch (err) {
            logger.isErrorEnabled && logger.error(`Error running ${modelName} model: ${safeStringify(err)}`);

            // as this function is recursive, we don't want to error the state machine multiple times
            if (data.currentState !== 'errored') {
                // err should not have a requestActionState property here!
                if (err.requestActionState) {
                    logger.isDebugEnabled && logger.debug('State machine is broken');
                }
                // transition to errored state
                await this.error(err);

                // avoid circular ref between requestActionState.lastError and err
                err.requestActionState = structuredClone(this.getResponse());
            }
            throw err;
        }
    }

    const mapCurrentState = {
        start: SDKStateEnum.WAITING_FOR_ACTION,
        succeeded: SDKStateEnum.COMPLETED,
        errored: SDKStateEnum.ERROR_OCCURRED
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
            logger.isErrorEnabled && logger.error(`${modelName} model response being returned from an unexpected state: ${data.currentState}. Returning ERROR_OCCURRED state`);
            resp.currentState = mapCurrentState.errored;
        }

        return resp;
    }
    /**
     * @name onRequestAction
     * @description generates the pub/sub channel name
     * @param {object} args - the arguments passed as object
     * @returns {string} - the pub/sub channel name
     */
    async function onRequestAction(fsm, args) {
        const { cache, logger } = this.context;
        const { requests, config } = this.handlersContext;
        logger.isDebugEnabled && logger.push({ args }).debug('onRequestAction - arguments');

        return deferredJob(cache, channelNameMethod(args))
            .init(async (channel) => {
                const res = await requestActionMethod(requests, args);
                logger.isDebugEnabled && logger.push({ res, channel, args }).debug('RequestAction call sent to peer, listening on response');
                return res;
            })
            .job((message) => {
                this.context.data = {
                    ...reformatMessage(message),
                    currentState: this.state
                };
                logger.isDebugEnabled && logger.push({ message }).debug('requestActionMethod message received');
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
    async function triggerDeferredJob({ cache, message, args }) {
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
                        quotesEndpoint: config.quotesEndpoint,
                        transfersEndpoint: config.transfersEndpoint,
                        transactionRequestsEndpoint: config.transactionRequestsEndpoint,
                        dfspId: config.dfspId,
                        tls: {
                            enabled: config.outbound.tls.mutualTLS.enabled,
                            creds: config.outbound.tls.creds,
                        },
                        jwsSign: config.jwsSign,
                        jwsSignPutParties: config.jwsSignPutParties,
                        jwsSigningKey: config.jwsSigningKey,
                        oidc: config.oidc,
                        apiType: config.apiType
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

