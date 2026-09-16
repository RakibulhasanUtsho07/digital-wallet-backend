import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type MerchantSettingsAuditSection =
  | "general"
  | "business"
  | "checkout"
  | "branding"
  | "theme"
  | "notifications"
  | "security";

export type MerchantSettingsAuditAction =
  | "updated"
  | "reset";

/* =========================================================
   DOCUMENT
========================================================= */

export interface IMerchantSettingsAudit
  extends Document {
  merchantId:
    mongoose.Types.ObjectId;

  actorUserId:
    mongoose.Types.ObjectId;

  section:
    MerchantSettingsAuditSection;

  action:
    MerchantSettingsAuditAction;

  changedFields:
    string[];

  before:
    Record<
      string,
      unknown
    >;

  after:
    Record<
      string,
      unknown
    >;

  occurredAt:
    Date;

  createdAt:
    Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const merchantSettingsAuditSchema =
  new Schema<IMerchantSettingsAudit>(
    {
      merchantId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Merchant",

        required:
          true,

        immutable:
          true,

        index:
          true,
      },

      actorUserId: {
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

      section: {
        type:
          String,

        enum: [
          "general",
          "business",
          "checkout",
          "branding",
          "theme",
          "notifications",
          "security",
        ],

        required:
          true,

        immutable:
          true,

        index:
          true,
      },

      action: {
        type:
          String,

        enum: [
          "updated",
          "reset",
        ],

        required:
          true,

        immutable:
          true,
      },

      changedFields: {
        type: [
          String,
        ],

        required:
          true,

        default:
          [],

        immutable:
          true,
      },

      before: {
        type:
          Schema.Types.Mixed,

        required:
          true,

        immutable:
          true,

        default:
          {},
      },

      after: {
        type:
          Schema.Types.Mixed,

        required:
          true,

        immutable:
          true,

        default:
          {},
      },

      occurredAt: {
        type:
          Date,

        required:
          true,

        immutable:
          true,

        default:
          Date.now,

        index:
          true,
      },
    },
    {
      timestamps: {
        createdAt:
          true,

        updatedAt:
          false,
      },

      versionKey:
        false,

      strict:
        "throw",

      minimize:
        false,
    },
  );

/* =========================================================
   INDEXES
========================================================= */

merchantSettingsAuditSchema.index(
  {
    merchantId:
      1,

    occurredAt:
      -1,
  },
  {
    name:
      "merchant_settings_audit_history",
  },
);

merchantSettingsAuditSchema.index(
  {
    merchantId:
      1,

    section:
      1,

    occurredAt:
      -1,
  },
  {
    name:
      "merchant_settings_audit_section",
  },
);

/* =========================================================
   APPEND ONLY
========================================================= */

merchantSettingsAuditSchema.pre(
  /^(updateOne|updateMany|findOneAndUpdate|replaceOne|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete)$/,
  function () {
    throw new Error(
      "Merchant settings audit records are append-only.",
    );
  },
);

merchantSettingsAuditSchema.pre(
  "save",
  function () {
    if (
      !this.isNew
    ) {
      throw new Error(
        "Existing merchant settings audit records cannot be modified.",
      );
    }
  },
);

/* =========================================================
   MODEL
========================================================= */

const MerchantSettingsAuditModel:
  Model<IMerchantSettingsAudit> =
  (
    mongoose.models
      .MerchantSettingsAudit as
      Model<IMerchantSettingsAudit> |
      undefined
  ) ??
  mongoose.model<IMerchantSettingsAudit>(
    "MerchantSettingsAudit",
    merchantSettingsAuditSchema,
  );

export const MerchantSettingsAudit =
  MerchantSettingsAuditModel;

export default MerchantSettingsAuditModel;