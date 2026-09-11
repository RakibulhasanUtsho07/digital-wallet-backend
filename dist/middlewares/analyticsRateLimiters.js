"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsReportLimiter = exports.analyticsExportLimiter = exports.analyticsReadLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.analyticsReadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 *
        60 *
        1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many analytics requests. Please try again later.",
    },
});
exports.analyticsExportLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 *
        60 *
        1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many analytics export requests. Please try again later.",
    },
});
exports.analyticsReportLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 *
        60 *
        1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many analytics report requests. Please try again later.",
    },
});
