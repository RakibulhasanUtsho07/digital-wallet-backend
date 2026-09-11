"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSettingsWriteLimiter = exports.adminSettingsReadLimiter = exports.noStoreAdminResponse = exports.requireJsonMutation = exports.requireTrustedAdminOrigin = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const defaultTrustedOrigins = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://digital-payment-system-web.vercel.app",
]);
const getTrustedOrigins = () => {
    const fromEnv = (process.env
        .TRUSTED_FRONTEND_ORIGINS ||
        "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    return new Set([
        ...defaultTrustedOrigins,
        ...fromEnv,
    ]);
};
/*
 * Extra CSRF-style defense for privileged cookie-authenticated
 * mutations. CORS alone is not treated as authorization.
 */
const requireTrustedAdminOrigin = (req, res, next) => {
    if ([
        "GET",
        "HEAD",
        "OPTIONS",
    ].includes(req.method)) {
        next();
        return;
    }
    const origin = req.get("origin");
    const authorization = req.get("authorization");
    /*
     * Non-browser Bearer-token clients may omit Origin.
     */
    if (!origin &&
        authorization?.startsWith("Bearer ")) {
        next();
        return;
    }
    if (!origin ||
        !getTrustedOrigins().has(origin)) {
        res.status(403).json({
            success: false,
            message: "Untrusted request origin.",
        });
        return;
    }
    next();
};
exports.requireTrustedAdminOrigin = requireTrustedAdminOrigin;
const requireJsonMutation = (req, res, next) => {
    if ([
        "PATCH",
        "POST",
        "PUT",
        "DELETE",
    ].includes(req.method) &&
        !req.is("application/json")) {
        res.status(415).json({
            success: false,
            message: "Content-Type application/json is required.",
        });
        return;
    }
    next();
};
exports.requireJsonMutation = requireJsonMutation;
const noStoreAdminResponse = (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    next();
};
exports.noStoreAdminResponse = noStoreAdminResponse;
exports.adminSettingsReadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 *
        60 *
        1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many platform settings requests. Please try again later.",
    },
});
exports.adminSettingsWriteLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10 *
        60 *
        1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many privileged configuration changes. Please try again later.",
    },
});
