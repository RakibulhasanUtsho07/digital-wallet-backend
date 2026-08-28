import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   ENCRYPTED DATA TYPE
========================================================= */

export interface IEncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

/* =========================================================
   USER INTERFACE
========================================================= */

export interface IUser extends Document {
  name: string;

  /*
   * TEMPORARY LEGACY FIELDS
   *
   * Existing users migrate করার পর
   * এগুলো remove করা হবে।
   */
  email: string;
  phone?: string;

  /*
   * SECURE FIELDS
   */
  emailEncrypted?: IEncryptedData;
  emailLookup?: string;

  phoneEncrypted?: IEncryptedData;
  phoneLookup?: string;

  password: string;

  role:
    | "user"
    | "admin";

  kycStatus:
    | "not_started"
    | "pending"
    | "verified"
    | "rejected";

  walletId?: mongoose.Types.ObjectId;

  resetPasswordTokenHash?: string;
  resetPasswordExpires?: Date;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   ENCRYPTED DATA SUB-SCHEMA
========================================================= */

const encryptedDataSchema =
  new Schema<IEncryptedData>(
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
   USER SCHEMA
========================================================= */

const userSchema =
  new Schema<IUser>(
    {
      /* =====================================================
         BASIC INFO
      ====================================================== */

      name: {
        type: String,
        required: true,
        trim: true,
      },

      /* =====================================================
         TEMPORARY LEGACY EMAIL
      ====================================================== */

      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },

      /* =====================================================
         TEMPORARY LEGACY PHONE
      ====================================================== */

      phone: {
        type: String,
        trim: true,
      },

      /* =====================================================
         SECURE EMAIL
      ====================================================== */

      emailEncrypted: {
        type:
          encryptedDataSchema,
      },

      emailLookup: {
        type: String,
      },

      /* =====================================================
         SECURE PHONE
      ====================================================== */

      phoneEncrypted: {
        type:
          encryptedDataSchema,
      },

      phoneLookup: {
        type: String,
      },

      /* =====================================================
         PASSWORD
      ====================================================== */

      password: {
        type: String,
        required: true,
        select: false,
      },

      /* =====================================================
         ROLE
      ====================================================== */

      role: {
        type: String,

        enum: [
          "user",
          "admin",
        ],

        default:
          "user",
      },

      /* =====================================================
         KYC
      ====================================================== */

      kycStatus: {
        type: String,

        enum: [
          "not_started",
          "pending",
          "verified",
          "rejected",
        ],

        default:
          "not_started",
      },

      /* =====================================================
         WALLET
      ====================================================== */

      walletId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Wallet",
      },

      /* =====================================================
         PASSWORD RESET
      ====================================================== */

      resetPasswordTokenHash: {
        type: String,
        select: false,
      },

      resetPasswordExpires: {
        type: Date,
        select: false,
      },
    },
    {
      timestamps: true,
    }
  );

/* =========================================================
   SECURE LOOKUP INDEXES
========================================================= */

/*
 * HMAC email lookup
 *
 * sparse: true
 * কারণ existing users-এর emailLookup
 * এখনো নাও থাকতে পারে।
 */
userSchema.index(
  {
    emailLookup: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

/*
 * HMAC phone lookup
 */
userSchema.index(
  {
    phoneLookup: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

/* =========================================================
   MODEL
========================================================= */

export const User =
  mongoose.models.User ||
  mongoose.model<IUser>(
    "User",
    userSchema
  );

export default User;