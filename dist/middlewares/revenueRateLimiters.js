"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revenueWriteLimiter = exports.revenueSimulationLimiter = exports.revenueReadLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
/* =========================================================
   REVENUE READ LIMITER

   Used for:
   GET /fee-policy
   GET /leakage
   GET /contributors
========================================================= */
exports.revenueReadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 *
        60 *
        1000,
    max: 180,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many revenue analytics requests. Please try again later.",
    },
});
/* =========================================================
   REVENUE SIMULATION LIMITER

   Used for:
   POST /simulate
========================================================= */
exports.revenueSimulationLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10 *
        60 *
        1000,
    max: 80,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many revenue simulations. Please try again later.",
    },
});
/* =========================================================
   REVENUE WRITE LIMITER

   Used for:
   POST /leakage/investigate
========================================================= */
exports.revenueWriteLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10 *
        60 *
        1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many revenue investigation requests. Please try again later.",
    },
});
