/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

const { Path, Query, Headers } = require('./MatchRules');

class Route {
    /**
     *
     * @param data {Object}
     */
    constructor(data) {
        this._route = this._createRoutes(data);
    }

    /**
     *
     * @param matchData {Object}
     * @returns {Object}
     * @private
     */
    _createMatchRule(matchData) {
        return {
            ...matchData.path && {
                path: new Path(matchData.path),
            },
            ...matchData.query && {
                query: new Query(matchData.query),
            },
            ...matchData.headers && {
                headers: new Headers(matchData.headers),
            },
        };
    }

    /**
     *
     * @param route {Object}
     * @returns {{matchRules: [], destination: string}}
     * @private
     */
    _createRoutes(route) {
        const matchRules = [];
        for (const matchData of route.match) {
            matchRules.push(this._createMatchRule(matchData));
        }
        return {
            matchRules,
            destination: route.destination.path,
        };
    }

    _matchRule(request, matchRule) {
        for (const [ruleName, ruleValue] of Object.entries(matchRule)) {
            if (!ruleValue.match(request[ruleName])) {
                return false;
            }
        }
        return true;
    }

    matchRequest(request) {
        for (const matchRule of this._route.matchRules) {
            if (this._matchRule(request, matchRule)) {
                return true;
            }
        }
        return false;
    }

    get destination() {
        return this._route.destination;
    }
}

module.exports = Route;
