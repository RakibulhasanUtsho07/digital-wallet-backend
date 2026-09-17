import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

import type {
  EncryptedData,
} from "../utils/crypto.js";

/* =========================================================
   TYPES
========================================================= */

export type MerchantVerificationStatus =
  | "not_started"
  | "submitted"
  | "under_review"
  | "verified"
  | "rejected";

export type MerchantRegistrationType =
  | "trade_license"
  | "company_registration"
  | "partnership_deed"
  | "other";

export type MerchantBusinessDocumentKind =
  | "registration"
  | "tax"
  | "bank";

export interface IMerchantBusinessDocument {
  kind:
    MerchantBusinessDocumentKind;

  mimeType: string;

  size: number;

  objectRefEncrypted:
    EncryptedData;

  uploadedAt: Date;
}

export interface IMerchantVerification
  extends Document {
  merchantId:
    mongoose.Types.ObjectId;

  ownerId:
    mongoose.Types.ObjectId;

  /*
   * Existing verified NID/e-KYC record.
   * NID images are not copied into this collection.
   */
  ownerEkycVerificationId:
    mongoose.Types.ObjectId;

  status:
    MerchantVerificationStatus;

  legalBusinessName: string;

  registrationType:
    MerchantRegistrationType;

  registrationNumberEncrypted:
    EncryptedData;

  registrationNumberHash: string;

  registrationNumberLast4: string;

  businessAddress: string;

  documents:
    IMerchantBusinessDocument[];

  submissionVersion: number;

  submittedAt?: Date;

  reviewStartedAt?: Date;

  reviewedAt?: Date;

  reviewedBy?:
    mongoose.Types.ObjectId;

  rejectionReason?: string;

  internalReviewNote?: string;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   REUSABLE SCHEMAS
========================================================= */

const encryptedDataSchema =
  new Schema<EncryptedData>(
    {
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
    },
    {
      _id: false,
    }
  );

const businessDocumentSchema =
  new Schema<IMerchantBusinessDocument>(
    {
      kind: {
        type: String,

        enum: [
          "registration",
          "tax",
          "bank",
        ],

        required: true,
      },

      mimeType: {
        type: String,
        required: true,
        maxlength: 100,
      },

      size: {
        type: Number,
        required: true,
        min: 1,
        max:
          5 * 1024 * 1024,
      },

      objectRefEncrypted: {
        type:
          encryptedDataSchema,

        required: true,
      },

      uploadedAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
    },
    {
      _id: false,
    }
  );

/* =========================================================
   MERCHANT VERIFICATION SCHEMA
========================================================= */

const merchantVerificationSchema =
  new Schema<IMerchantVerification>(
    {
      merchantId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Merchant",

        required: true,

        index: true,

        immutable: true,
      },

      ownerId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required: true,

        index: true,

        immutable: true,
      },

      ownerEkycVerificationId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "EKYCVerification",

        required: true,

        index: true,
      },

      status: {
        type: String,

        enum: [
          "not_started",
          "submitted",
          "under_review",
          "verified",
          "rejected",
        ],

        required: true,

        default:
          "not_started",

        index: true,
      },

      legalBusinessName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 160,
      },

      registrationType: {
        type: String,

        enum: [
          "trade_license",
          "company_registration",
          "partnership_deed",
          "other",
        ],

        required: true,
      },

      registrationNumberEncrypted: {
        type:
          encryptedDataSchema,

        required: true,

        select: false,
      },

      registrationNumberHash: {
        type: String,
        required: true,
        maxlength: 64,
        select: false,
      },

      registrationNumberLast4: {
        type: String,
        required: true,
        minlength: 1,
        maxlength: 4,
      },

      businessAddress: {
        type: String,
        required: true,
        trim: true,
        minlength: 5,
        maxlength: 500,
      },

      documents: {
        type: [
          businessDocumentSchema,
        ],

        required: true,

        validate: {
          validator: (
            value: IMerchantBusinessDocument[]
          ): boolean => {
            return (
              Array.isArray(value) &&
              value.some(
                (document) =>
                  document.kind ===
                  "registration"
              )
            );
          },

          message:
            "A business registration document is required.",
        },
      },

      submissionVersion: {
        type: Number,
        required: true,
        default: 1,
        min: 1,
      },

      submittedAt: {
        type: Date,
        index: true,
      },

      reviewStartedAt: {
        type: Date,
      },

      reviewedAt: {
        type: Date,
      },

      reviewedBy: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",
      },

      rejectionReason: {
        type: String,
        trim: true,
        maxlength: 1000,
      },

      internalReviewNote: {
        type: String,
        trim: true,
        maxlength: 2000,
        select: false,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: "throw",
    }
  );

/* =========================================================
   INDEXES
========================================================= */

merchantVerificationSchema.index(
  {
    merchantId: 1,
  },
  {
    unique: true,
    name:
      "unique_merchant_verification",
  }
);

merchantVerificationSchema.index(
  {
    status: 1,
    submittedAt: 1,
  },
  {
    name:
      "merchant_verification_review_queue",
  }
);

merchantVerificationSchema.index(
  {
    ownerId: 1,
    updatedAt: -1,
  },
  {
    name:
      "merchant_verification_owner_history",
  }
);

/*
 * One verified business registration cannot activate
 * multiple merchant accounts.
 */
merchantVerificationSchema.index(
  {
    registrationNumberHash: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      status: "verified",
    },

    name:
      "unique_verified_business_registration",
  }
);

/* =========================================================
   MODEL
========================================================= */

const MerchantVerificationModel:
  Model<IMerchantVerification> =
  (
    mongoose.models
      .MerchantVerification as
      | Model<IMerchantVerification>
      | undefined
  ) ??
  mongoose.model<IMerchantVerification>(
    "MerchantVerification",
    merchantVerificationSchema
  );

export const MerchantVerification =
  MerchantVerificationModel;

export default
  MerchantVerificationModel;
