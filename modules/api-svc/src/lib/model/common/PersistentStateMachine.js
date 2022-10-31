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
const StateMachine = require('javascript-state-machine');

async function saveToCache() {
    const { data, cache, key, logger } = this.context;
    try {
        const res = await cache.set(key, data);
        logger.push({ res }).log(`Persisted model in cache: ${key}`);
    }
    catch(err) {
        logger.push({ err }).log(`Error saving model: ${key}`);
        throw err;
    }
}

async function onAfterTransition(transition) {
    const { logger } = this.context;
    logger.log(`State machine transitioned '${transition.transition}': ${transition.from} -> ${transition.to}`);
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
        logger.push({ cache: data }).log('data loaded from cache');

        // use delegation to allow customization of 'create'
        const createPSM = optCreate || create;
        return createPSM(data, cache, key, logger, stateMachineSpec);
    }
    catch(err) {
        logger.push({ err }).log(`Error loading data: ${key}`);
        throw err;
    }
}

module.exports = {
    loadFromCache,
    create
};
