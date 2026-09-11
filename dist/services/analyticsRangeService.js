"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnalyticsBuckets = exports.getAnalyticsDateWindow = exports.parseAnalyticsRange = exports.ANALYTICS_RANGES = void 0;
const DAY_MS = 24 *
    60 *
    60 *
    1000;
exports.ANALYTICS_RANGES = [
    "Today",
    "7D",
    "30D",
    "90D",
    "1Y",
];
const parseAnalyticsRange = (value) => {
    if (typeof value ===
        "string" &&
        exports.ANALYTICS_RANGES.includes(value)) {
        return value;
    }
    return "7D";
};
exports.parseAnalyticsRange = parseAnalyticsRange;
const getAnalyticsDateWindow = (range, now = new Date()) => {
    let start;
    if (range ===
        "Today") {
        start =
            new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    }
    else {
        const days = range ===
            "7D"
            ? 7
            : range ===
                "30D"
                ? 30
                : range ===
                    "90D"
                    ? 90
                    : 365;
        start =
            new Date(now.getTime() -
                days *
                    DAY_MS);
    }
    const end = new Date(now);
    const duration = Math.max(1, end.getTime() -
        start.getTime());
    const previousEnd = new Date(start.getTime());
    const previousStart = new Date(previousEnd.getTime() -
        duration);
    return {
        start,
        end,
        previousStart,
        previousEnd,
    };
};
exports.getAnalyticsDateWindow = getAnalyticsDateWindow;
const createAnalyticsBuckets = (range, start, end, bucketCount = 7) => {
    const safeCount = Math.max(1, Math.min(12, Math.floor(bucketCount)));
    const totalMs = Math.max(1, end.getTime() -
        start.getTime());
    const size = totalMs /
        safeCount;
    return Array.from({
        length: safeCount,
    }, (_, index) => {
        const bucketStart = new Date(start.getTime() +
            size *
                index);
        const bucketEnd = index ===
            safeCount -
                1
            ? new Date(end)
            : new Date(start.getTime() +
                size *
                    (index +
                        1));
        let label;
        if (range ===
            "Today") {
            label =
                bucketStart.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    hour12: true,
                });
        }
        else if (range ===
            "7D") {
            label =
                bucketStart.toLocaleDateString("en-US", {
                    weekday: "short",
                });
        }
        else if (range ===
            "1Y") {
            label =
                bucketStart.toLocaleDateString("en-US", {
                    month: "short",
                    year: "2-digit",
                });
        }
        else {
            label =
                bucketStart.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                });
        }
        return {
            start: bucketStart,
            end: bucketEnd,
            label,
        };
    });
};
exports.createAnalyticsBuckets = createAnalyticsBuckets;
