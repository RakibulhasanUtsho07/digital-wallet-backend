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
exports.UserSettings = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   ENCRYPTED SUB-SCHEMA
========================================================= */
const encryptedSettingsValueSchema = new mongoose_1.Schema({
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
/* =========================================================
   USER SETTINGS SCHEMA
========================================================= */
const userSettingsSchema = new mongoose_1.Schema({
    /* =====================================================
       USER
    ====================================================== */
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
    },
    /* =====================================================
       APPEARANCE
    ====================================================== */
    appearance: {
        theme: {
            type: String,
            /*
             * IMPORTANT:
             *
             * Must match ThemeContext.tsx
             */
            enum: [
                "light",
                "dark",
                "eye-care",
                "ocean",
                "forest",
            ],
            default: "light",
        },
        density: {
            type: String,
            enum: [
                "comfortable",
                "compact",
            ],
            default: "comfortable",
        },
        reduceMotion: {
            type: Boolean,
            default: false,
        },
    },
    /* =====================================================
       NOTIFICATIONS
    ====================================================== */
    notifications: {
        email: {
            type: Boolean,
            default: true,
        },
        push: {
            type: Boolean,
            default: true,
        },
        sms: {
            type: Boolean,
            default: true,
        },
        marketing: {
            type: Boolean,
            default: false,
        },
    },
    /* =====================================================
       PRIVACY
    ====================================================== */
    privacy: {
        analytics: {
            type: Boolean,
            default: false,
        },
        discoverability: {
            type: Boolean,
            default: true,
        },
        personalization: {
            type: Boolean,
            default: true,
        },
        showTransactionNames: {
            type: Boolean,
            default: true,
        },
    },
    /* =====================================================
       WALLET
    ====================================================== */
    wallet: {
        defaultCurrency: {
            type: String,
            enum: [
                "BDT",
                "USD",
                "EUR",
            ],
            default: "BDT",
        },
        hideAmounts: {
            type: Boolean,
            default: false,
        },
        requireConfirmation: {
            type: Boolean,
            default: true,
        },
        /*
         * Encrypted monetary preference
         */
        confirmThresholdEncrypted: {
            type: encryptedSettingsValueSchema,
        },
    },
}, {
    timestamps: true,
});
/* =========================================================
   MODEL
========================================================= */
exports.UserSettings = mongoose_1.default.models.UserSettings ||
    mongoose_1.default.model("UserSettings", userSettingsSchema);
exports.default = exports.UserSettings;
