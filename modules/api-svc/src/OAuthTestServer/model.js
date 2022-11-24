/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

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
