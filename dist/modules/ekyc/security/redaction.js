"use strict";
/* =========================================================
   SENSITIVE DATA PATTERNS
========================================================= */
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskNID = maskNID;
exports.maskPhone = maskPhone;
exports.maskEmail = maskEmail;
exports.redactText = redactText;
exports.redactForLog = redactForLog;
const NID_PATTERN = /(^|\D)(\d{10}|\d{13}|\d{17})(?!\d)/g;
const BANGLADESH_PHONE_PATTERN = /(^|[^\d])((?:\+?88[-\s]?)?01[3-9]\d{8})(?!\d)/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const MAX_REDACTION_DEPTH = 10;
const FULLY_SENSITIVE_KEYS = new Set([
    "authorization",
    "proxyauthorization",
    "apikey",
    "xapikey",
    "password",
    "secret",
    "clientsecret",
    "accesstoken",
    "refreshtoken",
    "token",
    "cookie",
    "setcookie",
    "sessioncookie",
    "encrypted",
    "ciphertext",
    "iv",
    "authtag",
]);
const NID_KEYS = new Set([
    "nid",
    "nidnumber",
    "normalizednid",
    "nationalid",
    "nationalidnumber",
    "documentnumber",
]);
const PHONE_KEYS = new Set([
    "phone",
    "phonenumber",
    "mobile",
    "mobilenumber",
    "msisdn",
]);
const EMAIL_KEYS = new Set([
    "email",
    "emailaddress",
    "contactemail",
    "customeremail",
]);
/* =========================================================
   KEY NORMALIZATION
========================================================= */
function normalizeKey(key) {
    return key
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}
function isFullySensitiveKey(key) {
    const normalized = normalizeKey(key);
    return (FULLY_SENSITIVE_KEYS.has(normalized) ||
        normalized.endsWith("password") ||
        normalized.endsWith("secret") ||
        normalized.endsWith("token") ||
        normalized.endsWith("apikey") ||
        normalized.endsWith("encrypted"));
}
/* =========================================================
   NID MASKING
========================================================= */
function maskNID(value) {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
        return "[MASKED_NID]";
    }
    /*
     * A 10-digit Smart NID should not expose eight digits.
     * Therefore, only the first and last two digits are shown.
     */
    if (digits.length <= 10) {
        if (digits.length <= 4) {
            return "*".repeat(Math.max(digits.length, 4));
        }
        return [
            digits.slice(0, 2),
            "*".repeat(digits.length - 4),
            digits.slice(-2),
        ].join("");
    }
    /*
     * 13/17-digit NID:
     * Shows the first four and final four digits.
     */
    return [
        digits.slice(0, 4),
        "*".repeat(digits.length - 8),
        digits.slice(-4),
    ].join("");
}
/* =========================================================
   PHONE MASKING
========================================================= */
function maskPhone(value) {
    const trimmed = value.trim();
    const hasPlus = trimmed.startsWith("+");
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 6) {
        return "[MASKED_PHONE]";
    }
    const masked = [
        digits.slice(0, 4),
        "*".repeat(Math.max(digits.length - 6, 4)),
        digits.slice(-2),
    ].join("");
    return hasPlus
        ? `+${masked}`
        : masked;
}
/* =========================================================
   EMAIL MASKING
========================================================= */
function maskEmail(value) {
    const normalized = value.trim();
    const separatorIndex = normalized.lastIndexOf("@");
    if (separatorIndex <= 0) {
        return "[MASKED_EMAIL]";
    }
    const localPart = normalized.slice(0, separatorIndex);
    const domain = normalized.slice(separatorIndex + 1);
    const visibleCharacter = localPart.charAt(0) || "*";
    return `${visibleCharacter}***@${domain}`;
}
/* =========================================================
   STRING REDACTION
========================================================= */
function redactText(value) {
    let redacted = value.replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED]");
    /*
     * Phone replacement runs before NID replacement because
     * a phone containing country code may contain 13 digits.
     */
    redacted =
        redacted.replace(BANGLADESH_PHONE_PATTERN, (_match, prefix, phone) => `${prefix}${maskPhone(phone)}`);
    redacted =
        redacted.replace(NID_PATTERN, (_match, prefix, nid) => `${prefix}${maskNID(nid)}`);
    redacted =
        redacted.replace(EMAIL_PATTERN, (email) => maskEmail(email));
    return redacted;
}
/* =========================================================
   OBJECT REDACTION
========================================================= */
function redactValue(value, key, seen, depth) {
    const normalizedKey = normalizeKey(key);
    if (isFullySensitiveKey(key)) {
        return "[REDACTED]";
    }
    if (depth >
        MAX_REDACTION_DEPTH) {
        return "[MAX_DEPTH_REACHED]";
    }
    if (value === null ||
        value === undefined) {
        return value;
    }
    if (typeof value ===
        "string") {
        if (NID_KEYS.has(normalizedKey)) {
            return maskNID(value);
        }
        if (PHONE_KEYS.has(normalizedKey)) {
            return maskPhone(value);
        }
        if (EMAIL_KEYS.has(normalizedKey)) {
            return maskEmail(value);
        }
        return redactText(value);
    }
    if (typeof value ===
        "number" ||
        typeof value ===
            "boolean" ||
        typeof value ===
            "bigint") {
        return value;
    }
    if (typeof value ===
        "function") {
        return "[FUNCTION]";
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (value instanceof Error) {
        return {
            name: value.name,
            message: redactText(value.message),
            stack: process.env.NODE_ENV ===
                "production"
                ? undefined
                : redactText(value.stack || ""),
        };
    }
    if (Buffer.isBuffer(value)) {
        return `[BUFFER:${value.length}_BYTES]`;
    }
    if (Array.isArray(value)) {
        return value.map((item) => redactValue(item, "", seen, depth + 1));
    }
    if (typeof value ===
        "object") {
        if (seen.has(value)) {
            return "[CIRCULAR]";
        }
        seen.add(value);
        const output = {};
        for (const [childKey, childValue,] of Object.entries(value)) {
            output[childKey] =
                redactValue(childValue, childKey, seen, depth + 1);
        }
        return output;
    }
    return "[UNSUPPORTED_VALUE]";
}
/**
 * Creates a log-safe copy of an unknown value.
 * The original object is never changed.
 */
function redactForLog(value, key = "") {
    return redactValue(value, key, new WeakSet(), 0);
}
