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
exports.Receipt = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   SUB-SCHEMAS
========================================================= */
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
const lineItemSchema = new mongoose_1.Schema({
    nameEncrypted: {
        type: encryptedValueSchema,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1,
    },
    unitPriceEncrypted: {
        type: encryptedValueSchema,
        required: true,
    },
    totalEncrypted: {
        type: encryptedValueSchema,
        required: true,
    },
    categoryEncrypted: {
        type: encryptedValueSchema,
        required: true,
    },
}, {
    _id: true,
});
/* =========================================================
   RECEIPT SCHEMA
========================================================= */
const receiptSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    merchantEncrypted: {
        type: encryptedValueSchema,
    },
    amountEncrypted: {
        type: encryptedValueSchema,
    },
    taxEncrypted: {
        type: encryptedValueSchema,
    },
    categoryEncrypted: {
        type: encryptedValueSchema,
    },
    paymentMethodEncrypted: {
        type: encryptedValueSchema,
    },
    receiptNumberEncrypted: {
        type: encryptedValueSchema,
    },
    tagsEncrypted: {
        type: [
            encryptedValueSchema,
        ],
        default: [],
    },
    lineItems: {
        type: [
            lineItemSchema,
        ],
        default: [],
    },
    currency: {
        type: String,
        default: "BDT",
        trim: true,
        maxlength: 8,
    },
    receiptDate: {
        type: Date,
        default: Date.now,
        index: true,
    },
    status: {
        type: String,
        enum: [
            "normal",
            "warranty_active",
            "warranty_expiring",
            "return_open",
        ],
        default: "normal",
    },
    warrantyExpiry: {
        type: Date,
    },
    returnDeadline: {
        type: Date,
    },
    isFavorite: {
        type: Boolean,
        default: false,
    },
    imageUrl: {
        type: String,
        trim: true,
        maxlength: 1000,
    },
    imagePublicId: {
        type: String,
        trim: true,
        maxlength: 300,
    },
    isAiParsed: {
        type: Boolean,
        default: false,
    },
    /* =========================
       LEGACY OPTIONAL FIELDS
    ========================== */
    merchantName: {
        type: String,
        trim: true,
    },
    amount: {
        type: Number,
        min: 0,
    },
    tax: {
        type: Number,
        min: 0,
    },
    category: {
        type: String,
        trim: true,
    },
    paymentMethod: {
        type: String,
        trim: true,
    },
    receiptNumber: {
        type: String,
        trim: true,
    },
    tags: {
        type: [String],
        default: undefined,
    },
}, {
    timestamps: true,
});
receiptSchema.index({
    userId: 1,
    receiptDate: -1,
});
exports.Receipt = mongoose_1.default.models.Receipt ||
    mongoose_1.default.model("Receipt", receiptSchema);
exports.default = exports.Receipt;
