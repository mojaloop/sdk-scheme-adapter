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


module.exports = handlerMap => async (ctx, next) => {
    const handlers = handlerMap[ctx.state.path.pattern];
    const handler = handlers ? handlers[ctx.method.toLowerCase()] : undefined;
    if (!handlers || !handler) {
        ctx.state.logger.log('No handler found');
        ctx.response.status = 404;
        // TODO: response content according to API spec. Should probably actually be a 404 here.
        ctx.response.body = { statusCode: 404, message: 'Not found' };
    }
    else {
        ctx.state.logger.push({ handler }).log('Found handler');
        await handler(ctx);
    }
    await next();
};
