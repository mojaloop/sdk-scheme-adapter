class BackendError extends Error {
    constructor(msg, httpStatusCode) {
        super(msg);
        this.httpStatusCode = httpStatusCode;
    }
}

module.exports = {
    BackendError,
};
