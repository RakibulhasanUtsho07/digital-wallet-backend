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

  emailEncrypted:
    IEncryptedData;

  emailLookup:
    string;

  /* =======================================================
     SECURE PHONE
  ======================================================== */

  phoneEncrypted?:
    IEncryptedData;

  phoneLookup?:
    string;

  /* =======================================================
     AUTH
  ======================================================== */

  password:
    string;

  role:
    | "user"
    | "admin";

  /*
   * Incrementing this invalidates every JWT
   * issued with an older authVersion.
   */
  authVersion:
    number;

  accountStatus:
    | "active"
    | "deleted";

  deletedAt?:
    Date;

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

  walletId?:
    mongoose.Types.ObjectId;

  /* =======================================================
     PASSWORD RESET
  ======================================================== */

  resetPasswordTokenHash?:
    string;

  resetPasswordExpires?:
    Date;

  /* =======================================================
     TIMESTAMPS
  ======================================================== */

  createdAt:
    Date;

  updatedAt:
    Date;
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
      name: {
        type: String,
        required: true,
        trim: true,
      },

      emailEncrypted: {
        type:
          encryptedDataSchema,

        required:
          true,
      },

      emailLookup: {
        type: String,
        required: true,
      },

      phoneEncrypted: {
        type:
          encryptedDataSchema,
      },

      phoneLookup: {
        type: String,
      },

      password: {
        type: String,
        required: true,
        select: false,
      },

      role: {
        type: String,

        enum: [
          "user",
          "admin",
        ],

        default:
          "user",
      },

      authVersion: {
        type: Number,
        default: 0,
        min: 0,
      },

      accountStatus: {
        type: String,

        enum: [
          "active",
          "deleted",
        ],

        default:
          "active",

        index:
          true,
      },

      deletedAt: {
        type: Date,
      },

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

      walletId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Wallet",
      },

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
      timestamps:
        true,
    }
  );

/* =========================================================
   LOOKUP INDEXES
========================================================= */

userSchema.index(
  {
    emailLookup: 1,
  },
  {
    unique: true,
  }
);

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
