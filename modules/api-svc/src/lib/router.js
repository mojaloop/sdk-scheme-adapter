/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Matt Kingston - matt.kingston@modusbox.com                       *
 **************************************************************************/

'use strict';

const { Enum } = require('@mojaloop/central-services-shared');
const { ReturnCodes } = Enum.Http;

module.exports = (handlerMap) => async (ctx, next) => {
    const handlers = handlerMap[ctx.state.path.pattern];
    const handler = handlers ? handlers[ctx.method.toLowerCase()] : undefined;
    if (!handlers || !handler) {
        ctx.state.logger.isErrorEnabled && ctx.state.logger.error('No handler found');
        ctx.response.status = ReturnCodes.NOTFOUND.CODE;
        // TODO: response content according to API spec. Should probably actually be a 404 here.
        ctx.response.body = { statusCode: 404, message: 'Not found' };
    }
    else {
        if (!ctx.state.logExcludePaths.includes(ctx.path)) {
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({handler}).debug('Found handler');
        }
        await handler(ctx);
    }
    await next();
};
