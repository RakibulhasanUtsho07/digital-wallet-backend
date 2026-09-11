"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportSystemLogs = exports.getSystemRootCause = exports.getSystemTrace = exports.getSystemAnomalies = exports.getSystemHeatmap = exports.getSystemServicesHealth = exports.getSystemLogsSummary = exports.getSystemLogById = exports.getSystemLogs = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const SystemLog_js_1 = require("../models/SystemLog.js");
const systemLogsAnalyticsService_js_1 = require("../services/systemLogsAnalyticsService.js");
/* =========================================================
   HELPERS
========================================================= */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const safePositiveInt = (value, fallback, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) ||
        parsed <
            1) {
        return fallback;
    }
    return Math.min(Math.floor(parsed), max);
};
/* =========================================================
   EXPRESS PARAM NORMALIZER
========================================================= */
/*
 * With newer Express typings a route param can be inferred as
 * string | string[]. Normalize it before calling string methods.
 */
const getRouteParam = (value, maxLength = 120) => {
    const candidate = Array.isArray(value)
        ? value[0]
        : value;
    if (typeof candidate !==
        "string") {
        return "";
    }
    return candidate
        .trim()
        .slice(0, maxLength);
};
const allowedLevels = [
    "TRACE",
    "DEBUG",
    "INFO",
    "NOTICE",
    "WARN",
    "ERROR",
    "CRITICAL",
];
const allowedServices = [
    "API",
    "Authentication",
    "Database",
    "Wallet",
    "Transactions",
    "Transfers",
    "KYC",
    "Notifications",
    "Cloudinary",
    "AI",
    "Background Jobs",
    "System",
    "Security",
    "Support",
    "Revenue",
];
const allowedEnvironments = [
    "Development",
    "Staging",
    "Production",
];
const buildFilters = (req) => {
    const search = typeof req.query
        .search ===
        "string"
        ? req.query
            .search
            .trim()
            .slice(0, 120)
        : "";
    const level = typeof req.query
        .level ===
        "string"
        ? req.query
            .level
        : "";
    const service = typeof req.query
        .service ===
        "string"
        ? req.query
            .service
        : "";
    const environment = typeof req.query
        .environment ===
        "string"
        ? req.query
            .environment
        : "";
    const range = typeof req.query
        .range ===
        "string"
        ? req.query
            .range
        : "24h";
    const filter = {
        timestamp: {
            $gte: (0, systemLogsAnalyticsService_js_1.rangeStart)(range),
        },
    };
    if (level &&
        allowedLevels.includes(level)) {
        filter.level =
            level;
    }
    if (service &&
        allowedServices.includes(service)) {
        filter.service =
            service;
    }
    if (environment &&
        allowedEnvironments.includes(environment)) {
        filter.environment =
            environment;
    }
    if (search) {
        const regex = new RegExp(escapeRegex(search), "i");
        filter.$or = [
            {
                event: regex,
            },
            {
                message: regex,
            },
            {
                requestId: regex,
            },
            {
                traceId: regex,
            },
            {
                transactionId: regex,
            },
            {
                category: regex,
            },
        ];
    }
    return filter;
};
/* =========================================================
   GET LOGS
   GET /api/admin/logs
========================================================= */
const getSystemLogs = async (req, res) => {
    try {
        const page = safePositiveInt(req.query
            .page, 1, 100000);
        const limit = safePositiveInt(req.query
            .limit, 25, 100);
        const filter = buildFilters(req);
        const [logs, total,] = await Promise.all([
            SystemLog_js_1.SystemLog.find(filter)
                .sort({
                timestamp: -1,
            })
                .skip((page -
                1) *
                limit)
                .limit(limit)
                .lean(),
            SystemLog_js_1.SystemLog.countDocuments(filter),
        ]);
        res.status(200).json({
            success: true,
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(Math.ceil(total /
                    limit), 1),
            },
            logs: logs.map((log) => ({
                id: log._id
                    .toString(),
                timestamp: log.timestamp
                    .toISOString(),
                level: log.level,
                service: log.service,
                category: log.category,
                event: log.event,
                message: log.message,
                requestId: log.requestId,
                traceId: log.traceId,
                transactionId: log.transactionId,
                source: log.source,
                endpoint: log.endpoint,
                method: log.method,
                statusCode: log.statusCode,
                durationMs: log.durationMs,
                environment: log.environment,
                result: log.result,
            })),
        });
    }
    catch (error) {
        console.error("GET SYSTEM LOGS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load system logs.",
        });
    }
};
exports.getSystemLogs = getSystemLogs;
/* =========================================================
   GET LOG DETAIL
   GET /api/admin/logs/:id
========================================================= */
const getSystemLogById = async (req, res) => {
    try {
        const id = getRouteParam(req.params.id);
        if (!id ||
            !mongoose_1.default
                .isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid log id.",
            });
            return;
        }
        const log = await SystemLog_js_1.SystemLog.findById(id).lean();
        if (!log) {
            res.status(404).json({
                success: false,
                message: "Log event not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            log: {
                id: log._id
                    .toString(),
                timestamp: log.timestamp
                    .toISOString(),
                level: log.level,
                service: log.service,
                category: log.category,
                event: log.event,
                message: log.message,
                requestId: log.requestId,
                traceId: log.traceId,
                transactionId: log.transactionId,
                source: log.source,
                endpoint: log.endpoint,
                method: log.method,
                statusCode: log.statusCode,
                durationMs: log.durationMs,
                environment: log.environment,
                result: log.result,
            },
        });
    }
    catch (error) {
        console.error("GET SYSTEM LOG DETAIL ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load log detail.",
        });
    }
};
exports.getSystemLogById = getSystemLogById;
/* =========================================================
   SUMMARY
========================================================= */
const getSystemLogsSummary = async (req, res) => {
    try {
        const range = typeof req.query
            .range ===
            "string"
            ? req.query
                .range
            : "24h";
        const summary = await (0, systemLogsAnalyticsService_js_1.getSystemLogSummary)(range);
        res.status(200).json({
            success: true,
            summary,
        });
    }
    catch (error) {
        console.error("GET SYSTEM LOG SUMMARY ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load system summary.",
        });
    }
};
exports.getSystemLogsSummary = getSystemLogsSummary;
/* =========================================================
   SERVICES
========================================================= */
const getSystemServicesHealth = async (req, res) => {
    try {
        const range = typeof req.query
            .range ===
            "string"
            ? req.query
                .range
            : "24h";
        const services = await (0, systemLogsAnalyticsService_js_1.getServiceHealth)(range);
        res.status(200).json({
            success: true,
            range,
            services,
        });
    }
    catch (error) {
        console.error("GET SERVICE HEALTH ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load service health.",
        });
    }
};
exports.getSystemServicesHealth = getSystemServicesHealth;
/* =========================================================
   HEATMAP
========================================================= */
const getSystemHeatmap = async (req, res) => {
    try {
        const range = typeof req.query
            .range ===
            "string"
            ? req.query
                .range
            : "7d";
        const cells = await (0, systemLogsAnalyticsService_js_1.getOperationalHeatmap)(range);
        res.status(200).json({
            success: true,
            range,
            timezone: "UTC",
            cells,
        });
    }
    catch (error) {
        console.error("GET SYSTEM HEATMAP ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load operational heatmap.",
        });
    }
};
exports.getSystemHeatmap = getSystemHeatmap;
/* =========================================================
   ANOMALIES
========================================================= */
const getSystemAnomalies = async (req, res) => {
    try {
        const minutes = safePositiveInt(req.query
            .windowMinutes, 60, 1440);
        const data = await (0, systemLogsAnalyticsService_js_1.getDynamicAnomalies)(minutes);
        res.status(200).json({
            success: true,
            ...data,
        });
    }
    catch (error) {
        console.error("GET SYSTEM ANOMALIES ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to calculate anomalies.",
        });
    }
};
exports.getSystemAnomalies = getSystemAnomalies;
/* =========================================================
   TRACE
========================================================= */
const getSystemTrace = async (req, res) => {
    try {
        const traceId = getRouteParam(req.params.traceId);
        if (!traceId) {
            res.status(400).json({
                success: false,
                message: "Trace id is required.",
            });
            return;
        }
        const logs = await SystemLog_js_1.SystemLog.find({
            traceId,
        })
            .sort({
            timestamp: 1,
        })
            .lean();
        if (logs.length ===
            0) {
            res.status(404).json({
                success: false,
                message: "No trace events found.",
            });
            return;
        }
        const startedAt = logs[0]
            .timestamp
            .getTime();
        res.status(200).json({
            success: true,
            traceId,
            totalDurationMs: logs.reduce((total, log) => total +
                (log.durationMs ??
                    0), 0),
            spans: logs.map((log) => ({
                id: log._id
                    .toString(),
                service: log.service,
                event: log.event,
                duration: log.durationMs ??
                    0,
                startOffset: Math.max(0, log.timestamp
                    .getTime() -
                    startedAt),
                status: log.level ===
                    "ERROR" ||
                    log.level ===
                        "CRITICAL"
                    ? "error"
                    : "ok",
                timestamp: log.timestamp
                    .toISOString(),
            })),
        });
    }
    catch (error) {
        console.error("GET SYSTEM TRACE ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load request trace.",
        });
    }
};
exports.getSystemTrace = getSystemTrace;
/* =========================================================
   ROOT CAUSE
========================================================= */
const getSystemRootCause = async (req, res) => {
    try {
        const requestId = getRouteParam(req.params.requestId);
        if (!requestId) {
            res.status(400).json({
                success: false,
                message: "Request id is required.",
            });
            return;
        }
        const logs = await SystemLog_js_1.SystemLog.find({
            requestId,
        })
            .sort({
            timestamp: 1,
        })
            .lean();
        if (logs.length ===
            0) {
            res.status(404).json({
                success: false,
                message: "No correlated request events found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            requestId,
            nodes: logs.map((log, index) => ({
                id: log._id
                    .toString(),
                order: index +
                    1,
                service: log.service,
                event: log.event,
                type: log.level ===
                    "CRITICAL"
                    ? "critical"
                    : log.level ===
                        "ERROR"
                        ? "error"
                        : log.level ===
                            "WARN"
                            ? "warn"
                            : "ok",
                detail: log.message,
                timestamp: log.timestamp
                    .toISOString(),
                durationMs: log.durationMs,
            })),
        });
    }
    catch (error) {
        console.error("GET SYSTEM ROOT CAUSE ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load correlated request events.",
        });
    }
};
exports.getSystemRootCause = getSystemRootCause;
/* =========================================================
   EXPORT
========================================================= */
const exportSystemLogs = async (req, res) => {
    try {
        const filter = buildFilters(req);
        const logs = await SystemLog_js_1.SystemLog.find(filter)
            .sort({
            timestamp: -1,
        })
            .limit(5000)
            .lean();
        const generatedAt = new Date()
            .toISOString();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="system-logs-${generatedAt.slice(0, 10)}.json"`);
        res.status(200).send(JSON.stringify({
            generatedAt,
            count: logs.length,
            cappedAt: 5000,
            logs: logs.map((log) => ({
                id: log._id
                    .toString(),
                timestamp: log.timestamp
                    .toISOString(),
                level: log.level,
                service: log.service,
                category: log.category,
                event: log.event,
                message: log.message,
                requestId: log.requestId,
                traceId: log.traceId,
                transactionId: log.transactionId,
                source: log.source,
                endpoint: log.endpoint,
                method: log.method,
                statusCode: log.statusCode,
                durationMs: log.durationMs,
                environment: log.environment,
                result: log.result,
            })),
        }, null, 2));
    }
    catch (error) {
        console.error("EXPORT SYSTEM LOGS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to export system logs.",
        });
    }
};
exports.exportSystemLogs = exportSystemLogs;
