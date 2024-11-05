const ISO_20022_HEADER_PART = 'iso20022';

const API_TYPES = Object.freeze({
    fspiop: 'fspiop',
    iso20022: 'iso20022',
});

const ONLY_FSPIOP_RESOURCES = [
    'authorizations',
    // 'bulkQuotes',
    // 'bulkTransfers',
    'transactionRequests',
];
// todo: think about bulkQuotes/bulkTransfers

const SDK_LOGGER_HIERARCHY = ['verbose', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'];

module.exports = {
    API_TYPES,
    ISO_20022_HEADER_PART,
    ONLY_FSPIOP_RESOURCES,
    SDK_LOGGER_HIERARCHY,
};
