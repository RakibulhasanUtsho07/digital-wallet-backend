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
exports.PaymentSource = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   SCHEMA
========================================================= */
const paymentSourceSchema = new mongoose_1.Schema({
    /* =====================================================
       PROVIDER
    ====================================================== */
    provider: {
        type: String,
        enum: [
            "bkash",
            "nagad",
            "rocket",
            "upay",
            "dbbl",
            "brac",
            "city",
            "ebl",
            "bankasia",
            "prime",
            "sonali",
        ],
        required: true,
        index: true,
        trim: true,
    },
    /* =====================================================
       ACCOUNT NUMBER
    ====================================================== */
    accountNumber: {
        type: String,
        required: true,
        trim: true,
        minlength: 8,
        maxlength: 32,
        /*
         * We intentionally do NOT make this field unique.
         *
         * The unique identity is:
         *
         * provider + accountLookup
         */
    },
    /* =====================================================
       ACCOUNT LOOKUP
    ====================================================== */
    accountLookup: {
        type: String,
        required: true,
        trim: true,
        index: true,
        maxlength: 128,
    },
    /* =====================================================
       ACCOUNT NAME
    ====================================================== */
    accountName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 120,
    },
    /* =====================================================
       SECRET CODE HASH
    ====================================================== */
    secretCodeHash: {
        type: String,
        required: true,
        select: false,
        trim: true,
        maxlength: 128,
    },
    /* =====================================================
       SOURCE BALANCE
    ====================================================== */
    balance: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        /*
         * Prevent NaN from accidentally entering the DB.
         */
        validate: {
            validator: (value) => Number.isFinite(value),
            message: "Source balance must be a valid number.",
        },
    },
    /* =====================================================
       STATUS
    ====================================================== */
    status: {
        type: String,
        enum: [
            "ACTIVE",
            "BLOCKED",
            "CLOSED",
        ],
        required: true,
        default: "ACTIVE",
        index: true,
    },
    /* =====================================================
       CURRENCY
    ====================================================== */
    currency: {
        type: String,
        enum: [
            "BDT",
        ],
        required: true,
        default: "BDT",
    },
}, {
    timestamps: true,
    versionKey: false,
    strict: true,
    /* =====================================================
       SAFE JSON
    ====================================================== */
    toJSON: {
        virtuals: true,
        transform: (_doc, returnedObject) => {
            /*
             * Convert to a generic record first so TypeScript
             * does not complain when removing internal fields.
             */
            const safeObject = returnedObject;
            /*
             * NEVER expose:
             *
             * - secretCodeHash
             * - accountLookup
             */
            delete safeObject["secretCodeHash"];
            delete safeObject["accountLookup"];
            return safeObject;
        },
    },
    /* =====================================================
       SAFE OBJECT
    ====================================================== */
    toObject: {
        virtuals: true,
        transform: (_doc, returnedObject) => {
            const safeObject = returnedObject;
            delete safeObject["secretCodeHash"];
            delete safeObject["accountLookup"];
            return safeObject;
        },
    },
});
/* =========================================================
   INDEXES
========================================================= */
/*
 * Main unique source identity.
 *
 * Same account number may exist under different providers,
 * therefore provider is part of the unique key.
 *
 * Example:
 *
 * bkash + HMAC(01710000001)
 *
 * is different from:
 *
 * nagad + HMAC(01710000001)
 */
paymentSourceSchema.index({
    provider: 1,
    accountLookup: 1,
}, {
    unique: true,
    name: "unique_payment_source_provider_account",
});
/*
 * Optimized active-account lookup.
 *
 * Used by source verification / funding flow.
 */
paymentSourceSchema.index({
    provider: 1,
    status: 1,
    accountLookup: 1,
}, {
    name: "payment_source_active_lookup",
});
/*
 * Useful for admin/provider-level queries.
 */
paymentSourceSchema.index({
    provider: 1,
    createdAt: -1,
}, {
    name: "payment_source_provider_created_at",
});
/* =========================================================
   MODEL
========================================================= */
const PaymentSourceModel = mongoose_1.default.models
    .PaymentSource ||
    mongoose_1.default.model("PaymentSource", paymentSourceSchema);
/* =========================================================
   EXPORT
========================================================= */
exports.PaymentSource = PaymentSourceModel;
exports.default = PaymentSourceModel;
