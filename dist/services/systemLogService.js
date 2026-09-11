"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordSystemEventSafe = exports.recordSystemEvent = exports.createSystemTraceId = exports.createSystemRequestId = exports.resolveLogEnvironment = exports.sanitizeLogText = void 0;
const crypto_1 = require("crypto");
const SystemLog_js_1 = require("../models/SystemLog.js");
/* =========================================================
   REDACTION / SANITIZATION
========================================================= */
const trimTo = (value, max) => value
    .trim()
    .slice(0, max);
const sanitizeLogText = (raw) => {
    let value = String(raw ?? "");
    /*
     * Bearer tokens.
     */
    value =
        value.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]");
    /*
     * JWT-like tokens.
     */
    value =
        value.replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_TOKEN]");
    /*
     * Email addresses.
     */
    value =
        value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
    /*
     * Common Bangladesh/international phone-like values.
     */
    value =
        value.replace(/(?:\+?88)?01[3-9]\d{8}\b/g, "[REDACTED_PHONE]");
    /*
     * Common sensitive key/value fragments in free text.
     */
    value =
        value.replace(/\b(password|token|secret|authorization|cookie|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]");
    return value;
};
exports.sanitizeLogText = sanitizeLogText;
/* =========================================================
   ENVIRONMENT
========================================================= */
const resolveLogEnvironment = () => {
    const explicit = process.env
        .APP_ENVIRONMENT
        ?.trim()
        .toLowerCase();
    if (explicit ===
        "production") {
        return "Production";
    }
    if (explicit ===
        "staging") {
        return "Staging";
    }
    if (explicit ===
        "development") {
        return "Development";
    }
    return process.env
        .NODE_ENV ===
        "production"
        ? "Production"
        : "Development";
};
exports.resolveLogEnvironment = resolveLogEnvironment;
/* =========================================================
   REQUEST / TRACE ID
========================================================= */
const createSystemRequestId = () => `req_${(0, crypto_1.randomUUID)()}`;
exports.createSystemRequestId = createSystemRequestId;
const createSystemTraceId = () => `trace_${(0, crypto_1.randomUUID)()}`;
exports.createSystemTraceId = createSystemTraceId;
/* =========================================================
   RECORD EVENT
========================================================= */
const recordSystemEvent = async (input) => {
    const document = {
        timestamp: input.timestamp ??
            new Date(),
        level: input.level,
        service: input.service,
        category: trimTo((0, exports.sanitizeLogText)(input.category), 80),
        event: trimTo((0, exports.sanitizeLogText)(input.event), 160),
        message: trimTo((0, exports.sanitizeLogText)(input.message), 1200),
        requestId: input.requestId
            ? trimTo((0, exports.sanitizeLogText)(input.requestId), 120)
            : undefined,
        traceId: input.traceId
            ? trimTo((0, exports.sanitizeLogText)(input.traceId), 120)
            : undefined,
        transactionId: input.transactionId
            ? trimTo((0, exports.sanitizeLogText)(input.transactionId), 120)
            : undefined,
        source: trimTo((0, exports.sanitizeLogText)(input.source), 80),
        endpoint: input.endpoint
            ? trimTo(input.endpoint, 260)
            : undefined,
        method: input.method
            ? trimTo(input.method
                .toUpperCase(), 16)
            : undefined,
        statusCode: input.statusCode,
        durationMs: input.durationMs ===
            undefined
            ? undefined
            : Math.max(0, Math.round(input.durationMs)),
        environment: input.environment ??
            (0, exports.resolveLogEnvironment)(),
        result: input.result,
    };
    if (input.session) {
        const created = await SystemLog_js_1.SystemLog.create([
            document,
        ], {
            session: input.session,
        });
        return created[0];
    }
    return SystemLog_js_1.SystemLog.create(document);
};
exports.recordSystemEvent = recordSystemEvent;
/* =========================================================
   SAFE NON-BLOCKING RECORD
========================================================= */
const recordSystemEventSafe = (input) => {
    void (0, exports.recordSystemEvent)(input).catch((error) => {
        console.error("SYSTEM LOG WRITE ERROR:", error instanceof
            Error
            ? error.message
            : error);
    });
};
exports.recordSystemEventSafe = recordSystemEventSafe;
