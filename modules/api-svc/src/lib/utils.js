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

module.exports = {
    createAuthClient,
};
