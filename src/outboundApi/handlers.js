/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

'use strict';


const Model = require('@internal/model').outboundTransfersModel;


/**
 * Handler for outbound transfer request initiation
 */
const postTransfers = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        let transferRequest = {
            ...ctx.request.body
        };

        // use the transfers model to execute asynchronous stages with the switch
        const model = new Model({
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            ...ctx.state.conf
        });

        // initialize the transfer model and start it running
        await model.initialize(transferRequest);
        const response = await model.run();

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch(err) {
        ctx.response.status = 500;
        ctx.response.body = {
            message: err.message || 'Unspecified error'
        };
    }
};



/**
 * Handler for resuming outbound transfers in scenarios where two-step transfers are enabled
 * by disabling the autoAcceptQuote SDK option
 */
const putTransfers = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        // use the transfers model to execute asynchronous stages with the switch
        const model = new Model({
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            ...ctx.state.conf
        });

        // load the transfer model from cache and start it running again
        await model.load(ctx.state.path.params.transferId);

        const response = await model.run();

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch(err) {
        ctx.state.logger.push({ err }).log('Error handling putTransfers');
        ctx.response.status = 500;
        ctx.response.body = {
            message: err.message || 'Unspecified error',
            transferState: err.transferState || {}
        };
    }
};


const healthCheck = async (ctx) => {
    ctx.response.status = 200;
    ctx.response.body = '';
};

module.exports = {
    map: {
        '/': {
            get: healthCheck
        },
        '/transfers': {
            post: postTransfers
        },
        '/transfers/{transferId}': {
            put: putTransfers
        }
    }
};
