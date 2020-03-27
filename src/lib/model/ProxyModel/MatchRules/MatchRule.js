/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

class MatchRule {
    constructor() {
        if (this.constructor === MatchRule) {
            throw new TypeError('Can not construct MatchRule abstract class.');
        }
        if (this.match === MatchRule.prototype.match) {
            throw new TypeError('Please implement abstract method match.');
        }
    }

    match() {
        throw new TypeError('Do not call abstract method match from child.');
    }

}

module.exports = MatchRule;
