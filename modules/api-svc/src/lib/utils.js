const { WSO2Auth } = require('@mojaloop/sdk-standard-components');

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

const transformIsoHeader = (headerValue, headerKey) => {
    if (headerKey.toLowerCase() === 'content-type' || headerKey.toLowerCase() === 'accept') {
        return headerValue.replace('.iso20022', '');
    }
    return headerValue;
};

const transformHeadersIsoToFspiop = (isoHeaders) => {
    const headersToTransform = ['content-type', 'accept'];
    const fspiopHeaders = {};

    Object.keys(isoHeaders).forEach((key) => {
        fspiopHeaders[key] = headersToTransform.includes(key.toLowerCase())
            ? transformIsoHeader(isoHeaders[key], key)
            : isoHeaders[key];
    });

    return fspiopHeaders;
};

module.exports = {
    createAuthClient,
    transformHeadersIsoToFspiop
};
