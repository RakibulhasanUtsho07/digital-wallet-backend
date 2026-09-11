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
exports.KYCAIReview = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   SCHEMA
========================================================= */
const kycAIReviewSchema = new mongoose_1.Schema({
    kycId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "KYC",
        required: true,
        unique: true,
        index: true,
    },
    status: {
        type: String,
        enum: [
            "processing",
            "completed",
            "failed",
        ],
        required: true,
        default: "processing",
        index: true,
    },
    recommendation: {
        type: String,
        enum: [
            "likely_clear",
            "manual_review",
            "likely_reject",
        ],
        required: true,
        default: "manual_review",
    },
    confidence: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
    },
    riskLevel: {
        type: String,
        enum: [
            "Low",
            "Medium",
            "High",
            "Critical",
        ],
        default: "Medium",
        index: true,
    },
    summary: {
        type: String,
        trim: true,
        maxlength: 1200,
        default: "",
    },
    reasons: {
        type: [
            {
                type: String,
                trim: true,
                maxlength: 300,
            },
        ],
        default: [],
    },
    missingSignals: {
        type: [
            {
                type: String,
                trim: true,
                maxlength: 300,
            },
        ],
        default: [],
    },
    provider: {
        type: String,
        trim: true,
        maxlength: 80,
        default: "gemini",
    },
    aiModel: {
        type: String,
        trim: true,
        maxlength: 120,
        default: "",
    },
    triggeredBy: {
        type: String,
        enum: [
            "automatic_submission",
            "admin_rerun",
        ],
        required: true,
    },
    errorMessage: {
        type: String,
        trim: true,
        maxlength: 500,
    },
    reviewedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
}, {
    timestamps: true,
    versionKey: false,
    strict: "throw",
});
/* =========================================================
   MODEL

   Explicit typing keeps an already-compiled mongoose model from
   widening to Model<any> during hot reload / serverless reuse.
========================================================= */
const existingKYCAIReviewModel = mongoose_1.default.models
    .KYCAIReview;
exports.KYCAIReview = existingKYCAIReviewModel ??
    mongoose_1.default.model("KYCAIReview", kycAIReviewSchema);
exports.default = exports.KYCAIReview;
