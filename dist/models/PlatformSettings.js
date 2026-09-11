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
exports.PlatformSettings = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   SCHEMA
========================================================= */
const platformSettingsSchema = new mongoose_1.Schema({
    key: {
        type: String,
        enum: [
            "global",
        ],
        default: "global",
        unique: true,
        immutable: true,
        required: true,
    },
    /* =====================================================
       PLATFORM
    ====================================================== */
    platform: {
        maintenanceMode: {
            type: Boolean,
            default: false,
            required: true,
        },
        allowSignups: {
            type: Boolean,
            default: true,
            required: true,
        },
        defaultCurrency: {
            type: String,
            enum: [
                "BDT",
                "USD",
                "EUR",
            ],
            default: "BDT",
            required: true,
        },
    },
    /* =====================================================
       TRANSACTION RISK
    ====================================================== */
    risk: {
        dailyTransferLimit: {
            type: Number,
            default: 50000,
            min: 10000,
            max: 500000,
            required: true,
        },
        reviewThreshold: {
            type: Number,
            default: 25000,
            min: 5000,
            max: 100000,
            required: true,
        },
        requireKycForHighValue: {
            type: Boolean,
            default: true,
            required: true,
        },
        velocityWindowMinutes: {
            type: Number,
            default: 30,
            min: 5,
            max: 120,
            required: true,
        },
        maxTransfersPerWindow: {
            type: Number,
            default: 8,
            min: 2,
            max: 30,
            required: true,
        },
    },
    /* =====================================================
       SECURITY POLICY
    ====================================================== */
    security: {
        requireMfa: {
            type: Boolean,
            default: true,
            required: true,
        },
        sessionTimeoutMins: {
            type: Number,
            enum: [
                15,
                30,
                60,
                240,
            ],
            default: 30,
            required: true,
        },
        maxLoginAttempts: {
            type: Number,
            default: 5,
            min: 3,
            max: 10,
            required: true,
        },
        requireReauthForSensitiveActions: {
            type: Boolean,
            default: true,
            required: true,
        },
    },
    /* =====================================================
       REVISION / ACTOR
    ====================================================== */
    revision: {
        type: Number,
        default: 1,
        min: 1,
        required: true,
    },
    updatedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
    },
}, {
    timestamps: true,
    /*
     * We use our own explicit revision field.
     */
    versionKey: false,
    /*
     * Reject unexpected fields instead of silently storing
     * configuration that the backend does not understand.
     */
    strict: "throw",
    minimize: false,
});
/* =========================================================
   INDEXES
========================================================= */
platformSettingsSchema.index({
    key: 1,
}, {
    unique: true,
});
/* =========================================================
   MODEL
========================================================= */
exports.PlatformSettings = mongoose_1.default.models.PlatformSettings ||
    mongoose_1.default.model("PlatformSettings", platformSettingsSchema);
exports.default = exports.PlatformSettings;
