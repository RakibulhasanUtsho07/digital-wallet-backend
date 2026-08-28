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

  /* =======================================================
     SECURE EMAIL
  ======================================================== */

  emailEncrypted: IEncryptedData;
  emailLookup: string;

  /* =======================================================
     SECURE PHONE
  ======================================================== */

  phoneEncrypted?: IEncryptedData;
  phoneLookup?: string;

  /* =======================================================
     AUTH
  ======================================================== */

  password: string;

  role:
    | "user"
    | "admin";

  /* =======================================================
     KYC
  ======================================================== */

  kycStatus:
    | "not_started"
    | "pending"
    | "verified"
    | "rejected";

  /* =======================================================
     WALLET
  ======================================================== */

  walletId?: mongoose.Types.ObjectId;

  /* =======================================================
     PASSWORD RESET
  ======================================================== */

  resetPasswordTokenHash?: string;
  resetPasswordExpires?: Date;

  /* =======================================================
     TIMESTAMPS
  ======================================================== */

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
         SECURE EMAIL

         Original email is AES-256-GCM encrypted.
      ====================================================== */

      emailEncrypted: {
        type:
          encryptedDataSchema,

        required:
          true,
      },

      /*
       * HMAC-SHA256 lookup value.
       *
       * Login / Forgot Password /
       * Duplicate check use this field.
       */
      emailLookup: {
        type: String,
        required: true,
      },

      /* =====================================================
         SECURE PHONE
      ====================================================== */

      phoneEncrypted: {
        type:
          encryptedDataSchema,
      },

      /*
       * Send Money recipient lookup
       * uses this HMAC value.
       */
      phoneLookup: {
        type: String,
      },

      /* =====================================================
         PASSWORD
      ====================================================== */

      password: {
        type: String,
        required: true,

        /*
         * Password hash normally
         * query result-এ আসবে না।
         */
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
         KYC STATUS
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
         PASSWORD RESET TOKEN HASH
      ====================================================== */

      resetPasswordTokenHash: {
        type: String,
        select: false,
      },

      /* =====================================================
         PASSWORD RESET EXPIRATION
      ====================================================== */

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
   SECURE EMAIL LOOKUP INDEX

   Email is required for every user,
   therefore sparse is not needed anymore.
========================================================= */

userSchema.index(
  {
    emailLookup: 1,
  },
  {
    unique: true,
  }
);

/* =========================================================
   SECURE PHONE LOOKUP INDEX

   Phone is optional,
   therefore sparse stays enabled.
========================================================= */

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
   USER MODEL
========================================================= */

export const User =
  mongoose.models.User ||
  mongoose.model<IUser>(
    "User",
    userSchema
  );

export default User;