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
class InMemoryCache {
    /**
     * @param {string} opts.clientKey Customer Key
     * @param {String} opts.clientSecret Customer Secret
     */
    constructor({ clientKey : clientId, clientSecret }) {
        this.clients = [{
            clientId,
            clientSecret,
            grants: [
                'client_credentials'
            ],
            redirectUris : []
        }];
        this.tokens = [];
    }

    getAccessToken(token) {
        const tokens = this.tokens.filter(savedToken =>
            savedToken.accessToken === token
        );

        return tokens[0];
    }

    getClient(clientId, clientSecret) {
        const clients = this.clients.filter(client =>
            client.clientId === clientId && client.clientSecret === clientSecret
        );

        return clients[0];
    }

    saveToken(token, client, user) {
        token.client = {
            id: client.clientId
        };

        token.user = {
            id: user.username || user.clientId
        };

        this.tokens.push(token);

        return token;
    }

    /*
     * Method used only by client_credentials grant type.
     */
    getUserFromClient(client) {
        const clients = this.clients.filter(savedClient =>
            savedClient.clientId === client.clientId && savedClient.clientSecret === client.clientSecret
        );

        return clients[0];
    }
}

module.exports.InMemoryCache = InMemoryCache;
