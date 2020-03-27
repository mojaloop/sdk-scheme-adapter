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

class Path extends MatchRule {
    /**
     *
     * @param data {ExpressionData}
     */
    constructor(data) {
        super();
        this._rule = new Expression(data);
    }

    /**
     *
     * @param data {string}
     */
    match(data) {
        if (typeof data !== 'string') {
            throw new Error('data should be string');
        }
        return this._rule.match(data);
    }
}

module.exports = Path;
