"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemTelemetryMiddleware = exports.mapPathToSystemService = void 0;
const systemLogService_js_1 = require("../services/systemLogService.js");
/* =========================================================
   SAFE HEADER ID
========================================================= */
const safeHeaderId = (value, fallback) => {
    const candidate = Array.isArray(value)
        ? value[0]
        : value;
    if (candidate &&
        /^[A-Za-z0-9._:-]{6,120}$/.test(candidate)) {
        return candidate;
    }
    return fallback();
};
/* =========================================================
   SERVICE MAPPING
========================================================= */
const mapPathToSystemService = (path) => {
    if (path.startsWith("/api/auth")) {
        return "Authentication";
    }
    if (path.startsWith("/api/wallet")) {
        return "Wallet";
    }
    if (path.startsWith("/api/transfers")) {
        return "Transfers";
    }
    if (path.startsWith("/api/transactions")) {
        return "Transactions";
    }
    if (path.startsWith("/api/kyc")) {
        return "KYC";
    }
    if (path.startsWith("/api/notifications")) {
        return "Notifications";
    }
    if (path.startsWith("/api/ai")) {
        return "AI";
    }
    if (path.startsWith("/api/admin")) {
        return "System";
    }
    return "API";
};
exports.mapPathToSystemService = mapPathToSystemService;
/* =========================================================
   STATUS MAPPING
========================================================= */
const mapStatusToLevel = (status) => {
    if (status >=
        500) {
        return "ERROR";
    }
    if (status >=
        400) {
        return "WARN";
    }
    return "INFO";
};
const mapStatusToResult = (status) => {
    if (status ===
        408 ||
        status ===
            504) {
        return "Timeout";
    }
    if (status >=
        400) {
        return "Failed";
    }
    return "Success";
};
/* =========================================================
   TELEMETRY MIDDLEWARE
========================================================= */
const systemTelemetryMiddleware = (req, res, next) => {
    /*
     * Avoid logging the logs dashboard API itself.
     * Otherwise every dashboard refresh generates more
     * dashboard telemetry and creates noisy recursion.
     */
    if (req.path.startsWith("/api/admin/logs")) {
        next();
        return;
    }
    const requestId = safeHeaderId(req.headers["x-request-id"], systemLogService_js_1.createSystemRequestId);
    const traceId = safeHeaderId(req.headers["x-trace-id"], systemLogService_js_1.createSystemTraceId);
    const startedAt = process.hrtime.bigint();
    req.observability = {
        requestId,
        traceId,
        startedAt,
    };
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Trace-Id", traceId);
    res.once("finish", () => {
        const endedAt = process.hrtime.bigint();
        const durationMs = Number(endedAt -
            startedAt) /
            1_000_000;
        const statusCode = res.statusCode;
        const service = (0, exports.mapPathToSystemService)(req.path);
        (0, systemLogService_js_1.recordSystemEventSafe)({
            level: mapStatusToLevel(statusCode),
            service,
            category: "Request",
            event: `${req.method.toUpperCase()} ${req.path}`,
            message: `Request completed with status ${statusCode}.`,
            requestId,
            traceId,
            source: "HTTP",
            endpoint: req.path,
            method: req.method,
            statusCode,
            durationMs,
            result: mapStatusToResult(statusCode),
        });
    });
    next();
};
exports.systemTelemetryMiddleware = systemTelemetryMiddleware;
