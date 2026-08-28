import mongoose, {
  Schema,
  Document,
} from "mongoose";

/* =========================================================
   ENCRYPTED DATA TYPE
========================================================= */

export interface IEncryptedTransactionData {
  encrypted: string;
  iv: string;
  authTag: string;
}

/* =========================================================
   TRANSACTION INTERFACE
========================================================= */

export interface ITransaction extends Document {
  senderId: mongoose.Types.ObjectId;

  receiverId: mongoose.Types.ObjectId;
  idempotencyKey?: string;
  /*
   * Amount is stored ONLY as encrypted minor units.
   *
   * Example:
   * BDT 500.00
   * -> 50000 poisha
   * -> AES-256-GCM encrypted
   */
  amountEncrypted: IEncryptedTransactionData;

  /*
   * Reference / note is stored ONLY in encrypted form.
   *
   * Optional because a transaction may not
   * contain a reference.
   */
  referenceEncrypted?: IEncryptedTransactionData;

  currency: string;

  type:
  | "TRANSFER"
  | "DEPOSIT"
  | "WITHDRAW";

  status:
  | "PENDING"
  | "COMPLETED"
  | "FAILED";

  riskScore:
  | "LOW"
  | "MEDIUM"
  | "HIGH";

  createdAt?: Date;

  updatedAt?: Date;
}

/* =========================================================
   ENCRYPTED DATA SCHEMA

   Reused for:
   - amountEncrypted
   - referenceEncrypted
========================================================= */

const encryptedDataSchema =
  new Schema<IEncryptedTransactionData>(
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
   TRANSACTION SCHEMA
========================================================= */

const transactionSchema =
  new Schema<ITransaction>(
    {
      senderId: {
        type: Schema.Types.ObjectId,

        ref: "User",

        required: true,
      },

      receiverId: {
        type: Schema.Types.ObjectId,

        ref: "User",

        required: true,
      },

      /* =====================================================
         SECURE AMOUNT

         Plaintext `amount` does NOT exist.
         Amount is stored as encrypted minor units only.
      ====================================================== */

      amountEncrypted: {
        type: encryptedDataSchema,

        required: true,
      },

      /* =====================================================
         SECURE REFERENCE

         Plaintext `reference` does NOT exist.
         Reference is optional and encrypted when provided.
      ====================================================== */

      referenceEncrypted: {
        type: encryptedDataSchema,

        required: false,
      },
idempotencyKey: {
  type: String,
  trim: true,
  required: false,
},
      currency: {
        type: String,

        default: "BDT",

        trim: true,

        uppercase: true,
      },

      type: {
        type: String,

        enum: [
          "TRANSFER",
          "DEPOSIT",
          "WITHDRAW",
        ],

        required: true,
      },

      status: {
        type: String,

        enum: [
          "PENDING",
          "COMPLETED",
          "FAILED",
        ],

        default: "PENDING",
      },

      riskScore: {
        type: String,

        enum: [
          "LOW",
          "MEDIUM",
          "HIGH",
        ],

        default: "LOW",
      },
    },
    {
      timestamps: true,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

transactionSchema.index({
  senderId: 1,
  createdAt: -1,
});

transactionSchema.index({
  receiverId: 1,
  createdAt: -1,
});

transactionSchema.index({
  status: 1,
  createdAt: -1,
});
transactionSchema.index(
  {
    senderId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);
/* =========================================================
   MODEL
========================================================= */

export const Transaction =
  mongoose.models.Transaction ||
  mongoose.model<ITransaction>(
    "Transaction",
    transactionSchema
  );

export default Transaction;