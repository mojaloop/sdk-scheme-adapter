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

const METRIC_NAME = 'mojaloop_connector_http_agent_sockets';

const makeAgent = ({ sockets = {}, freeSockets = {}, requests = {} } = {}) => ({
    sockets,
    freeSockets,
    requests,
});

describe('httpAgentMetrics Tests -->', () => {
    let watchAgents;
    let promClient;

    beforeEach(() => {
        // Fresh module + fresh prom-client from the same resetModules() generation, so the
        // gauge registers against the same registry these assertions read from.
        jest.resetModules();
        promClient = require('prom-client');
        ({ watchAgents } = require('~/lib/httpAgentMetrics'));
    });

    const getMetric = async () => {
        const metrics = await promClient.register.getMetricsAsJSON();
        return metrics.find(m => m.name === METRIC_NAME);
    };

    const getValue = (values, labels) => values.find(
        v => Object.entries(labels).every(([k, val]) => v.labels[k] === val)
    )?.value;

    test('registers a gauge with the expected name/type/labels on first use', async () => {
        watchAgents('backend', { httpAgent: makeAgent() });

        const metric = await getMetric();

        expect(metric).toBeDefined();
        expect(metric.type).toBe('gauge');
        expect(metric.help).toEqual(expect.any(String));
    });

    test('reports active/free/pending socket counts per agent and host', async () => {
        const agent = makeAgent({
            sockets: { 'host1:443': [{}, {}] },
            freeSockets: { 'host1:443': [{}] },
            requests: { 'host1:443': [{}, {}, {}] },
        });
        watchAgents('backend', { httpAgent: agent });

        const { values } = await getMetric();

        expect(getValue(values, { agent: 'backend-http', host: 'host1:443', state: 'active' })).toBe(2);
        expect(getValue(values, { agent: 'backend-http', host: 'host1:443', state: 'free' })).toBe(1);
        expect(getValue(values, { agent: 'backend-http', host: 'host1:443', state: 'pending' })).toBe(3);
    });

    test('tracks http and https agents for the same label as distinct series', async () => {
        watchAgents('mojaloop', {
            httpAgent: makeAgent({ sockets: { 'a:80': [{}] } }),
            httpsAgent: makeAgent({ sockets: { 'a:443': [{}, {}] } }),
        });

        const { values } = await getMetric();

        expect(getValue(values, { agent: 'mojaloop-http', host: 'a:80', state: 'active' })).toBe(1);
        expect(getValue(values, { agent: 'mojaloop-https', host: 'a:443', state: 'active' })).toBe(2);
    });

    test('sanitizes raw pool keys down to host:port, dropping any TLS option material Node appends', async () => {
        const rawKeyWithCreds = 'switch.example.com:443::::-----BEGIN CERTIFICATE-----FAKE-----END CERTIFICATE-----';
        const agent = makeAgent({ sockets: { [rawKeyWithCreds]: [{}] } });
        watchAgents('mojaloop', { httpsAgent: agent });

        const { values } = await getMetric();

        const hosts = values.map(v => v.labels.host);
        expect(hosts).toContain('switch.example.com:443');
        expect(hosts.some(h => h.includes('CERTIFICATE'))).toBe(false);
    });

    test('sums counts from multiple raw keys that sanitize to the same host:port', async () => {
        const agent = makeAgent({
            sockets: {
                'host1:443:certA': [{}],
                'host1:443:certB': [{}, {}],
            },
        });
        watchAgents('backend', { httpAgent: agent });

        const { values } = await getMetric();

        expect(getValue(values, { agent: 'backend-http', host: 'host1:443', state: 'active' })).toBe(3);
    });

    test('falls back to "unknown" for an empty or hostless raw key', async () => {
        const agent = makeAgent({ sockets: { '': [{}], ':443': [{}] } });
        watchAgents('backend', { httpAgent: agent });

        const { values } = await getMetric();

        expect(getValue(values, { agent: 'backend-http', host: 'unknown', state: 'active' })).toBe(2);
    });

    test('replaces the previously watched agent for a label rather than accumulating both', async () => {
        watchAgents('backend', { httpAgent: makeAgent({ sockets: { 'old-host:443': [{}] } }) });
        watchAgents('backend', { httpAgent: makeAgent({ sockets: { 'new-host:443': [{}, {}] } }) });

        const { values } = await getMetric();

        expect(getValue(values, { host: 'old-host:443' })).toBeUndefined();
        expect(getValue(values, { agent: 'backend-http', host: 'new-host:443', state: 'active' })).toBe(2);
    });

    test('does not throw when called with no agents, and reports no series for that label', async () => {
        expect(() => watchAgents('empty-label', {})).not.toThrow();

        const metric = await getMetric();
        const hasEmptyLabelSeries = metric?.values.some(v => v.labels.agent?.startsWith('empty-label')) ?? false;
        expect(hasEmptyLabelSeries).toBe(false);
    });
});
