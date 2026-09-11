"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemLog = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   RETENTION
========================================================= */
const retentionDays = Math.max(1, Number(process.env
    .SYSTEM_LOG_RETENTION_DAYS ??
    30) || 30);
const retentionSeconds = retentionDays *
    24 *
    60 *
    60;
/* =========================================================
   SCHEMA
========================================================= */
const systemLogSchema = new mongoose_1.Schema({
    timestamp: {
        type: Date,
        default: Date.now,
        required: true,
        index: true,
    },
    level: {
        type: String,
        enum: [
            "TRACE",
            "DEBUG",
            "INFO",
            "NOTICE",
            "WARN",
            "ERROR",
            "CRITICAL",
        ],
        required: true,
        index: true,
    },
    service: {
        type: String,
        enum: [
            "API",
            "Authentication",
            "Database",
            "Wallet",
            "Transactions",
            "Transfers",
            "KYC",
            "Notifications",
            "Cloudinary",
            "AI",
            "Background Jobs",
            "System",
            "Security",
            "Support",
            "Revenue",
        ],
        required: true,
        index: true,
    },
    category: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
    },
    event: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
    },
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1200,
    },
    requestId: {
        type: String,
        trim: true,
        maxlength: 120,
        index: true,
    },
    traceId: {
        type: String,
        trim: true,
        maxlength: 120,
        index: true,
    },
    transactionId: {
        type: String,
        trim: true,
        maxlength: 120,
        index: true,
    },
    source: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
    },
    endpoint: {
        type: String,
        trim: true,
        maxlength: 260,
    },
    method: {
        type: String,
        trim: true,
        maxlength: 16,
    },
    statusCode: {
        type: Number,
        min: 100,
        max: 599,
    },
    durationMs: {
        type: Number,
        min: 0,
        max: 60 *
            60 *
            1000,
    },
    environment: {
        type: String,
        enum: [
            "Development",
            "Staging",
            "Production",
        ],
        required: true,
        index: true,
    },
    result: {
        type: String,
        enum: [
            "Success",
            "Failed",
            "Timeout",
            "Retried",
        ],
        required: true,
        index: true,
    },
}, {
    timestamps: true,
    versionKey: false,
    strict: "throw",
    minimize: false,
});
/* =========================================================
   INDEXES
========================================================= */
systemLogSchema.index({
    timestamp: -1,
});
systemLogSchema.index({
    service: 1,
    timestamp: -1,
});
systemLogSchema.index({
    level: 1,
    timestamp: -1,
});
systemLogSchema.index({
    environment: 1,
    timestamp: -1,
});
systemLogSchema.index({
    requestId: 1,
    timestamp: 1,
});
systemLogSchema.index({
    traceId: 1,
    timestamp: 1,
});
systemLogSchema.index({
    createdAt: 1,
}, {
    expireAfterSeconds: retentionSeconds,
});
/* =========================================================
   MODEL
========================================================= */
exports.SystemLog = mongoose_1.default.models.SystemLog ||
    mongoose_1.default.model("SystemLog", systemLogSchema);
exports.default = exports.SystemLog;
