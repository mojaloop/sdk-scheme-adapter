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
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/
'use strict';

const http = require('http');
const Koa = require('koa');
const koaBody = require('koa-body').default;
const PrometheusClient = require('prom-client');


/**
  * A utility class that abstracts the underlying metrics implementation (Prometheus)
  * from the consumer. This may be premature if Prometheus is never swapped out...but
  * who can tell what the Universe will bring us.
  *
  * This object exposes methods for getting different types of measurement construct
  * in order for consuming code to record metrics. The constructs are quite tightly
  * coupled to Prometheus view of metrics, although that is fairly abstract so the
  * risk appears low that this will cause conflicts in future.
  *
  * The metrics client is intended to be used as a singleton in a process and keeps a
  * 'per name' cache of metrics to avoid duplicates. Not sure if this is strictly
  * necessary but I dont have time to dig into the prom-client code to see what
  * happens if you create the same metric twice.
  */
class MetricsClient {
    constructor() {
        this._prometheusRegister = PrometheusClient.register;
        this._metrics = {};

        this._counterPrefix = 'cntr_';
        this._histogramPrefix = 'hist_';
        this._gaugePrefix = 'gage_';
    }


    getHistogram(name, description, buckets) {
        const metricName = `${this._histogramPrefix}${name}`;

        let conf = {
            name: name,
            help: description,
        };

        if(buckets) {
            conf.buckets = buckets;
        }

        if(!this._metrics[metricName]) {
            this._metrics[metricName] = new PrometheusClient.Histogram(conf);
        }

        return this._metrics[metricName];
    }


    getCounter(name, description) {
        const metricName = `${this._counterPrefix}${name}`;

        if(!this._metrics[metricName]) {
            this._metrics[metricName] = new PrometheusClient.Counter({
                name: name,
                help: description
            });
        }

        return this._metrics[metricName];
    }


    getGauge(name, description) {
        const metricName = `${this._counterPrefix}${name}`;

        if(!this._metrics[metricName]) {
            this._metrics[metricName] = new PrometheusClient.Gauge({
                name: name,
                help: description
            });
        }

        return this._metrics[metricName];
    }
}


/**
  * Exposes an HTTP endpoint for metrics to be scraped by some external daemon
  */
class MetricsServer {
    /**
      * @param {number} port metrics server listen port
      * @param {Logger} logger SdkLogger
      * @param {Object} prometheusClient Prometheus client instance
      */
    constructor({ port, logger }) {
        this._port = port;
        this._logger = logger.push({ component: this.constructor.name });
        this._prometheusClient = PrometheusClient;
        this._prometheusRegister = PrometheusClient.register;
        this._api = this.setupApi();
        this._server = http.createServer(this._api.callback());
    }

    async start() {
        if (this._server.listening) {
            return;
        }
        this._prometheusClient.collectDefaultMetrics({
            prefix: 'mojaloop_connector_default_'
        });

        await new Promise((resolve) => this._server.listen(this._port, resolve));
        this._logger.isInfoEnabled && this._logger.push({ port: this._port }).info('Serving Metrics');
    }

    async stop() {
        await new Promise(resolve => this._server.close(resolve));
        this._logger.isInfoEnabled && this._logger.info('Metrics Server shut down complete');
    }

    setupApi() {
        const result = new Koa();

        result.use(koaBody());
        result.use(async ctx => {
            ctx.response.set('Content-Type', this._prometheusRegister.contentType);
            ctx.response.body = await this._prometheusRegister.metrics();
        });

        return result;
    }
}


module.exports = {
    MetricsServer,
    MetricsClient
};
