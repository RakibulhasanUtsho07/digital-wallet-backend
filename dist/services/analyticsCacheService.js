"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAnalyticsCache = exports.setCachedAnalytics = exports.getCachedAnalytics = void 0;
const cache = new Map();
const TTL_MS = {
    Today: 45 *
        1000,
    "7D": 2 *
        60 *
        1000,
    "30D": 5 *
        60 *
        1000,
    "90D": 10 *
        60 *
        1000,
    "1Y": 15 *
        60 *
        1000,
};
/*
 * This is best-effort process-local caching only.
 * On serverless/multi-instance deployments it is NOT a
 * correctness mechanism. MongoDB remains source-of-truth.
 */
const getCachedAnalytics = (range) => {
    const item = cache.get(range);
    if (!item) {
        return null;
    }
    if (Date.now() >
        item.expiresAt) {
        cache.delete(range);
        return null;
    }
    return item.value;
};
exports.getCachedAnalytics = getCachedAnalytics;
const setCachedAnalytics = (range, value) => {
    cache.set(range, {
        value,
        expiresAt: Date.now() +
            TTL_MS[range],
    });
};
exports.setCachedAnalytics = setCachedAnalytics;
const clearAnalyticsCache = (range) => {
    if (range) {
        cache.delete(range);
        return;
    }
    cache.clear();
};
exports.clearAnalyticsCache = clearAnalyticsCache;
