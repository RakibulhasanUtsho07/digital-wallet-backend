import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type KYCStatus =
  | "not_started"
  | "pending"
  | "under_review"
  | "verified"
  | "rejected";

export type KYCProvider =
  | "manual"
  | "stripe"
  | "other";

export type DocumentType =
  | "nid"
  | "passport"
  | "driving_license";

/* =========================================================
   INTERFACE
========================================================= */

export interface IKYC extends Document {
  userId: mongoose.Types.ObjectId;

  documentType?: DocumentType;

  documentNumber?: string;

  /*
   * Cloudinary private asset IDs
   */
  frontImagePublicId?: string;

  backImagePublicId?: string;

  selfieImagePublicId?: string;

  /*
   * Keep these temporarily for backward compatibility.
   */
  frontImageUrl?: string;

  backImageUrl?: string;

  selfieImageUrl?: string;

  verificationSessionId?: string;

  provider: KYCProvider;

  status: KYCStatus;

  rejectionReason?: string;

  submittedAt?: Date;

  verifiedAt?: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const kycSchema =
  new Schema<IKYC>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
      },

      documentType: {
        type: String,
        enum: [
          "nid",
          "passport",
          "driving_license",
        ],
      },

      documentNumber: {
        type: String,
        trim: true,
      },

      /* =====================================================
         CLOUDINARY PRIVATE ASSET IDS
      ====================================================== */

      frontImagePublicId: {
        type: String,
      },

      backImagePublicId: {
        type: String,
      },

      selfieImagePublicId: {
        type: String,
      },

      /* =====================================================
         LEGACY IMAGE URL FIELDS
      ====================================================== */

      frontImageUrl: {
        type: String,
      },

      backImageUrl: {
        type: String,
      },

      selfieImageUrl: {
        type: String,
      },

      verificationSessionId: {
        type: String,
        index: true,
      },

      provider: {
        type: String,
        enum: [
          "manual",
          "stripe",
          "other",
        ],
        default: "manual",
      },

      status: {
        type: String,
        enum: [
          "not_started",
          "pending",
          "under_review",
          "verified",
          "rejected",
        ],
        default: "not_started",
      },

      rejectionReason: {
        type: String,
        trim: true,
      },

      submittedAt: {
        type: Date,
      },

      verifiedAt: {
        type: Date,
      },
    },

    {
      timestamps: true,
    }
  );

/* =========================================================
   MODEL
========================================================= */

export const KYC =
  mongoose.models.KYC ||
  mongoose.model<IKYC>(
    "KYC",
    kycSchema
  );