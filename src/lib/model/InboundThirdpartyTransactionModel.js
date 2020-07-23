/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Sridhar Voruganti - sridhar.voruganti@modusbox.com               *
 **************************************************************************/

'use strict';

const {
    BackendRequests,
    HTTPResponseError,
} = require('@internal/requests');

const {
    MojaloopRequests,
    Errors,
} = require('@mojaloop/sdk-standard-components');

const shared = require('@internal/shared');

/**
 *  Models the operations required for inbound third party transaction requests
 */
class InboundThirdpartyTransactionModel {
    constructor(config) {
        this._logger = config.logger;
        this._dfspId = config.dfspId;

        this._mojaloopRequests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            alsEndpoint: config.alsEndpoint,
            quotesEndpoint: config.quotesEndpoint,
            transfersEndpoint: config.transfersEndpoint,
            dfspId: config.dfspId,
            tls: config.tls,
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey,
            wso2Auth: config.wso2Auth
        });

        this._backendRequests = new BackendRequests({
            logger: this._logger,
            backendEndpoint: config.backendEndpoint,
            dfspId: config.dfspId
        });
    }

    /**
     * Queries the backend API to get the authorization details and makes a 
     * callback to the originator with the result
     */
    async postAuthorizations(authorizationsReq, sourceFspId) {
        try {
            //Converts a mojaloop authorizationsReq data to internal form
            const internalForm = shared.mojaloopAuthorizationsReqToInternal(authorizationsReq);

            // make a call to the backend to ask for a authorizations response
            const response = await this._backendRequests.getSignedChallenge(internalForm);
            if (!response) {
                // make an error callback to the source fsp
                return 'No response from backend';
            }
            // project our internal authorizations reponse into mojaloop response form
            const mojaloopResponse = shared.internalAuthorizationsResponseToMojaloop(response);
            // make a callback to the source fsp with the party info
            return this._mojaloopRequests.putAuthorizations(authorizationsReq.transactionRequestId, mojaloopResponse, sourceFspId);
        }
        catch (err) {
            this._logger.push({ err }).log('Error in postAuthorizations');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return await this._mojaloopRequests.putAuthorizationsError(authorizationsReq.transactionRequestId, mojaloopError, sourceFspId);
        }
    }

    async _handleError(err) {
        let mojaloopErrorCode = Errors.MojaloopApiErrorCodes.INTERNAL_SERVER_ERROR;
        if (err instanceof HTTPResponseError) {
            const e = err.getData();
            if(e.res && (e.res.body || e.res.data)) {
                if(e.res.body) {
                    try {
                        const bodyObj = JSON.parse(e.res.body);
                        mojaloopErrorCode = Errors.MojaloopApiErrorCodeFromCode(`${bodyObj.statusCode}`);
                    } catch(ex) {
                        // do nothing
                        this._logger.push({ ex }).log('Error parsing error message body as JSON');
                    }
        
                } else if(e.res.data) {
                    mojaloopErrorCode = Errors.MojaloopApiErrorCodeFromCode(`${e.res.data.statusCode}`);
                }
            }
        }
        return new Errors.MojaloopFSPIOPError(err, null, null, mojaloopErrorCode).toApiErrorObject();
    }
}

module.exports = InboundThirdpartyTransactionModel;
