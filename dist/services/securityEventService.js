"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordSecurityEvent = void 0;
const SecurityEvent_js_1 = require("../models/SecurityEvent.js");
const securityRequestMetadata_js_1 = require("./securityRequestMetadata.js");
/* =========================================================
   SANITIZATION
========================================================= */
const sanitizeDetail = (value) => {
    if (!value) {
        return undefined;
    }
    return value
        .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
        .replace(/\b(password|token|secret|authorization|cookie|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);
};
/* =========================================================
   RECORD EVENT
========================================================= */
const recordSecurityEvent = async (input) => {
    try {
        const metadata = input.req
            ? (0, securityRequestMetadata_js_1.getSecurityRequestMetadata)(input.req)
            : null;
        await SecurityEvent_js_1.SecurityEvent.create({
            userId: input.userId,
            eventType: input.eventType,
            title: input.title
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 160),
            status: input.status,
            detail: sanitizeDetail(input.detail),
            sessionId: input.sessionId,
            device: metadata?.device,
            location: metadata?.location,
            maskedIp: metadata?.maskedIp,
        });
    }
    catch (error) {
        /*
         * Security telemetry must not turn an otherwise successful
         * authentication/wallet action into a failed request.
         */
        console.error("SECURITY EVENT WRITE ERROR:", error instanceof Error
            ? error.message
            : error);
    }
};
exports.recordSecurityEvent = recordSecurityEvent;
