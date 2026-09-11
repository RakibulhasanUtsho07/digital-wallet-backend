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
exports.TwoFactorChallenge = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const twoFactorChallengeSchema = new mongoose_1.Schema({
    challengeId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    purpose: {
        type: String,
        enum: ["login"],
        default: "login",
        required: true,
    },
    method: {
        type: String,
        enum: [
            "app",
            "email",
            "sms",
        ],
        required: true,
    },
    codeHash: {
        type: String,
        select: false,
    },
    attempts: {
        type: Number,
        default: 0,
        min: 0,
    },
    maxAttempts: {
        type: Number,
        default: 5,
        min: 1,
        max: 10,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true,
    },
    consumedAt: {
        type: Date,
        default: undefined,
    },
}, {
    timestamps: true,
    versionKey: false,
});
twoFactorChallengeSchema.index({
    expiresAt: 1,
}, {
    expireAfterSeconds: 0,
});
exports.TwoFactorChallenge = mongoose_1.default.models.TwoFactorChallenge ||
    mongoose_1.default.model("TwoFactorChallenge", twoFactorChallengeSchema);
exports.default = exports.TwoFactorChallenge;
