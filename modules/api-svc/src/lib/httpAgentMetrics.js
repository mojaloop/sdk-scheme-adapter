/*****
 License
 --------------
 Copyright © 2020-2026 Mojaloop Foundation
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
 - Name Surname <name.surname@mojaloop.io>
 - Shashikant Hirugade <shashi.mojaloop@gmail.com>

 --------------
 ******/
'use strict';

const PrometheusClient = require('prom-client');

// Keyed by `${label}-http` / `${label}-https`; a module-level singleton so agents
// recreated on config hot-reload replace the entry instead of re-registering the metric.
const watched = new Map();

let gauge;

// https.Agent's pool key (Object.keys(agent.sockets)) appends raw TLS option values -
// including mTLS cert/key material - after the host:port. Only the leading host:port
// segment is safe to expose as a label.
const sanitizeHostLabel = (rawKey) => {
    if (typeof rawKey !== 'string' || rawKey.length === 0) {
        return 'unknown';
    }
    const [host, port] = rawKey.split(':');
    if (!host) {
        return 'unknown';
    }
    return port ? `${host}:${port}` : host;
};

const collectAgent = (metric, label, agent) => {
    // Multiple raw keys can sanitize to the same host:port, so counts are summed per
    // sanitized label rather than re-set per raw key.
    const counts = new Map(); // sanitizedHost -> { active, free, pending }

    const tally = (state, rawMap) => {
        Object.entries(rawMap || {}).forEach(([rawKey, list]) => {
            const host = sanitizeHostLabel(rawKey);
            const entry = counts.get(host) || { active: 0, free: 0, pending: 0 };
            entry[state] += list?.length || 0;
            counts.set(host, entry);
        });
    };

    tally('active', agent.sockets);
    tally('free', agent.freeSockets);
    tally('pending', agent.requests);

    counts.forEach((entry, host) => {
        metric.set({ agent: label, host, state: 'active' }, entry.active);
        metric.set({ agent: label, host, state: 'free' }, entry.free);
        metric.set({ agent: label, host, state: 'pending' }, entry.pending);
    });
};

const ensureGauge = () => {
    if (!gauge) {
        gauge = new PrometheusClient.Gauge({
            name: 'mojaloop_connector_http_agent_sockets',
            help: 'Outbound HTTP agent connection pool socket counts by agent, target host and state (active|free|pending)',
            labelNames: ['agent', 'host', 'state'],
            collect() {
                watched.forEach(({ agent }, label) => collectAgent(this, label, agent));
            },
        });
    }
    return gauge;
};

/**
 * Registers an http.Agent/https.Agent pair for connection-pool metrics collection.
 * Safe to call repeatedly for the same label (e.g. after a hot-reload recreates the
 * agents) - the latest agent instance simply replaces the previous one.
 *
 * @param {string} label - identifies the agent pool, e.g. 'backend' or 'mojaloop'
 * @param {{ httpAgent?: object, httpsAgent?: object }} agents
 */
const watchAgents = (label, agents = {}) => {
    ensureGauge();
    if (agents.httpAgent) {
        watched.set(`${label}-http`, { agent: agents.httpAgent });
    }
    if (agents.httpsAgent) {
        watched.set(`${label}-https`, { agent: agents.httpsAgent });
    }
};

module.exports = {
    watchAgents,
};
