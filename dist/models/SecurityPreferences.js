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
exports.SecurityPreferences = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const encryptedValueSchema = new mongoose_1.Schema({
    encrypted: {
        type: String,
        required: true,
    },
    iv: {
        type: String,
        required: true,
    },
    authTag: {
        type: String,
        required: true,
    },
}, {
    _id: false,
});
const securityPreferencesSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
    },
    twoFactor: {
        enabled: {
            type: Boolean,
            default: false,
        },
        method: {
            type: String,
            enum: [
                "app",
                "email",
                "sms",
            ],
            default: "app",
        },
        secretEncrypted: {
            type: encryptedValueSchema,
        },
        pendingSecretEncrypted: {
            type: encryptedValueSchema,
        },
        backupCodeHashes: {
            type: [String],
            default: [],
            select: false,
        },
        enabledAt: {
            type: Date,
        },
    },
    alerts: {
        newDevice: {
            type: Boolean,
            default: true,
        },
        suspiciousActivity: {
            type: Boolean,
            default: true,
        },
        failedLogin: {
            type: Boolean,
            default: true,
        },
    },
    lastSecurityCheckAt: {
        type: Date,
    },
    securityCheckCount: {
        type: Number,
        default: 0,
        min: 0,
    },
}, {
    timestamps: true,
    versionKey: false,
});
exports.SecurityPreferences = mongoose_1.default.models.SecurityPreferences ||
    mongoose_1.default.model("SecurityPreferences", securityPreferencesSchema);
exports.default = exports.SecurityPreferences;
