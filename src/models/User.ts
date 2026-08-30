import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface IEncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

export interface IUser extends Document {
  name: string;

  emailEncrypted: IEncryptedData;
  emailLookup: string;
  phoneEncrypted?: IEncryptedData;
  phoneLookup?: string;

  password: string;
  role:
    | "user"
    | "admin";

  authVersion: number;
  accountStatus:
    | "active"
    | "deleted";
  deletedAt?: Date;

  /*
   * Email verification is intentionally separate from the fact
   * that an encrypted email exists. Existing accounts remain false
   * until a real verification flow marks them verified.
   */
  emailVerified: boolean;
  emailVerifiedAt?: Date;

  /*
   * Version 2 means the password was created/changed under the
   * Security Center password policy.
   */
  passwordPolicyVersion: number;
  passwordChangedAt?: Date;

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

const userSchema =
  new Schema<IUser>(
    {
      name: {
        type: String,
        required: true,
        trim: true,
      },

      emailEncrypted: {
        type: encryptedDataSchema,
        required: true,
      },
      emailLookup: {
        type: String,
        required: true,
      },

      phoneEncrypted: {
        type: encryptedDataSchema,
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
        default: "user",
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
        default: "active",
        index: true,
      },

      deletedAt: {
        type: Date,
      },

      emailVerified: {
        type: Boolean,
        default: false,
      },

      emailVerifiedAt: {
        type: Date,
      },

      passwordPolicyVersion: {
        type: Number,
        default: 1,
        min: 1,
      },

      passwordChangedAt: {
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
        default: "not_started",
      },

      walletId: {
        type: Schema.Types.ObjectId,
        ref: "Wallet",
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
      timestamps: true,
    }
  );

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

export const User =
  mongoose.models.User ||
  mongoose.model<IUser>(
    "User",
    userSchema
  );

export default User;
