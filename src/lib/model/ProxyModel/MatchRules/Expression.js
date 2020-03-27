/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

/**
 * @typedef ComplexExpressionData
 * @type {object}
 * @property {string} regexp
 */

/**
 * @typedef {(string|ComplexExpressionData)} ExpressionData
 */

class Expression {
    /**
     *
     * @param data {Object|string}
     * @param data.regexp {string}
     */
    constructor(data) {
        if (typeof data === 'string') {
            this._rule = new RegExp(`^${data}$`, 'i');
        } else if (typeof data === 'object' && typeof data.regexp === 'string') {
            this._rule = new RegExp(data.regexp, 'i');
        } else {
            throw new Error('Invalid constructor parameters');
        }
    }

    /**
     *
     * @param data {string}
     */
    match(data) {
        if (typeof data !== 'string') {
            throw new Error('data should be string');
        }
        return this._rule.test(data);
    }
}

module.exports = Expression;
