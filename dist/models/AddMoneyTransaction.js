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
exports.AddMoneyTransaction = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   SCHEMA
========================================================= */
const addMoneyTransactionSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    walletId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Wallet",
        required: true,
        index: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
    },
    currency: {
        type: String,
        required: true,
        default: "BDT",
        enum: [
            "BDT",
            "USD",
            "EUR",
        ],
    },
    sourceType: {
        type: String,
        enum: [
            "BANK",
            "MFS",
        ],
        required: true,
        index: true,
    },
    provider: {
        type: String,
        enum: [
            "DEMO",
            "BKASH",
            "NAGAD",
            "ROCKET",
            "BANK_API",
        ],
        required: true,
        index: true,
    },
    providerName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    status: {
        type: String,
        enum: [
            "INITIATED",
            "PENDING",
            "SUCCESS",
            "FAILED",
            "CANCELLED",
        ],
        default: "INITIATED",
        required: true,
        index: true,
    },
    /*
     * Frontend retry safe.
     */
    idempotencyKey: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
    },
    providerTransactionId: {
        type: String,
        trim: true,
        maxlength: 200,
    },
    customerReference: {
        type: String,
        trim: true,
        maxlength: 120,
    },
    maskedAccount: {
        type: String,
        trim: true,
        maxlength: 120,
    },
    /*
     * DEMO ONLY.
     *
     * Do not populate this in production.
     */
    demoVerificationCode: {
        type: String,
        select: false,
    },
    failureReason: {
        type: String,
        trim: true,
        maxlength: 500,
    },
    initiatedAt: {
        type: Date,
        default: Date.now,
        required: true,
    },
    completedAt: {
        type: Date,
    },
    creditedAt: {
        type: Date,
    },
    balanceBefore: {
        type: Number,
    },
    balanceAfter: {
        type: Number,
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
    },
}, {
    timestamps: true,
    versionKey: false,
});
/* =========================================================
   INDEXES
========================================================= */
addMoneyTransactionSchema.index({
    userId: 1,
    createdAt: -1,
});
addMoneyTransactionSchema.index({
    walletId: 1,
    createdAt: -1,
});
addMoneyTransactionSchema.index({
    providerTransactionId: 1,
}, {
    sparse: true,
});
addMoneyTransactionSchema.index({
    userId: 1,
    idempotencyKey: 1,
}, {
    unique: true,
});
addMoneyTransactionSchema.index({
    userId: 1,
    status: 1,
    createdAt: -1,
});
/* =========================================================
   MODEL
========================================================= */
exports.AddMoneyTransaction = mongoose_1.default.models.AddMoneyTransaction ||
    mongoose_1.default.model("AddMoneyTransaction", addMoneyTransactionSchema);
exports.default = exports.AddMoneyTransaction;
