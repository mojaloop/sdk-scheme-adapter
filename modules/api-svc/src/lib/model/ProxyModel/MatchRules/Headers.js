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
