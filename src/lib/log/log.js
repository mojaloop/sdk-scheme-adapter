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


// An immutable structured logger. It uses JSON.stringify to
// stringify any arguments.
// TODO: either make this callable, or remove this text. See https://stackoverflow.com/questions/36871299/how-to-extend-function-with-es6-classes
// It is callable, such that:
//   (new require('./log'))('stuff I want logged');
// will print:
//   { "msg": "stuff I want logged" }
//
// JSON.stringify blocks the event loop. At the time of writing, performance/responsiveness were
// not requirements of this module. If this is later required, see the discussion here for
// solutions: https://nodejs.org/en/docs/guides/dont-block-the-event-loop/. This may necessitate
// either a print queue, or a print sequence number to help identify print order. This could be
// optional in the constructor options.

// This logger could be considered immutable for the following two reasons. However, it could
// retain that property and simply return a new logger from a 'pop' or 'replace' method.
// 1) At the time of writing, this class does not implement any mechanism to remove any logging
//    context. This was a conscious decision to enable better reasoning about logging. "This logger is
//    derived from that logger, therefore the context must be a non-strict superset of the context
//    of the parent logger". However, this is something of an experiment, and at some time in the
//    future may be considered an impediment, or redundant, and the aforementioned mechanism (e.g.
//    a pop method) may be added.
// 2) No 'replace' method (or method for overwriting logged context) has been implemented. This is
//    for the same reason no 'pop' method has been implemented.

// TODO:
// - support log levels? just support conditional logging? (i.e. if the .level property is "in
//   {x,y,z}" then log)
// - just call the logger to add a message property and log that- pass all arguments to util.format
// - support logging to a single line
// - support 'verbose', 'debug', 'warn', 'error', 'trace', 'info', 'fatal' methods?
// - support env var config?

// TODO:
// Is it possible to pretty-print log messages or strings containing new-line characters? For
// example, instead of printing the '\n' characters in a stack-trace, actually printing the
// new-line characters. Is that possible and/or worthwhile?

const util = require('util');

const contextSym = Symbol('Logger context symbol');


const replaceOutput = (key, value) => {
    if (value instanceof Error) {
        return Object.getOwnPropertyNames(value).reduce((acc, key) => ({ ...acc, [key]: value[key] }), {});
    }
    if (value instanceof RegExp) {
        return value.toString();
    }
    if (value instanceof Function) {
        return `[Function: ${value.name || 'anonymous'}]`;
    }
    return value;
};


class Logger {
    // space
    //   String | Number
    //   The default formatting to be supplied to the JSON.stringify method. Examples include the
    //   string '\t' to indent with a tab and the number 4 to indent with four spaces. The default,
    //   undefined, will not break lines.
    //   See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#Parameters
    // printTimestamp
    //   Boolean
    //   Whether to print a timestamp.
    // timestampFmt
    //   Function
    //   A function that accepts a Date object and produces a timestamp string.
    // transports
    //   Array of functions
    //   Each function will be supplied with arguments (String msg, Date timestamp) for each log
    //   event.
    // context
    //   Object
    //   Context data to preload in the logger. Example: { path: '/users', method: 'GET' }
    //   This logger and all loggers derived from it (with the push method) will print this context
    //   If any reserved keys exist in the new object, an error will be thrown.
    constructor({
        context = {},
        space,
        printTimestamp = true,
        timestampFmt = ts => ts.toISOString(),
        transports = []
    } = {}) {
        this.opts = {};
        this.configure({ space, printTimestamp, timestampFmt });
        if (this.opts.printTimestamp && 'timestamp' in context) {
            throw new Error('\'timestamp\' is a reserved logger key when providing \'timestamp: true\' to the constructor');
        }
        if ('msg' in context) {
            throw new Error('\'msg\' is a reserved logger key');
        }
        this.opts.transports = transports;
        this[contextSym] = context;
    }

    // Update logger configuration.
    // opts
    //   Object. May contain any of .space, .printTimestamp, .timestampFmt
    //   See constructor comment for details
    configure(opts) {
        // TODO: check whether printTimestamp has gone from false to true, and whether the
        // timestamp key exists in our context
        // TODO: should we check whether a timestamp format function has been provided, but
        // printtimestamp has been set to false?
        this.opts = { ...this.opts, ...opts };
    }

    // space
    //   String | Number
    //   The default formatting to be supplied to the JSON.stringify method. Examples include the
    //   string '\t' to indent with a tab and the number 4 to indent with four spaces. The default,
    //   undefined, will not break lines.
    setSpace(space) {
        this.space = space;
    }

    // Create a new logger with the same context as the current logger, and additionally any
    // supplied context.
    // context
    //   An object to log. Example: { path: '/users', method: 'GET' }
    //   If a key in this object already exists in this logger, an error will be thrown.
    push(context) {
        if (!context) {
            return new Logger({ ...this.opts, context: this[contextSym] });
        }
        // Check none of the new context replaces any of the old context
        if (-1 !== Object.keys(context).findIndex(k => Object.keys(this[contextSym]).findIndex(l => l === k) !== -1)) {
            throw new Error('Key already exists in logger');
        }
        return new Logger({ ...this.opts, context: { ...this[contextSym], ...context } });
    }

    // Log to transports.
    // args
    //   Any type is acceptable. All arguments will be passed to util.format, then printed as the
    //   'msg' property of the logged item.
    async log(...args) {
        // NOTE: if printing large strings, JSON.stringify will block the event loop. This, and
        // solutions, are discussed here:
        // https://nodejs.org/en/docs/guides/dont-block-the-event-loop/.
        // At the time of writing, this was considered unlikely to be a problem, as this
        // implementation did not have any performance requirements
        const msg = args.length > 0 ? util.format(...args) : undefined;
        const ts = new Date();
        let output;
        if (this.opts.printTimestamp) {
            output = JSON.stringify({ ...this[contextSym], msg, timestamp: this.opts.timestampFmt(ts) }, replaceOutput, this.opts.space);
        } else {
            output = JSON.stringify({ ...this[contextSym], msg }, replaceOutput, this.opts.space);
        }
        await Promise.all(this.opts.transports.map(t => t(output, ts)));
    }
}


module.exports = {
    Logger,
    Transports: require('./transports')
};
