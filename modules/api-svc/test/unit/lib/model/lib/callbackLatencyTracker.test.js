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

const { CallbackLatencyTracker, preRegister } = require('~/lib/model/lib/callbackLatencyTracker');

const HISTOGRAM_NAME = 'mojaloop_connector_callback_latency_seconds';
const GAUGE_NAME = 'mojaloop_connector_callback_pending_count';

const makeMetricsClient = () => {
    const histogram = { observe: jest.fn() };
    const gauge = { inc: jest.fn(), dec: jest.fn() };
    return {
        histogram,
        gauge,
        getHistogram: jest.fn(() => histogram),
        getGauge: jest.fn(() => gauge),
    };
};

describe('CallbackLatencyTracker Tests -->', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    describe('preRegister', () => {
        test('registers the histogram and gauge definitions with the given metrics client', () => {
            const metricsClient = makeMetricsClient();

            preRegister(metricsClient);

            expect(metricsClient.getHistogram).toHaveBeenCalledWith(
                HISTOGRAM_NAME,
                expect.any(String),
                expect.any(Array),
                ['operation', 'outcome'],
            );
            expect(metricsClient.getGauge).toHaveBeenCalledWith(GAUGE_NAME, expect.any(String));
        });

        test('is a no-op when no metrics client is supplied', () => {
            expect(() => preRegister(undefined)).not.toThrow();
        });
    });

    describe('constructor', () => {
        test('registers the same histogram/gauge definitions via the given metrics client', () => {
            const metricsClient = makeMetricsClient();

            new CallbackLatencyTracker({ metricsClient });

            expect(metricsClient.getHistogram).toHaveBeenCalledWith(
                HISTOGRAM_NAME,
                expect.any(String),
                expect.any(Array),
                ['operation', 'outcome'],
            );
            expect(metricsClient.getGauge).toHaveBeenCalledWith(GAUGE_NAME, expect.any(String));
        });

        test('does not throw when constructed with no metrics client (metrics disabled)', () => {
            expect(() => new CallbackLatencyTracker({})).not.toThrow();
            expect(() => new CallbackLatencyTracker()).not.toThrow();
        });
    });

    describe('start/complete', () => {
        test('increments the pending gauge on start and decrements it + records latency on complete', () => {
            const metricsClient = makeMetricsClient();
            const tracker = new CallbackLatencyTracker({ metricsClient });

            tracker.start('quotes', 'q1');
            expect(metricsClient.gauge.inc).toHaveBeenCalledTimes(1);
            expect(metricsClient.histogram.observe).not.toHaveBeenCalled();

            tracker.complete('quotes', 'q1', 'success');

            expect(metricsClient.gauge.dec).toHaveBeenCalledTimes(1);
            expect(metricsClient.histogram.observe).toHaveBeenCalledTimes(1);

            const [labels, value] = metricsClient.histogram.observe.mock.calls[0];
            expect(labels).toEqual({ operation: 'quotes', outcome: 'success' });
            expect(typeof value).toBe('number');
            expect(value).toBeGreaterThanOrEqual(0);
        });

        test('keys pending entries by operation+id, so the same id under different operations does not collide', () => {
            const metricsClient = makeMetricsClient();
            const tracker = new CallbackLatencyTracker({ metricsClient });

            tracker.start('quotes', 'shared-id');
            tracker.start('bulkQuotes', 'shared-id');
            tracker.complete('quotes', 'shared-id', 'success');

            expect(metricsClient.gauge.dec).toHaveBeenCalledTimes(1);
            expect(metricsClient.histogram.observe).toHaveBeenCalledWith(
                { operation: 'quotes', outcome: 'success' }, expect.any(Number),
            );

            tracker.complete('bulkQuotes', 'shared-id', 'error');
            expect(metricsClient.gauge.dec).toHaveBeenCalledTimes(2);
            expect(metricsClient.histogram.observe).toHaveBeenCalledWith(
                { operation: 'bulkQuotes', outcome: 'error' }, expect.any(Number),
            );
        });

        test('complete() is a no-op when there is no matching pending start() (already swept, or never started)', () => {
            const metricsClient = makeMetricsClient();
            const tracker = new CallbackLatencyTracker({ metricsClient });

            tracker.complete('quotes', 'never-started', 'success');

            expect(metricsClient.gauge.dec).not.toHaveBeenCalled();
            expect(metricsClient.histogram.observe).not.toHaveBeenCalled();
        });

        test('a second start() for the same operation/id clears the first pending entry instead of leaking it', () => {
            const metricsClient = makeMetricsClient();
            const tracker = new CallbackLatencyTracker({ metricsClient });

            tracker.start('quotes', 'dup');
            tracker.start('quotes', 'dup');

            expect(metricsClient.gauge.inc).toHaveBeenCalledTimes(2);
            expect(metricsClient.gauge.dec).toHaveBeenCalledTimes(1);

            tracker.complete('quotes', 'dup', 'success');
            expect(metricsClient.gauge.dec).toHaveBeenCalledTimes(2);
            expect(metricsClient.histogram.observe).toHaveBeenCalledTimes(1);
        });

        test('start()/complete() are no-ops when id is null or undefined', () => {
            const metricsClient = makeMetricsClient();
            const tracker = new CallbackLatencyTracker({ metricsClient });

            tracker.start('quotes', null);
            tracker.complete('quotes', null, 'success');
            tracker.start('quotes', undefined);
            tracker.complete('quotes', undefined, 'success');

            expect(metricsClient.gauge.inc).not.toHaveBeenCalled();
            expect(metricsClient.histogram.observe).not.toHaveBeenCalled();
        });

        test('start()/complete() are safe no-ops with no metrics client configured', () => {
            const tracker = new CallbackLatencyTracker({});

            expect(() => tracker.start('quotes', 'q1')).not.toThrow();
            expect(() => tracker.complete('quotes', 'q1', 'success')).not.toThrow();
        });

        test('sweeps a pending entry and records outcome "timeout" if complete() is never called before the TTL', () => {
            jest.useFakeTimers();
            const metricsClient = makeMetricsClient();
            const tracker = new CallbackLatencyTracker({ metricsClient, ttlMs: 1000 });

            tracker.start('parties', 'p1');
            jest.advanceTimersByTime(1000);

            expect(metricsClient.gauge.dec).toHaveBeenCalledTimes(1);
            expect(metricsClient.histogram.observe).toHaveBeenCalledWith(
                { operation: 'parties', outcome: 'timeout' }, expect.any(Number),
            );

            // a subsequent, late complete() call finds nothing left to record
            tracker.complete('parties', 'p1', 'success');
            expect(metricsClient.histogram.observe).toHaveBeenCalledTimes(1);
        });
    });

    describe('observe', () => {
        test('awaits the promise, records the given outcome, and returns the resolved value', async () => {
            const metricsClient = makeMetricsClient();
            const tracker = new CallbackLatencyTracker({ metricsClient });

            tracker.start('transfers', 't1');
            const result = await tracker.observe('transfers', 't1', 'success', Promise.resolve('the-response'));

            expect(result).toBe('the-response');
            expect(metricsClient.histogram.observe).toHaveBeenCalledWith(
                { operation: 'transfers', outcome: 'success' }, expect.any(Number),
            );
            expect(metricsClient.gauge.dec).toHaveBeenCalledTimes(1);
        });

        test('still records latency and rethrows when the wrapped promise rejects', async () => {
            const metricsClient = makeMetricsClient();
            const tracker = new CallbackLatencyTracker({ metricsClient });

            tracker.start('transfers', 't1');
            const err = new Error('switch unreachable');

            await expect(
                tracker.observe('transfers', 't1', 'error', Promise.reject(err))
            ).rejects.toThrow('switch unreachable');

            expect(metricsClient.histogram.observe).toHaveBeenCalledWith(
                { operation: 'transfers', outcome: 'error' }, expect.any(Number),
            );
            expect(metricsClient.gauge.dec).toHaveBeenCalledTimes(1);
        });

        test('works safely with no metrics client configured, still resolving/rejecting as normal', async () => {
            const tracker = new CallbackLatencyTracker({});

            await expect(tracker.observe('op', 'id', 'success', Promise.resolve(42))).resolves.toBe(42);
            await expect(
                tracker.observe('op', 'id', 'error', Promise.reject(new Error('boom')))
            ).rejects.toThrow('boom');
        });
    });
});
