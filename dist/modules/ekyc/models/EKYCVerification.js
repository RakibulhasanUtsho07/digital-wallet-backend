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
exports.EKYCVerification = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const encryptedFieldSchema = new mongoose_1.Schema({
    encrypted: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyVersion: { type: String, required: true },
}, { _id: false });
const statusValues = [
    "QUEUED", "PROCESSING", "VERIFIED", "PENDING_MANUAL_REVIEW", "REJECTED",
];
const ekycVerificationSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: statusValues, required: true, default: "QUEUED", index: true },
    reasonCodes: { type: [String], default: [] },
    providerName: { type: String, maxlength: 80 },
    providerReferenceEncrypted: { type: encryptedFieldSchema },
    nidLookupHash: { type: String, required: true, select: false },
    nidEncrypted: { type: encryptedFieldSchema, required: true, select: false },
    dateOfBirthEncrypted: { type: encryptedFieldSchema, required: true, select: false },
    claimedNameEncrypted: { type: encryptedFieldSchema, required: true, select: false },
    mediaRefsEncrypted: { type: encryptedFieldSchema, required: true, select: false },
    correlationId: { type: String, required: true, maxlength: 120, index: true },
    attemptId: { type: String, required: true, maxlength: 120, unique: true },
    faceScore: { type: Number, min: 0, max: 100 },
    nameScore: { type: Number, min: 0, max: 100 },
    livenessPassed: { type: Boolean },
    possibleDuplicateVectorId: { type: String, maxlength: 120 },
    submittedAt: { type: Date, required: true, default: Date.now },
    decidedAt: { type: Date },
}, {
    timestamps: true,
    versionKey: false,
    strict: "throw",
});
// Race-safe uniqueness: several pending attempts may exist, but only one account can
// transition to VERIFIED for a given deterministic HMAC of the normalized NID.
ekycVerificationSchema.index({ nidLookupHash: 1 }, {
    unique: true,
    partialFilterExpression: { status: "VERIFIED" },
    name: "uniq_verified_nid",
});
ekycVerificationSchema.index({ userId: 1 }, {
    unique: true,
    partialFilterExpression: { status: "VERIFIED" },
    name: "uniq_verified_user",
});
ekycVerificationSchema.index({ status: 1, submittedAt: 1 });
exports.EKYCVerification = mongoose_1.default.models.EKYCVerification ??
    mongoose_1.default.model("EKYCVerification", ekycVerificationSchema);
exports.default = exports.EKYCVerification;
