/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

const MatchRule = require('./MatchRule');
const Expression = require('./Expression');

class Query extends MatchRule {
    /**
     *
     * @param data {Object}
     * @param data.key {ExpressionData}
     * @param data.value {ExpressionData}
     */
    constructor(data) {
        super();
        this._rules = this._createRule(data);
    }

    _createRule(data) {
        return data.map(d => ({
            key: new Expression(d.key),
            value: new Expression(d.value),
        }));
    }

    _matchRule(rule, data) {
        for (const [key, value] of Object.entries(data)) {
            if (rule.key.match(key) && rule.value.match(value)) {
                return true;
            }
        }
        return false;
    }

    /**
     *
     * @param {Array.<Object>} data
     */
    match(data) {
        if (typeof data !== 'object') {
            throw new Error('data should be a query object');
        }

        if (!this._rules || this._rules.length === 0) {
            return false;
        }

        for (const rule of this._rules) {
            if (!this._matchRule(rule, data)) {
                return false;
            }
        }

        return true;
    }
}

module.exports = Query;
