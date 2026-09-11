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
exports.RevenueEvent = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const revenueEventSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        index: true,
    },
    idempotencyKey: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        maxlength: 180,
    },
    kind: {
        type: String,
        enum: [
            "TRANSFER_FEE",
            "WITHDRAWAL_FEE",
            "DEPOSIT_FEE",
            "SERVICE_FEE",
            "MERCHANT_FEE",
            "REFUND",
            "FEE_WAIVER",
            "GATEWAY_REVERSAL",
            "MICRO_FEE_ADJUSTMENT",
        ],
        required: true,
        index: true,
    },
    /*
     * Integer minor units (poisha).
     * Example: ৳10.00 => 1000.
     */
    feeMinor: {
        type: Number,
        required: true,
        min: 0,
        validate: {
            validator: Number.isSafeInteger,
            message: "feeMinor must be a safe integer.",
        },
    },
    volumeMinor: {
        type: Number,
        default: 0,
        min: 0,
        validate: {
            validator: Number.isSafeInteger,
            message: "volumeMinor must be a safe integer.",
        },
    },
    sourceReference: {
        type: String,
        trim: true,
        maxlength: 180,
        index: true,
    },
    occurredAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
}, {
    timestamps: true,
    versionKey: false,
    strict: "throw",
    minimize: false,
});
revenueEventSchema.index({
    kind: 1,
    occurredAt: -1,
});
revenueEventSchema.index({
    userId: 1,
    occurredAt: -1,
});
exports.RevenueEvent = mongoose_1.default.models.RevenueEvent ||
    mongoose_1.default.model("RevenueEvent", revenueEventSchema);
exports.default = exports.RevenueEvent;
