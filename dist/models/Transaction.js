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
exports.Transaction = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   ENCRYPTED DATA SCHEMA

   Reused for:
   - amountEncrypted
   - referenceEncrypted
========================================================= */
const encryptedDataSchema = new mongoose_1.Schema({
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
   TRANSACTION SCHEMA
========================================================= */
const transactionSchema = new mongoose_1.Schema({
    senderId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    receiverId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    /* =====================================================
       SECURE AMOUNT

       Plaintext `amount` does NOT exist.
       Amount is stored as encrypted minor units only.
    ====================================================== */
    amountEncrypted: {
        type: encryptedDataSchema,
        required: true,
    },
    /* =====================================================
       SECURE REFERENCE

       Plaintext `reference` does NOT exist.
       Reference is optional and encrypted when provided.
    ====================================================== */
    referenceEncrypted: {
        type: encryptedDataSchema,
        required: false,
    },
    idempotencyKey: {
        type: String,
        trim: true,
        required: false,
    },
    currency: {
        type: String,
        default: "BDT",
        trim: true,
        uppercase: true,
    },
    type: {
        type: String,
        enum: [
            "TRANSFER",
            "DEPOSIT",
            "WITHDRAW",
        ],
        required: true,
    },
    status: {
        type: String,
        enum: [
            "PENDING",
            "COMPLETED",
            "FAILED",
        ],
        default: "PENDING",
    },
    riskScore: {
        type: String,
        enum: [
            "LOW",
            "MEDIUM",
            "HIGH",
        ],
        default: "LOW",
    },
}, {
    timestamps: true,
});
/* =========================================================
   INDEXES
========================================================= */
transactionSchema.index({
    senderId: 1,
    createdAt: -1,
});
transactionSchema.index({
    receiverId: 1,
    createdAt: -1,
});
transactionSchema.index({
    status: 1,
    createdAt: -1,
});
transactionSchema.index({
    senderId: 1,
    idempotencyKey: 1,
}, {
    unique: true,
    sparse: true,
});
/* =========================================================
   MODEL
========================================================= */
exports.Transaction = mongoose_1.default.models.Transaction ||
    mongoose_1.default.model("Transaction", transactionSchema);
exports.default = exports.Transaction;
