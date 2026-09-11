"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemErrorTelemetry = void 0;
const systemTelemetryMiddleware_js_1 = require("./systemTelemetryMiddleware.js");
const systemLogService_js_1 = require("../services/systemLogService.js");
/* =========================================================
   ERROR TELEMETRY
========================================================= */
/*
 * Mount this BEFORE your existing errorHandler.
 *
 * app.use(systemErrorTelemetry);
 * app.use(errorHandler);
 *
 * This middleware does not send a response. It records a
 * sanitized operational error and forwards the same error.
 */
const systemErrorTelemetry = (error, req, _res, next) => {
    const safeMessage = error instanceof
        Error
        ? error.message
        : "Unhandled application error.";
    (0, systemLogService_js_1.recordSystemEventSafe)({
        level: "ERROR",
        service: (0, systemTelemetryMiddleware_js_1.mapPathToSystemService)(req.path),
        category: "ApplicationError",
        event: "UnhandledRequestError",
        message: safeMessage,
        requestId: req.observability
            ?.requestId,
        traceId: req.observability
            ?.traceId,
        source: "Express",
        endpoint: req.path,
        method: req.method,
        statusCode: 500,
        result: "Failed",
    });
    next(error);
};
exports.systemErrorTelemetry = systemErrorTelemetry;
