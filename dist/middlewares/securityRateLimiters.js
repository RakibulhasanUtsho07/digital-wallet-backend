"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginLimiter = exports.twoFactorVerifyLimiter = exports.securitySensitiveLimiter = exports.securityReadLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.securityReadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many security requests. Please try again later.",
    },
});
exports.securitySensitiveLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many sensitive security actions. Please wait and try again.",
    },
});
exports.twoFactorVerifyLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many verification attempts. Please try again later.",
    },
});
exports.loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many sign-in attempts. Please try again later.",
    },
});
