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

class Headers extends MatchRule {
    /**
     *
     * @param data {Object}
     * @param data.name {ExpressionData}
     * @param data.value {ExpressionData}
     */
    constructor(data) {
        super();
        this._rules = this._createRule(data);
    }

    _createRule(data) {
        return data.map(d => ({
            name: new Expression(d.name),
            value: new Expression(d.value),
        }));
    }

    _matchRule(rule, data) {
        for (const [name, value] of Object.entries(data)) {
            if (rule.name.match(name) && rule.value.match(value)) {
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
            throw new Error('data should be header object');
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

module.exports = Headers;
