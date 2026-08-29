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

export interface IEncryptedKYCData {
  encrypted: string;
  iv: string;
  authTag: string;
}

/* =========================================================
   INTERFACE
========================================================= */

export interface IKYC extends Document {
  userId: mongoose.Types.ObjectId;

  documentType?: DocumentType;

  /*
   * TEMPORARY LEGACY FIELD.
   *
   * Keep only while existing KYC records are being migrated.
   * New submissions must NOT write plaintext here.
   */
  documentNumber?: string;

  /*
   * AES-256-GCM encrypted identity-document number.
   */
  documentNumberEncrypted?: IEncryptedKYCData;

  /*
   * HMAC-SHA256 lookup value.
   * Supports equality checks without storing plaintext.
   */
  documentNumberLookup?: string;

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

  createdAt?: Date;
  updatedAt?: Date;
}

/* =========================================================
   ENCRYPTED VALUE SCHEMA
========================================================= */

const encryptedDataSchema =
  new Schema<IEncryptedKYCData>(
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

      /* =====================================================
         LEGACY PLAINTEXT DOCUMENT NUMBER

         Do not remove yet. Existing records need migration.
         New writes use documentNumberEncrypted only.
      ====================================================== */

      documentNumber: {
        type: String,
        trim: true,
        required: false,
      },

      /* =====================================================
         SECURE DOCUMENT NUMBER
      ====================================================== */

      documentNumberEncrypted: {
        type: encryptedDataSchema,
        required: false,
      },

      documentNumberLookup: {
        type: String,
        trim: true,
        required: false,
        index: true,
      },

      frontImagePublicId: {
        type: String,
      },

      backImagePublicId: {
        type: String,
      },

      selfieImagePublicId: {
        type: String,
      },

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
