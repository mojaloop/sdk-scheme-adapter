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

// Single source of truth for these two metrics, shared by the eager preRegister() call
// and the lazy per-instance construction below so the two definitions can't drift apart.
const HISTOGRAM_DEF = {
    name: 'mojaloop_connector_callback_latency_seconds',
    help: 'Time from receiving an inbound FSPIOP request to dispatching its resulting async callback to the switch',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    labelNames: ['operation', 'outcome'],
};
const GAUGE_DEF = {
    name: 'mojaloop_connector_callback_pending_count',
    help: 'Number of inbound FSPIOP requests currently awaiting dispatch of their outbound callback',
};

// Set above BackendRequests' own 65s HTTP timeout, so a hung backend call trips this
// sweep instead of leaking a pending entry forever.
const DEFAULT_TTL_MS = 70_000;

/**
 * Registers the histogram/gauge at process startup, so they appear on /metrics before
 * the first inbound request lazily constructs a CallbackLatencyTracker.
 */
const preRegister = (metricsClient) => {
    metricsClient?.getHistogram(HISTOGRAM_DEF.name, HISTOGRAM_DEF.help, HISTOGRAM_DEF.buckets, HISTOGRAM_DEF.labelNames);
    metricsClient?.getGauge(GAUGE_DEF.name, GAUGE_DEF.help);
};

/**
 * Correlates an inbound FSPIOP request (by quoteId/transferId/etc) with the outbound
 * async callback it eventually produces, and records the elapsed time between the two.
 */
class CallbackLatencyTracker {
    constructor({ metricsClient, ttlMs = DEFAULT_TTL_MS } = {}) {
        this._ttlMs = ttlMs;
        this._pending = new Map();

        this._histogram = metricsClient?.getHistogram(
            HISTOGRAM_DEF.name, HISTOGRAM_DEF.help, HISTOGRAM_DEF.buckets, HISTOGRAM_DEF.labelNames,
        );
        this._pendingGauge = metricsClient?.getGauge(GAUGE_DEF.name, GAUGE_DEF.help);
    }

    /**
     * Call as soon as the correlation id (quoteId/transferId/etc) is known for an inbound
     * request that is expected to eventually produce an outbound callback to the switch.
     */
    start(operation, id) {
        if (!this._histogram || id == null) {
            return;
        }
        const key = `${operation}:${id}`;
        // A duplicate/retried request for the same id replaces the prior timer rather than
        // leaking it.
        this._clear(key);
        const startedAt = process.hrtime.bigint();
        const timer = setTimeout(() => {
            this._pending.delete(key);
            this._pendingGauge?.dec();
            this._observe(operation, 'timeout', startedAt);
        }, this._ttlMs);
        timer.unref?.();
        this._pending.set(key, { startedAt, timer });
        this._pendingGauge?.inc();
    }

    /**
     * Awaits a callback-dispatch promise and records latency + outcome once it settles,
     * whether it resolves or throws (e.g. the switch itself is unreachable).
     */
    async observe(operation, id, outcome, promise) {
        try {
            return await promise;
        } finally {
            this.complete(operation, id, outcome);
        }
    }

    /**
     * Call at each point an outbound callback is actually dispatched for a previously
     * start()-ed id - both success and error/failure dispatch paths.
     */
    complete(operation, id, outcome) {
        if (!this._histogram || id == null) {
            return;
        }
        const key = `${operation}:${id}`;
        const entry = this._pending.get(key);
        if (!entry) {
            // Already swept by the TTL timer, or start() was never called (e.g. metrics
            // were disabled when the request came in) - nothing to record.
            return;
        }
        clearTimeout(entry.timer);
        this._pending.delete(key);
        this._pendingGauge?.dec();
        this._observe(operation, outcome, entry.startedAt);
    }

    _clear(key) {
        const existing = this._pending.get(key);
        if (existing) {
            clearTimeout(existing.timer);
            this._pending.delete(key);
            this._pendingGauge?.dec();
        }
    }

    _observe(operation, outcome, startedAt) {
        const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
        this._histogram.observe({ operation, outcome }, elapsedSeconds);
    }
}

module.exports = { CallbackLatencyTracker, preRegister };
