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
const StateMachine = require('javascript-state-machine');

async function saveToCache() {
    const { data, cache, key, logger } = this.context;
    try {
        const res = await cache.set(key, data);
        logger.isDebugEnabled && logger.push({ res }).debug(`Persisted model in cache: ${key}`);
    }
    catch(err) {
        logger.isErrorEnabled && logger.push({ error: err }).error(`Error saving model: ${key}`);
        throw err;
    }
}

async function onAfterTransition(transition) {
    const { logger } = this.context;
    logger.isDebugEnabled && logger.debug(`State machine transitioned '${transition.transition}': ${transition.from} -> ${transition.to}`);
    this.context.data.currentState = transition.to;
}

function onPendingTransition(transition) {
    // allow transitions to 'error' state while other transitions are in progress
    if(transition !== 'error') {
        throw new Error(`Transition '${transition}' requested while another transition is in progress.`);
    }
}

async function create(data, cache, key, logger, stateMachineSpec ) {
    let initState = stateMachineSpec.init || 'init';

    if(!data.hasOwnProperty('currentState')) {
        data.currentState = initState;
    } else {
        initState = stateMachineSpec.init = data.currentState;
    }

    stateMachineSpec.data = Object.assign(
        stateMachineSpec.data || {},
        {
            context: {
                data, cache, key, logger
            }
        }
    );

    stateMachineSpec.methods = Object.assign(
        stateMachineSpec.methods || {},
        {
            onAfterTransition,
            onPendingTransition,
            saveToCache
        }
    );

    const stateMachine = new StateMachine(stateMachineSpec);
    await stateMachine[initState];
    return stateMachine;
}


async function loadFromCache(cache, key, logger, stateMachineSpec, optCreate) {
    try {
        const data = await cache.get(key);
        if(!data) {
            throw new Error(`No cached data found for: ${key}`);
        }
        logger.isDebugEnabled && logger.push({ cache: data }).debug('data loaded from cache');

        // use delegation to allow customization of 'create'
        const createPSM = optCreate || create;
        return createPSM(data, cache, key, logger, stateMachineSpec);
    }
    catch(err) {
        logger.isErrorEnabled &&logger.push({ error: err }).error(`Error loading data: ${key}`);
        throw err;
    }
}

module.exports = {
    loadFromCache,
    create
};
