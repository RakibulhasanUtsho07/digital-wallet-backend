"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDynamicAnomalies = exports.getOperationalHeatmap = exports.getSystemLogSummary = exports.getServiceHealth = exports.rangeStart = exports.rangeToMs = void 0;
const SystemLog_js_1 = require("../models/SystemLog.js");
/* =========================================================
   RANGE
========================================================= */
const rangeToMs = (range) => {
    switch (range) {
        case "1h":
            return (60 *
                60 *
                1000);
        case "6h":
            return (6 *
                60 *
                60 *
                1000);
        case "7d":
            return (7 *
                24 *
                60 *
                60 *
                1000);
        case "30d":
            return (30 *
                24 *
                60 *
                60 *
                1000);
        case "24h":
        default:
            return (24 *
                60 *
                60 *
                1000);
    }
};
exports.rangeToMs = rangeToMs;
const rangeStart = (range) => {
    return new Date(Date.now() -
        (0, exports.rangeToMs)(range));
};
exports.rangeStart = rangeStart;
const serviceCategory = {
    API: "Core",
    Authentication: "Core",
    Database: "Data",
    Wallet: "Finance",
    Transactions: "Finance",
    Transfers: "Finance",
    KYC: "Compliance",
    Notifications: "Communication",
    Cloudinary: "Storage",
    AI: "Security",
    System: "Operations",
    Security: "Security",
};
const statusFromMetrics = (errorRate, responseTimeMs) => {
    if (errorRate >=
        20) {
        return "Down";
    }
    if (errorRate >=
        5 ||
        responseTimeMs >=
            1000) {
        return "Degraded";
    }
    if (errorRate >=
        1 ||
        responseTimeMs >=
            400) {
        return "Warning";
    }
    return "Operational";
};
const getServiceHealth = async (range = "24h") => {
    const start = (0, exports.rangeStart)(range);
    const rows = await SystemLog_js_1.SystemLog.aggregate([
        {
            $match: {
                timestamp: {
                    $gte: start,
                },
            },
        },
        {
            $group: {
                _id: "$service",
                requestCount: {
                    $sum: 1,
                },
                errorCount: {
                    $sum: {
                        $cond: [
                            {
                                $in: [
                                    "$level",
                                    [
                                        "ERROR",
                                        "CRITICAL",
                                    ],
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                avgDurationMs: {
                    $avg: "$durationMs",
                },
                lastSeenAt: {
                    $max: "$timestamp",
                },
            },
        },
        {
            $sort: {
                requestCount: -1,
            },
        },
    ]);
    const lastErrors = await SystemLog_js_1.SystemLog.find({
        timestamp: {
            $gte: start,
        },
        level: {
            $in: [
                "ERROR",
                "CRITICAL",
            ],
        },
    })
        .sort({
        timestamp: -1,
    })
        .select("service event")
        .lean();
    const lastErrorByService = new Map();
    for (const log of lastErrors) {
        if (!lastErrorByService.has(log.service)) {
            lastErrorByService.set(log.service, log.event);
        }
    }
    return rows.map((row) => {
        const errorRate = row.requestCount >
            0
            ? (row.errorCount /
                row.requestCount) *
                100
            : 0;
        const average = Math.max(0, Math.round(row.avgDurationMs ??
            0));
        const observedSuccessRate = Math.max(0, Math.min(100, 100 -
            errorRate));
        return {
            id: row._id
                .toLowerCase()
                .replace(/\s+/g, "-"),
            name: row._id,
            category: serviceCategory[row._id] ??
                "Platform",
            status: statusFromMetrics(errorRate, average),
            /*
             * This is an observed success ratio, not true
             * infrastructure uptime. Keeping the existing
             * frontend field name for compatibility.
             */
            uptime: `${observedSuccessRate.toFixed(2)}%`,
            responseTimeMs: average,
            errorRate: `${errorRate.toFixed(2)}%`,
            requestCount: row.requestCount
                .toLocaleString("en-US"),
            lastError: lastErrorByService.get(row._id) ??
                "None in selected range",
            observedSuccessRate,
            lastSeenAt: row.lastSeenAt
                ?.toISOString() ??
                null,
        };
    });
};
exports.getServiceHealth = getServiceHealth;
/* =========================================================
   SUMMARY
========================================================= */
const getSystemLogSummary = async (range = "24h") => {
    const start = (0, exports.rangeStart)(range);
    const [totalEvents, errorEvents, warningEvents, criticalEvents, services, latestLog,] = await Promise.all([
        SystemLog_js_1.SystemLog.countDocuments({
            timestamp: {
                $gte: start,
            },
        }),
        SystemLog_js_1.SystemLog.countDocuments({
            timestamp: {
                $gte: start,
            },
            level: {
                $in: [
                    "ERROR",
                    "CRITICAL",
                ],
            },
        }),
        SystemLog_js_1.SystemLog.countDocuments({
            timestamp: {
                $gte: start,
            },
            level: "WARN",
        }),
        SystemLog_js_1.SystemLog.countDocuments({
            timestamp: {
                $gte: start,
            },
            level: "CRITICAL",
        }),
        (0, exports.getServiceHealth)(range),
        SystemLog_js_1.SystemLog.findOne({
            timestamp: {
                $gte: start,
            },
        })
            .sort({
            timestamp: -1,
        })
            .select("timestamp")
            .lean(),
    ]);
    const servicePenalty = services.reduce((total, service) => {
        switch (service.status) {
            case "Down":
                return (total +
                    12);
            case "Degraded":
                return (total +
                    5);
            case "Warning":
                return (total +
                    2);
            default:
                return total;
        }
    }, 0);
    const eventPenalty = totalEvents >
        0
        ? Math.min(20, (errorEvents /
            totalEvents) *
            100 *
            1.5)
        : 0;
    const healthScore = Math.max(0, Math.min(100, 100 -
        servicePenalty -
        eventPenalty));
    return {
        range,
        healthScore: Number(healthScore.toFixed(1)),
        totalEvents,
        errorEvents,
        warningEvents,
        criticalEvents,
        servicesObserved: services.length,
        servicesNeedingAttention: services.filter((service) => service.status !==
            "Operational").length,
        lastUpdatedAt: latestLog
            ?.timestamp
            ?.toISOString() ??
            null,
    };
};
exports.getSystemLogSummary = getSystemLogSummary;
/* =========================================================
   HEATMAP
========================================================= */
const getOperationalHeatmap = async (range = "7d") => {
    const start = (0, exports.rangeStart)(range);
    const rows = await SystemLog_js_1.SystemLog.aggregate([
        {
            $match: {
                timestamp: {
                    $gte: start,
                },
            },
        },
        {
            $project: {
                day: {
                    $isoDayOfWeek: "$timestamp",
                },
                hour: {
                    $hour: "$timestamp",
                },
                isError: {
                    $cond: [
                        {
                            $in: [
                                "$level",
                                [
                                    "ERROR",
                                    "CRITICAL",
                                ],
                            ],
                        },
                        1,
                        0,
                    ],
                },
            },
        },
        {
            $project: {
                day: 1,
                hourBucket: {
                    $multiply: [
                        {
                            $floor: {
                                $divide: [
                                    "$hour",
                                    4,
                                ],
                            },
                        },
                        4,
                    ],
                },
                isError: 1,
            },
        },
        {
            $group: {
                _id: {
                    day: "$day",
                    hourBucket: "$hourBucket",
                },
                events: {
                    $sum: 1,
                },
                errors: {
                    $sum: "$isError",
                },
            },
        },
        {
            $sort: {
                "_id.day": 1,
                "_id.hourBucket": 1,
            },
        },
    ]);
    const dayNames = [
        "",
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat",
        "Sun",
    ];
    return rows.map((row) => {
        const errorRate = row.events >
            0
            ? (row.errors /
                row.events) *
                100
            : 0;
        const severity = errorRate >=
            10
            ? "failure"
            : errorRate >=
                3
                ? "warning"
                : row.events >=
                    20
                    ? "active"
                    : "normal";
        return {
            day: dayNames[row._id
                .day] ??
                "Unknown",
            hour: `${String(row._id
                .hourBucket).padStart(2, "0")}:00`,
            events: row.events,
            errors: row.errors,
            severity,
        };
    });
};
exports.getOperationalHeatmap = getOperationalHeatmap;
const getWindowStats = async (from, to) => {
    const rows = await SystemLog_js_1.SystemLog.aggregate([
        {
            $match: {
                timestamp: {
                    $gte: from,
                    $lt: to,
                },
            },
        },
        {
            $group: {
                _id: "$service",
                count: {
                    $sum: 1,
                },
                errors: {
                    $sum: {
                        $cond: [
                            {
                                $in: [
                                    "$level",
                                    [
                                        "ERROR",
                                        "CRITICAL",
                                    ],
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                avgDuration: {
                    $avg: "$durationMs",
                },
            },
        },
    ]);
    return rows.map((row) => ({
        service: row._id,
        count: row.count,
        errors: row.errors,
        avgDuration: Math.round(row.avgDuration ??
            0),
    }));
};
const getDynamicAnomalies = async (windowMinutes = 60) => {
    const safeWindow = Math.max(5, Math.min(windowMinutes, 24 *
        60));
    const now = new Date();
    const currentStart = new Date(now.getTime() -
        safeWindow *
            60 *
            1000);
    const baselineStart = new Date(currentStart.getTime() -
        safeWindow *
            60 *
            1000);
    const [current, baseline,] = await Promise.all([
        getWindowStats(currentStart, now),
        getWindowStats(baselineStart, currentStart),
    ]);
    const baselineMap = new Map(baseline.map((item) => [
        item.service,
        item,
    ]));
    const anomalies = current.flatMap((item) => {
        const previous = baselineMap.get(item.service);
        if (!previous) {
            return [];
        }
        const currentErrorRate = item.count >
            0
            ? (item.errors /
                item.count) *
                100
            : 0;
        const baselineErrorRate = previous.count >
            0
            ? (previous.errors /
                previous.count) *
                100
            : 0;
        const errorDelta = currentErrorRate -
            baselineErrorRate;
        const latencyChangePct = previous.avgDuration >
            0
            ? ((item.avgDuration -
                previous.avgDuration) /
                previous.avgDuration) *
                100
            : 0;
        const entries = [];
        if (errorDelta >=
            5 ||
            (currentErrorRate >=
                2 &&
                currentErrorRate >=
                    baselineErrorRate *
                        1.5)) {
            entries.push({
                service: item.service,
                type: "error_rate",
                severity: errorDelta >=
                    10
                    ? "high"
                    : "medium",
                changePct: Number(errorDelta.toFixed(2)),
                current: Number(currentErrorRate.toFixed(2)),
                baseline: Number(baselineErrorRate.toFixed(2)),
                message: "Observed error rate increased against the previous comparison window.",
            });
        }
        if (latencyChangePct >=
            30) {
            entries.push({
                service: item.service,
                type: "latency",
                severity: latencyChangePct >=
                    70
                    ? "high"
                    : "medium",
                changePct: Number(latencyChangePct.toFixed(2)),
                current: item.avgDuration,
                baseline: previous.avgDuration,
                message: "Average request latency increased against the previous comparison window.",
            });
        }
        return entries;
    });
    return {
        windowMinutes: safeWindow,
        currentWindow: {
            from: currentStart.toISOString(),
            to: now.toISOString(),
        },
        baselineWindow: {
            from: baselineStart.toISOString(),
            to: currentStart.toISOString(),
        },
        anomalies,
    };
};
exports.getDynamicAnomalies = getDynamicAnomalies;
