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
 * Eugen Klymniuk <eugen.klymniuk@infitx.com>

 --------------
 ******/

const { requests: { PingRequests }, Errors } = require('@mojaloop/sdk-standard-components');
const { Headers } = require('@mojaloop/central-services-shared').Enum.Http;
const { xHeaders, hopByHopHeaders, sensitiveHeaders } = require('./lib/shared');

class InboundPingModel {
    constructor(config) {
        this.logger = config.logger.push({ component: this.constructor.name });
        this.dfspId = config.dfspId;
        this.pingRequests = new PingRequests({
            logger: this.logger,
            peerEndpoint: config.peerEndpoint,
            pingEndpoint: config.pingEndpoint,
            dfspId: config.dfspId,
            tls: {
                enabled: config.outbound.tls.mutualTLS.enabled,
                creds: config.outbound.tls.creds,
            },
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey,
            // todo: think, if we need the rest
            oidc: config.oidc,
            resourceVersions: config.resourceVersions,
            apiType: config.apiType,
        });
    }

    async postPing({ jwsPingValidationResult, sourceFspId, body, headers }) {
        const { requestId } = body;
        const log = this.logger.child({ requestId, sourceFspId });
        log.debug('postPing...', { jwsPingValidationResult, headers });

        if (jwsPingValidationResult === true) {
            log.verbose('ping JWS validation passed, sending PUT ping callback...');
            return this.pingRequests.putPing({
                requestId,
                destination: sourceFspId,
                headers: this.#createCallbackHeaders(headers),
            });
        }

        const errInfo = this.#createPingError(jwsPingValidationResult);
        log.info('ping JWS validation failed, sending PUT ping error callback...', { errInfo });
        return this.pingRequests.putPingError({
            requestId,
            destination: sourceFspId,
            headers: this.#createCallbackHeaders(headers),
            errInfo
        });
    }

    #createPingError(jwsPingValidationResult, destination) {
        const cause = jwsPingValidationResult || new Error('JWS validationKeys are not provided');
        const errMessage = 'error on JWS ping validation';
        const fspiopError = new Errors.MojaloopFSPIOPError(
            cause,
            errMessage,
            destination,
            Errors.MojaloopApiErrorCodes.VALIDATION_ERROR
        );
        this.logger.warn(`${errMessage}: ${cause.message}`);

        return fspiopError.toApiErrorObject();
    }

    #createCallbackHeaders(headers) {
        const cleanedHeaders = this.#cleanupIncomingHeaders(headers);
        return {
            ...cleanedHeaders,
            [Headers.FSPIOP.DESTINATION]: headers[Headers.FSPIOP.SOURCE],
            [Headers.FSPIOP.SOURCE]: this.dfspId
        };
    }

    #cleanupIncomingHeaders(headers) {
        const cleanedHeaders = { ...headers };
        // prettier-ignore
        [
            ...sensitiveHeaders,
            ...hopByHopHeaders,
            ...xHeaders,
        ].forEach((header) => {
            delete cleanedHeaders[header];
        });

        return cleanedHeaders;
    }

}

module.exports = InboundPingModel;
