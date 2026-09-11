"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportCreateLimiter = exports.supportWriteLimiter = exports.supportReadLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.supportReadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 *
        60 *
        1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many support dashboard requests. Please try again later.",
    },
});
exports.supportWriteLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10 *
        60 *
        1000,
    max: 90,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many support changes. Please try again later.",
    },
});
exports.supportCreateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10 *
        60 *
        1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many new support tickets. Please try again later.",
    },
});
