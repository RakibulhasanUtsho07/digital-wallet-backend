import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type PlatformAuditSeverity =
  | "normal"
  | "warning"
  | "critical";

export type PlatformAuditAction =
  | "SETTINGS_UPDATED"
  | "SETTINGS_RESET";

/* =========================================================
   INTERFACE
========================================================= */

export interface IPlatformSettingsAudit
  extends Document {
  actorId:
    mongoose.Types.ObjectId;

  actorRole:
    "admin";

  action:
    PlatformAuditAction;

  severity:
    PlatformAuditSeverity;

  /*
   * Every successful platform-settings mutation
   * increments the configuration revision.
   */
  revision:
    number;

  /*
   * Unique request identifier used for tracing.
   */
  requestId:
    string;

  /*
   * Example:
   * ["platform", "risk"]
   */
  changedSections:
    string[];

  /*
   * Example:
   * [
   *   "platform.maintenanceMode",
   *   "risk.reviewThreshold"
   * ]
   */
  changedFields:
    string[];

  /*
   * Privacy-preserving request metadata.
   *
   * Never store raw IP or raw User-Agent here.
   */
  sourceIpHash:
    string;

  userAgentHash:
    string;

  /*
   * HMAC fingerprints of complete settings
   * before and after the change.
   */
  beforeFingerprint:
    string;

  afterFingerprint:
    string;

  /*
   * Tamper-evident audit-chain values.
   */
  previousAuditHash:
    string;

  auditHash:
    string;

  occurredAt:
    Date;

  createdAt:
    Date;

  updatedAt:
    Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const platformSettingsAuditSchema =
  new Schema<IPlatformSettingsAudit>(
    {
      /* =====================================================
         ACTOR
      ====================================================== */

      actorId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        immutable:
          true,

        index:
          true,
      },

      actorRole: {
        type:
          String,

        enum: [
          "admin",
        ],

        default:
          "admin",

        required:
          true,

        immutable:
          true,
      },

      /* =====================================================
         ACTION
      ====================================================== */

      action: {
        type:
          String,

        enum: [
          "SETTINGS_UPDATED",
          "SETTINGS_RESET",
        ],

        required:
          true,

        immutable:
          true,

        index:
          true,
      },

      severity: {
        type:
          String,

        enum: [
          "normal",
          "warning",
          "critical",
        ],

        required:
          true,

        immutable:
          true,

        index:
          true,
      },

      /* =====================================================
         REVISION
      ====================================================== */

      revision: {
        type:
          Number,

        required:
          true,

        immutable:
          true,

        unique:
          true,

        min:
          1,

        index:
          true,
      },

      /* =====================================================
         REQUEST TRACE
      ====================================================== */

      requestId: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,

        minlength:
          1,

        maxlength:
          100,
      },

      /* =====================================================
         CHANGES
      ====================================================== */

      changedSections: {
        type: [
          String,
        ],

        required:
          true,

        immutable:
          true,

        default:
          [],
      },

      changedFields: {
        type: [
          String,
        ],

        required:
          true,

        immutable:
          true,

        default:
          [],
      },

      /* =====================================================
         PRIVACY-PRESERVING REQUEST METADATA
      ====================================================== */

      sourceIpHash: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,
      },

      userAgentHash: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,
      },

      /* =====================================================
         CONFIGURATION FINGERPRINTS
      ====================================================== */

      beforeFingerprint: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,
      },

      afterFingerprint: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,
      },

      /* =====================================================
         AUDIT HASH CHAIN
      ====================================================== */

      previousAuditHash: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,
      },

      auditHash: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        unique:
          true,

        trim:
          true,
      },

      /* =====================================================
         EVENT TIME
      ====================================================== */

      occurredAt: {
        type:
          Date,

        required:
          true,

        immutable:
          true,

        default:
          Date.now,
      },
    },
    {
      timestamps:
        true,

      /*
       * No __v field needed because audit documents
       * must never be updated.
       */
      versionKey:
        false,

      /*
       * Unknown fields cause an error instead of
       * silently entering the audit record.
       */
      strict:
        "throw",

      minimize:
        false,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

/*
 * Recent audit activity.
 */

platformSettingsAuditSchema.index({
  occurredAt:
    -1,
});

/*
 * Severity filtering.
 */

platformSettingsAuditSchema.index({
  severity:
    1,

  occurredAt:
    -1,
});

/*
 * Admin-specific audit lookup.
 */

platformSettingsAuditSchema.index({
  actorId:
    1,

  occurredAt:
    -1,
});

/*
 * Changed-section filtering.
 */

platformSettingsAuditSchema.index({
  changedSections:
    1,

  occurredAt:
    -1,
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

platformSettingsAuditSchema.pre(
  /^(updateOne|updateMany|findOneAndUpdate|replaceOne|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete)$/,
  function () {
    throw new Error(
      "Platform settings audit records are append-only."
    );
  }
);

/* =========================================================
   DOCUMENT SAVE PROTECTION
========================================================= */

/*
 * A newly created audit document may be saved once.
 *
 * Calling document.save() again on an existing record
 * is blocked.
 */

platformSettingsAuditSchema.pre(
  "save",
  function () {
    if (
      !this.isNew
    ) {
      throw new Error(
        "Existing platform settings audit records cannot be modified."
      );
    }
  }
);

/* =========================================================
   VALIDATE HASH FIELDS
========================================================= */

platformSettingsAuditSchema.pre(
  "validate",
  function () {
    if (
      !this.auditHash ||
      this.auditHash.length <
        32
    ) {
      throw new Error(
        "Invalid audit hash."
      );
    }

    if (
      !this.beforeFingerprint ||
      this.beforeFingerprint.length <
        32
    ) {
      throw new Error(
        "Invalid before-settings fingerprint."
      );
    }

    if (
      !this.afterFingerprint ||
      this.afterFingerprint.length <
        32
    ) {
      throw new Error(
        "Invalid after-settings fingerprint."
      );
    }

    if (
      !this.previousAuditHash
    ) {
      throw new Error(
        "Previous audit hash is required."
      );
    }
  }
);

/* =========================================================
   MODEL
========================================================= */

export const PlatformSettingsAudit =
  mongoose.models
    .PlatformSettingsAudit ||
  mongoose.model<IPlatformSettingsAudit>(
    "PlatformSettingsAudit",
    platformSettingsAuditSchema
  );

export default PlatformSettingsAudit;