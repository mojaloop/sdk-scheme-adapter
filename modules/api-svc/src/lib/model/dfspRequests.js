const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');

module.exports = class DfspRequests extends MojaloopRequests {
    dfsp(id) {
        if (!id) {
            return this;
        }
        return {
            ...this,
            _buildHeaders(...params) {
                const result = super._buildHeaders(...params);
                if (result['fspiop-source']) result['fspiop-source'] = id;
                return result;
            }
        };
    }
};
