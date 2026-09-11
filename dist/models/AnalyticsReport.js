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
exports.AnalyticsReport = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const analyticsReportSchema = new mongoose_1.Schema({
    requestedByAdminId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    range: {
        type: String,
        enum: [
            "Today",
            "7D",
            "30D",
            "90D",
            "1Y",
        ],
        required: true,
        index: true,
    },
    format: {
        type: String,
        enum: [
            "summary",
            "executive",
            "risk",
        ],
        required: true,
    },
    status: {
        type: String,
        enum: [
            "queued",
            "processing",
            "ready",
            "failed",
        ],
        default: "queued",
        index: true,
    },
    snapshot: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    errorMessage: {
        type: String,
        maxlength: 500,
    },
    completedAt: {
        type: Date,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: {
            expires: 0,
        },
    },
}, {
    timestamps: true,
    versionKey: false,
    strict: "throw",
    minimize: false,
});
analyticsReportSchema.index({
    requestedByAdminId: 1,
    createdAt: -1,
});
exports.AnalyticsReport = mongoose_1.default.models.AnalyticsReport ||
    mongoose_1.default.model("AnalyticsReport", analyticsReportSchema);
exports.default = exports.AnalyticsReport;
