const { WSO2Auth } = require('@mojaloop/sdk-standard-components');

const createAuthClient = (conf, logger) => {
    const { wso2, outbound } = conf;

    const auth = new WSO2Auth({
        ...wso2.auth,
        logger,
        tlsCreds: outbound.tls.mutualTLS.enabled && outbound.tls.creds,
    });

    return Object.freeze({
        auth,
        retryWso2AuthFailureTimes: wso2.requestAuthFailureRetryTimes,
    });
};

module.exports = {
    createAuthClient,
};
