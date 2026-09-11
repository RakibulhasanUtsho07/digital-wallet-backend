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
exports.PendingRegistration = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const encryptedFieldSchema = new mongoose_1.Schema({
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
}, { _id: false });
const pendingRegistrationSchema = new mongoose_1.Schema({
    emailLookup: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    emailEncrypted: {
        type: encryptedFieldSchema,
        required: true,
    },
    phoneEncrypted: {
        type: encryptedFieldSchema,
        default: undefined,
    },
    phoneLookup: {
        type: String,
        default: undefined,
        index: true,
    },
    passwordHash: {
        type: String,
        required: true,
        select: false,
    },
    passwordPolicyVersion: {
        type: Number,
        default: 1,
    },
    avatarUrl: {
        type: String,
        required: true,
    },
    avatarPublicId: {
        type: String,
        required: true,
    },
    codeHash: {
        type: String,
        required: true,
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
    },
    lastSentAt: {
        type: Date,
        required: true,
    },
}, {
    timestamps: true,
    versionKey: false,
});
/* =========================================================
   TTL INDEX

   MongoDB deletes the document automatically once expiresAt
   is in the past. This is the ONLY cleanup mechanism needed
   for abandoned registrations.
========================================================= */
pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const PendingRegistrationModel = mongoose_1.default.models
    .PendingRegistration ||
    mongoose_1.default.model("PendingRegistration", pendingRegistrationSchema);
exports.PendingRegistration = PendingRegistrationModel;
exports.default = PendingRegistrationModel;
