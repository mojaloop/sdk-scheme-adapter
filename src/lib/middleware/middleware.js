/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *  Rajiv Mothilal - rajiv.mothilal@modusbox.com                          *
 **************************************************************************/

'use strict';

const EventSdk = require('@mojaloop/event-sdk');

/**
 * Creates a span and adds it to the request headers
 * @return {Function}
 */
const createSpan = handlerMap => async (ctx, next) => {
    const handlers = handlerMap[ctx.request.url];
    const id = handlers ? handlers[ctx.request.method.toLowerCase()].id : undefined;
    if (ctx.request && id) {
        const context = EventSdk.Tracer.extractContextFromHttpRequest(ctx.request);
        const spanName = id;
        let span;
        if (context) {
            span = EventSdk.Tracer.createChildSpanFromContext(spanName, context);
        } else {
            span = EventSdk.Tracer.createSpan(spanName);
        }
        ctx.request.span = span;
    }
    await next();
};

/**
 * Closes span in the request header
 * @return {Function}
 */
const finishSpan = () => async (ctx) => {
    const span = ctx.request.span;
    const response = ctx.request.response;
    if (span) {
        if (response instanceof Error) {
            let state;
            if (response.output.payload.errorInformation && response.output.payload.errorInformation.errorCode) {
                state = new EventSdk.EventStateMetadata(EventSdk.EventStatusType.failed, response.output.payload.errorInformation.errorCode, response.output.payload.errorInformation.errorDescription);
            } else {
                state = new EventSdk.EventStateMetadata(EventSdk.EventStatusType.failed, response.output.statusCode, response.message);
            }
            span.error(response, state);
            span.finish(response.message, state);
        } else {
            span.finish();
        }
    }
};

module.exports = {
    createSpan,
    finishSpan
};
