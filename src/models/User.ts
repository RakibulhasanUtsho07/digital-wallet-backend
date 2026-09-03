import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface IEncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

export type UserRole =
  | "user"
  | "support"
  | "analyst"
  | "admin";

export interface IUser extends Document {
  name: string;

  emailEncrypted: IEncryptedData;
  emailLookup: string;

  phoneEncrypted?: IEncryptedData;
  phoneLookup?: string;

  password: string;
  role: UserRole;

  authVersion: number;

  accountStatus:
    | "active"
    | "deleted";

  deletedAt?: Date;

  /*
   * Email verification is intentionally separate from the fact
   * that an encrypted email exists.
   */
  emailVerified: boolean;
  emailVerifiedAt?: Date;

  /*
   * Version 2 means the password was created or changed under
   * the Security Center password policy.
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
    },
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
          "support",
          "analyst",
          "admin",
        ],
        default: "user",
        required: true,
        index: true,
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
        required: true,
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
        required: true,
        index: true,
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
      versionKey: false,
    },
  );

/*
 * Unique lookup index for encrypted email addresses.
 */
userSchema.index(
  {
    emailLookup: 1,
  },
  {
    unique: true,
  },
);

/*
 * Phone is optional, therefore the unique index is sparse.
 */
userSchema.index(
  {
    phoneLookup: 1,
  },
  {
    unique: true,
    sparse: true,
  },
);

/*
 * Useful indexes for administrator user filtering.
 */
userSchema.index({
  role: 1,
  createdAt: -1,
});

userSchema.index({
  accountStatus: 1,
  createdAt: -1,
});

export const User =
  mongoose.models.User ||
  mongoose.model<IUser>(
    "User",
    userSchema,
  );

export default User;