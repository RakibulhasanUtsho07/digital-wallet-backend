import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

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

export type AccountStatus =
  | "active"
  | "deleted";

export type KYCStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "rejected";

/* =========================================================
   THEME
========================================================= */

export type ThemeMode =
  | "light"
  | "dark"
  | "eye-care"
  | "ocean"
  | "forest";

/* =========================================================
   USER PREFERENCES
========================================================= */

export interface IUserPreferences {
  theme: ThemeMode;
}

/* =========================================================
   USER
========================================================= */

export interface IUser extends Document {
  name: string;

  /* Cloudinary */
  avatarUrl?: string;
  avatarPublicId?: string;

  /* Secure contact storage */
  emailEncrypted: IEncryptedData;
  emailLookup: string;

  phoneEncrypted?: IEncryptedData;
  phoneLookup?: string;

  /* Authentication */
  password: string;
  role: UserRole;
  authVersion: number;

  /* Account */
  accountStatus: AccountStatus;
  deletedAt?: Date;

  /* Email verification */
  emailVerified: boolean;
  emailVerifiedAt?: Date;

  /* Security */
  passwordPolicyVersion: number;
  passwordChangedAt?: Date;

  /* KYC */
  kycStatus: KYCStatus;

  /* Wallet */
  walletId?: mongoose.Types.ObjectId;

  /* User Preferences */
  preferences: IUserPreferences;

  /* Password reset */
  resetPasswordTokenHash?: string;
  resetPasswordExpires?: Date;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   ENCRYPTED DATA SCHEMA
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
   USER PREFERENCES SCHEMA
========================================================= */

const userPreferencesSchema =
  new Schema<IUserPreferences>(
    {
      theme: {
        type: String,
        enum: [
          "light",
          "dark",
          "eye-care",
          "ocean",
          "forest",
        ],
        default: "light",
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
        minlength: 2,
        maxlength: 100,
      },

      avatarUrl: {
        type: String,
        trim: true,
        default: "",
      },

      avatarPublicId: {
        type: String,
        trim: true,
        default: "",
        select: false,
      },

      /* =====================================================
         EMAIL
      ====================================================== */

      emailEncrypted: {
        type: encryptedDataSchema,
        required: true,
      },

      emailLookup: {
        type: String,
        required: true,
        trim: true,
      },

      /* =====================================================
         PHONE
      ====================================================== */

      phoneEncrypted: {
        type: encryptedDataSchema,
        default: undefined,
      },

      phoneLookup: {
        type: String,
        trim: true,
        default: undefined,
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

      /* =====================================================
         ACCOUNT STATUS
      ====================================================== */

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
        default: undefined,
      },

      /* =====================================================
         EMAIL VERIFICATION
      ====================================================== */

      emailVerified: {
        type: Boolean,
        default: false,
        index: true,
      },

      emailVerifiedAt: {
        type: Date,
        default: undefined,
      },

      /* =====================================================
         PASSWORD SECURITY
      ====================================================== */

      passwordPolicyVersion: {
        type: Number,
        default: 1,
        min: 1,
      },

      passwordChangedAt: {
        type: Date,
        default: undefined,
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
        default: "not_started",
        required: true,
        index: true,
      },

      /* =====================================================
         WALLET
      ====================================================== */

      walletId: {
        type: Schema.Types.ObjectId,
        ref: "Wallet",
        default: undefined,
      },

      /* =====================================================
         USER PREFERENCES
      ====================================================== */

      preferences: {
        type: userPreferencesSchema,
        default: () => ({
          theme: "light",
        }),
        required: true,
      },

      /* =====================================================
         RESET PASSWORD
      ====================================================== */

      resetPasswordTokenHash: {
        type: String,
        select: false,
        default: undefined,
      },

      resetPasswordExpires: {
        type: Date,
        select: false,
        default: undefined,
      },
    },

    {
      timestamps: true,
      versionKey: false,
      strict: true,

      /* =====================================================
         SAFE JSON
      ====================================================== */

      toJSON: {
        virtuals: true,

        transform: (
          _document,
          returnedObject
        ) => {
          const rawObject =
            returnedObject as unknown as Record<
              string,
              unknown
            >;

          const {
            password: _password,
            avatarPublicId:
              _avatarPublicId,
            resetPasswordTokenHash:
              _resetPasswordTokenHash,
            resetPasswordExpires:
              _resetPasswordExpires,
            emailEncrypted:
              _emailEncrypted,
            phoneEncrypted:
              _phoneEncrypted,
            emailLookup:
              _emailLookup,
            phoneLookup:
              _phoneLookup,
            ...safeObject
          } = rawObject;

          return safeObject;
        },
      },

      toObject: {
        virtuals: true,
      },
    }
  );

/* =========================================================
   INDEXES
========================================================= */

userSchema.index(
  {
    emailLookup: 1,
  },
  {
    unique: true,
    name: "unique_user_email_lookup",
  }
);

userSchema.index(
  {
    phoneLookup: 1,
  },
  {
    unique: true,
    sparse: true,
    name: "unique_user_phone_lookup",
  }
);

userSchema.index(
  {
    role: 1,
    createdAt: -1,
  },
  {
    name: "user_role_created_at",
  }
);

userSchema.index(
  {
    accountStatus: 1,
    createdAt: -1,
  },
  {
    name: "user_status_created_at",
  }
);

userSchema.index(
  {
    kycStatus: 1,
    createdAt: -1,
  },
  {
    name: "user_kyc_status_created_at",
  }
);

userSchema.index(
  {
    emailVerified: 1,
    createdAt: -1,
  },
  {
    name: "user_email_verified_created_at",
  }
);

/* =========================================================
   MODEL
========================================================= */

const UserModel: Model<IUser> =
  (mongoose.models.User as Model<IUser>) ||
  mongoose.model<IUser>(
    "User",
    userSchema
  );

export const User = UserModel;

export default UserModel;