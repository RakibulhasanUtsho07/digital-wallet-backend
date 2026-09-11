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
exports.EKYCAuditEvent = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const auditEventSchema = new mongoose_1.Schema({
    verificationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "EKYCVerification",
        required: true,
        immutable: true,
        index: true,
    },
    sequence: {
        type: Number,
        required: true,
        min: 1,
        immutable: true,
    },
    eventType: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
        immutable: true,
    },
    actorType: {
        type: String,
        enum: [
            "USER",
            "SYSTEM",
            "ADMIN",
        ],
        required: true,
        immutable: true,
    },
    actorIdHash: {
        type: String,
        maxlength: 128,
        immutable: true,
    },
    correlationId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
        immutable: true,
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true,
        default: {},
        immutable: true,
    },
    previousHash: {
        type: String,
        required: true,
        minlength: 64,
        maxlength: 64,
        immutable: true,
    },
    eventHash: {
        type: String,
        required: true,
        minlength: 64,
        maxlength: 64,
        immutable: true,
    },
    createdAt: {
        type: Date,
        required: true,
        default: Date.now,
        immutable: true,
    },
}, {
    versionKey: false,
    strict: "throw",
    minimize: false,
});
/* =========================================================
   INDEXES
========================================================= */
auditEventSchema.index({
    verificationId: 1,
    sequence: 1,
}, {
    unique: true,
    name: "uniq_ekyc_audit_sequence",
});
auditEventSchema.index({
    eventHash: 1,
}, {
    unique: true,
    name: "uniq_ekyc_audit_hash",
});
auditEventSchema.index({
    correlationId: 1,
    createdAt: -1,
});
auditEventSchema.index({
    eventType: 1,
    createdAt: -1,
});
/* =========================================================
   APPLICATION-LEVEL IMMUTABILITY
========================================================= */
function blockAuditMutation() {
    throw new Error("e-KYC audit events are append-only and cannot be modified or deleted.");
}
auditEventSchema.pre("updateOne", blockAuditMutation);
auditEventSchema.pre("updateMany", blockAuditMutation);
auditEventSchema.pre("replaceOne", blockAuditMutation);
auditEventSchema.pre("findOneAndUpdate", blockAuditMutation);
auditEventSchema.pre("findOneAndReplace", blockAuditMutation);
auditEventSchema.pre("deleteOne", blockAuditMutation);
auditEventSchema.pre("deleteMany", blockAuditMutation);
auditEventSchema.pre("findOneAndDelete", blockAuditMutation);
exports.EKYCAuditEvent = mongoose_1.default.models
    .EKYCAuditEvent ??
    mongoose_1.default.model("EKYCAuditEvent", auditEventSchema);
exports.default = exports.EKYCAuditEvent;
