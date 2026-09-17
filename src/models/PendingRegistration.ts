import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   PENDING REGISTRATION

   Holds everything needed to create a real User document,
   but does NOT touch the `users` collection until the email
   OTP has been verified. If verification never happens, the
   TTL index below removes the document automatically once
   `expiresAt` passes — no user record, no cleanup job needed.
========================================================= */

interface EncryptedFieldShape {
  encrypted: string;
  iv: string;
  authTag: string;
}

export interface IPendingRegistration
  extends Document {
  emailLookup: string;

  name: string;

  emailEncrypted: EncryptedFieldShape;

  phoneEncrypted?: EncryptedFieldShape;

  phoneLookup?: string;

  passwordHash: string;

  passwordPolicyVersion: number;

  avatarUrl: string;

  avatarPublicId: string;

  codeHash: string;

  attempts: number;

  maxAttempts: number;

  expiresAt: Date;

  lastSentAt: Date;

  createdAt: Date;

  updatedAt: Date;
}

const encryptedFieldSchema =
  new Schema<EncryptedFieldShape>(
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

    { _id: false }
  );

const pendingRegistrationSchema =
  new Schema<IPendingRegistration>(
    {
      emailLookup: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },

      name: {
        type: String,
        required: true,
        trim: true,
      },

      emailEncrypted: {
        type: encryptedFieldSchema,
        required: true,
      },

      phoneEncrypted: {
        type: encryptedFieldSchema,
        default: undefined,
      },

      phoneLookup: {
        type: String,
        default: undefined,
        index: true,
      },

      passwordHash: {
        type: String,
        required: true,
        select: false,
      },

      passwordPolicyVersion: {
        type: Number,
        default: 1,
      },

      avatarUrl: {
        type: String,
        required: true,
      },

      avatarPublicId: {
        type: String,
        required: true,
      },

      codeHash: {
        type: String,
        required: true,
        select: false,
      },

      attempts: {
        type: Number,
        default: 0,
        min: 0,
      },

      maxAttempts: {
        type: Number,
        default: 5,
        min: 1,
        max: 10,
      },

      expiresAt: {
        type: Date,
        required: true,
      },

      lastSentAt: {
        type: Date,
        required: true,
      },
    },

    {
      timestamps: true,
      versionKey: false,
    }
  );

/* =========================================================
   TTL INDEX

   MongoDB deletes the document automatically once expiresAt
   is in the past. This is the ONLY cleanup mechanism needed
   for abandoned registrations.
========================================================= */

pendingRegistrationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

const PendingRegistrationModel =
  (mongoose.models
    .PendingRegistration as Model<IPendingRegistration>) ||
  mongoose.model<IPendingRegistration>(
    "PendingRegistration",
    pendingRegistrationSchema
  );

export const PendingRegistration =
  PendingRegistrationModel;

export default PendingRegistrationModel;