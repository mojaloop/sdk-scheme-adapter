/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 * Modusbox
 - Yevhen Kyriukha - <yevhen.kyriukha@modusbox.com>
 --------------
 ******/
const { Path, Query, Headers } = require('./MatchRules');

class Route {
    /**
     *
     * @param data {Object}
     */
    constructor(data) {
        this._route = this._createRoute(data);
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
    _createRoute(route) {
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
