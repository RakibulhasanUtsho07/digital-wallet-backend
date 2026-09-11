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
exports.RevenueFeePolicy = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const integerValidator = {
    validator: Number.isSafeInteger,
    message: "Value must be a safe integer.",
};
const revenueFeePolicySchema = new mongoose_1.Schema({
    key: {
        type: String,
        enum: [
            "global",
        ],
        default: "global",
        unique: true,
        immutable: true,
    },
    transferFeeMinor: {
        type: Number,
        default: 1000,
        min: 0,
        max: 2500,
        validate: integerValidator,
    },
    withdrawalFeeMinor: {
        type: Number,
        default: 1800,
        min: 500,
        max: 4000,
        validate: integerValidator,
    },
    monthlyTxnEstimate: {
        type: Number,
        default: 150000,
        min: 50000,
        max: 300000,
        validate: integerValidator,
    },
    transferShareBps: {
        type: Number,
        default: 6000,
        min: 0,
        max: 10000,
        validate: integerValidator,
    },
    withdrawalShareBps: {
        type: Number,
        default: 4000,
        min: 0,
        max: 10000,
        validate: integerValidator,
    },
    /*
     * 120 bps = 1.2% volume dampening for each
     * additional ৳2.00 increase above the current fee.
     */
    elasticityBpsPer200Minor: {
        type: Number,
        default: 120,
        min: 0,
        max: 2500,
        validate: integerValidator,
    },
    revision: {
        type: Number,
        default: 1,
        min: 1,
    },
    updatedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
    },
}, {
    timestamps: true,
    versionKey: false,
    strict: "throw",
    minimize: false,
});
revenueFeePolicySchema.pre("validate", function () {
    if (this.transferShareBps +
        this.withdrawalShareBps !==
        10000) {
        throw new Error("Transfer and withdrawal shares must total 10000 basis points.");
    }
});
exports.RevenueFeePolicy = mongoose_1.default.models.RevenueFeePolicy ||
    mongoose_1.default.model("RevenueFeePolicy", revenueFeePolicySchema);
exports.default = exports.RevenueFeePolicy;
