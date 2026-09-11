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
exports.PlatformSettingsAudit = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   SCHEMA
========================================================= */
const platformSettingsAuditSchema = new mongoose_1.Schema({
    /* =====================================================
       ACTOR
    ====================================================== */
    actorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true,
        index: true,
    },
    actorRole: {
        type: String,
        enum: [
            "admin",
        ],
        default: "admin",
        required: true,
        immutable: true,
    },
    /* =====================================================
       ACTION
    ====================================================== */
    action: {
        type: String,
        enum: [
            "SETTINGS_UPDATED",
            "SETTINGS_RESET",
        ],
        required: true,
        immutable: true,
        index: true,
    },
    severity: {
        type: String,
        enum: [
            "normal",
            "warning",
            "critical",
        ],
        required: true,
        immutable: true,
        index: true,
    },
    /* =====================================================
       REVISION
    ====================================================== */
    revision: {
        type: Number,
        required: true,
        immutable: true,
        unique: true,
        min: 1,
        index: true,
    },
    /* =====================================================
       REQUEST TRACE
    ====================================================== */
    requestId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 100,
    },
    /* =====================================================
       CHANGES
    ====================================================== */
    changedSections: {
        type: [
            String,
        ],
        required: true,
        immutable: true,
        default: [],
    },
    changedFields: {
        type: [
            String,
        ],
        required: true,
        immutable: true,
        default: [],
    },
    /* =====================================================
       PRIVACY-PRESERVING REQUEST METADATA
    ====================================================== */
    sourceIpHash: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
    },
    userAgentHash: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
    },
    /* =====================================================
       CONFIGURATION FINGERPRINTS
    ====================================================== */
    beforeFingerprint: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
    },
    afterFingerprint: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
    },
    /* =====================================================
       AUDIT HASH CHAIN
    ====================================================== */
    previousAuditHash: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
    },
    auditHash: {
        type: String,
        required: true,
        immutable: true,
        unique: true,
        trim: true,
    },
    /* =====================================================
       EVENT TIME
    ====================================================== */
    occurredAt: {
        type: Date,
        required: true,
        immutable: true,
        default: Date.now,
    },
}, {
    timestamps: true,
    /*
     * No __v field needed because audit documents
     * must never be updated.
     */
    versionKey: false,
    /*
     * Unknown fields cause an error instead of
     * silently entering the audit record.
     */
    strict: "throw",
    minimize: false,
});
/* =========================================================
   INDEXES
========================================================= */
/*
 * Recent audit activity.
 */
platformSettingsAuditSchema.index({
    occurredAt: -1,
});
/*
 * Severity filtering.
 */
platformSettingsAuditSchema.index({
    severity: 1,
    occurredAt: -1,
});
/*
 * Admin-specific audit lookup.
 */
platformSettingsAuditSchema.index({
    actorId: 1,
    occurredAt: -1,
});
/*
 * Changed-section filtering.
 */
platformSettingsAuditSchema.index({
    changedSections: 1,
    occurredAt: -1,
});
/* =========================================================
   APPEND-ONLY PROTECTION
========================================================= */
/*
 * IMPORTANT:
 *
 * Audit documents should only ever be:
 *
 * CREATE ✅
 * READ   ✅
 *
 * They should never be:
 *
 * UPDATE ❌
 * REPLACE ❌
 * DELETE ❌
 *
 * Regex middleware avoids the Mongoose TypeScript
 * overload issue that happens with:
 *
 * schema.pre(
 *   "findOneAndDelete",
 *   next => ...
 * )
 */
platformSettingsAuditSchema.pre(/^(updateOne|updateMany|findOneAndUpdate|replaceOne|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete)$/, function () {
    throw new Error("Platform settings audit records are append-only.");
});
/* =========================================================
   DOCUMENT SAVE PROTECTION
========================================================= */
/*
 * A newly created audit document may be saved once.
 *
 * Calling document.save() again on an existing record
 * is blocked.
 */
platformSettingsAuditSchema.pre("save", function () {
    if (!this.isNew) {
        throw new Error("Existing platform settings audit records cannot be modified.");
    }
});
/* =========================================================
   VALIDATE HASH FIELDS
========================================================= */
platformSettingsAuditSchema.pre("validate", function () {
    if (!this.auditHash ||
        this.auditHash.length <
            32) {
        throw new Error("Invalid audit hash.");
    }
    if (!this.beforeFingerprint ||
        this.beforeFingerprint.length <
            32) {
        throw new Error("Invalid before-settings fingerprint.");
    }
    if (!this.afterFingerprint ||
        this.afterFingerprint.length <
            32) {
        throw new Error("Invalid after-settings fingerprint.");
    }
    if (!this.previousAuditHash) {
        throw new Error("Previous audit hash is required.");
    }
});
/* =========================================================
   MODEL
========================================================= */
exports.PlatformSettingsAudit = mongoose_1.default.models
    .PlatformSettingsAudit ||
    mongoose_1.default.model("PlatformSettingsAudit", platformSettingsAuditSchema);
exports.default = exports.PlatformSettingsAudit;
