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
exports.KYC = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   SCHEMA
========================================================= */
const kycSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
    },
    documentType: {
        type: String,
        enum: [
            "nid",
            "passport",
            "driving_license",
        ],
    },
    documentNumber: {
        type: String,
        trim: true,
    },
    /* =====================================================
       CLOUDINARY PRIVATE ASSET IDS
    ====================================================== */
    frontImagePublicId: {
        type: String,
    },
    backImagePublicId: {
        type: String,
    },
    selfieImagePublicId: {
        type: String,
    },
    /* =====================================================
       LEGACY IMAGE URL FIELDS
    ====================================================== */
    frontImageUrl: {
        type: String,
    },
    backImageUrl: {
        type: String,
    },
    selfieImageUrl: {
        type: String,
    },
    verificationSessionId: {
        type: String,
        index: true,
    },
    provider: {
        type: String,
        enum: [
            "manual",
            "stripe",
            "other",
        ],
        default: "manual",
    },
    status: {
        type: String,
        enum: [
            "not_started",
            "pending",
            "under_review",
            "verified",
            "rejected",
        ],
        default: "not_started",
    },
    rejectionReason: {
        type: String,
        trim: true,
    },
    submittedAt: {
        type: Date,
    },
    verifiedAt: {
        type: Date,
    },
}, {
    timestamps: true,
});
/* =========================================================
   MODEL
========================================================= */
exports.KYC = mongoose_1.default.models.KYC ||
    mongoose_1.default.model("KYC", kycSchema);
