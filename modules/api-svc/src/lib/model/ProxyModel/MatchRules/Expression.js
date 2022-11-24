/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

class Expression {
    /**
     *
     * @param data {string}
     */
    constructor(data) {
        if (typeof data !== 'string') {
            throw new Error('Invalid constructor parameters');
        }
        const ruleStr = data.trim();
        if (ruleStr.startsWith('~')) {
            let re = ruleStr.substr(1).trim();
            if (re === '*') {
                re = '.*';
            }
            this._rule = new RegExp(re, 'i');
        } else {
            this._rule = ruleStr.toLowerCase();
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
        if (typeof this._rule === 'string') {
            return this._rule === data.toLowerCase();
        } else {
            return this._rule.test(data);
        }
    }
}

module.exports = Expression;
