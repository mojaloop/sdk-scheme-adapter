const { WSO2Auth } = require('@mojaloop/sdk-standard-components');
const { API_TYPES, ISO_20022_HEADER_PART } = require('../constants');

const createAuthClient = (conf, logger) => {
    const { wso2, outbound } = conf;

    const auth = new WSO2Auth({
        ...wso2.auth,
        logger,
        tlsCreds: wso2.mTlsEnabled && outbound.tls.creds,
    });

    return Object.freeze({
        auth,
        retryWso2AuthFailureTimes: wso2.requestAuthFailureRetryTimes,
    });
};

// think a better way of detecting API_TYPE of inbound request
const isIsoApi = (headers = {}) => headers['content-type']?.includes(ISO_20022_HEADER_PART);

const defineInboundApiType = (headers) => isIsoApi(headers)
    ? API_TYPES.iso20022
    : API_TYPES.fspiop;

module.exports = {
    createAuthClient,
    isIsoApi,
    defineInboundApiType,
};
