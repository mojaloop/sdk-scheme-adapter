const http = require('http');

const Koa = require('koa');
const koaBody = require('koa-body');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const { Logger, Transports } = require('@internal/log');
const Cache = require('@internal/cache');

const Validate = require('@internal/validate');
const router = require('@internal/router');
const handlers = require('./handlers');
const middlewares = require('./middlewares');

class OutboundServer {
    constructor(conf) {
        this.conf = conf;
        this.api = null;
        this.server = null;
        this.logger = null;
    }

    async setupApi() {
        this.api = new Koa();
        this.logger = await this._createLogger();

        const cache = await this._createCache();
        await cache.connect();

        const specPath = path.join(__dirname, 'api.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        const validator = new Validate();
        await validator.initialise(apiSpecs);

        this.api.use(middlewares.createErrorHandler());

        // outbound always expects application/json
        this.api.use(koaBody());

        const sharedState = { cache, conf: this.conf };
        this.api.use(middlewares.createLogger(this.logger, sharedState));

        this.api.use(middlewares.createRequestValidator(validator));
        this.api.use(router(handlers.map));

        this.server = this._createServer();
    }

    async start() {
        await new Promise((resolve) => {
            this.server.listen(this.conf.outboundPort, () => {
                this.logger.log(`Serving outbound API on port ${this.conf.outboundPort}`);
                return resolve();
            });
        });
    }

    async stop() {
        if (this.server) {
            await new Promise(resolve => {
                this.server.close(() => {
                    console.log('outbound shut down complete');
                    return resolve();
                });
            });
        }
    }

    async _createCache() {
        const transports = await Promise.all([Transports.consoleDir()]);
        const logger = new Logger({
            context: {
                app: 'mojaloop-sdk-outboundCache'
            },
            space: this.conf.logIndent,
            transports,
        });

        const cacheConfig = {
            ...this.conf.cacheConfig,
            logger
        };

        return new Cache(cacheConfig);
    }

    async _createLogger() {
        const transports = await Promise.all([Transports.consoleDir()]);
        // Set up a logger for each running server
        return new Logger({
            context: {
                app: 'mojaloop-sdk-outbound-api'
            },
            space: this.conf.logIndent,
            transports,
        });
    }

    _createServer() {
        return http.createServer(this.api.callback());
    }
}

module.exports = OutboundServer;
