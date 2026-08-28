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

export interface ITransaction
  extends Document {
  senderId: mongoose.Types.ObjectId;

  receiverId: mongoose.Types.ObjectId;

  /*
   * LEGACY PLAINTEXT AMOUNT
   *
   * Migration complete না হওয়া পর্যন্ত থাকবে।
   * পরে remove করা হবে।
   */
  amount: number;

  /*
   * NEW ENCRYPTED AMOUNT
   */
  amountEncrypted?: IEncryptedTransactionData;

  currency: string;

  type:
    | "TRANSFER"
    | "DEPOSIT"
    | "WITHDRAW";

  status:
    | "PENDING"
    | "COMPLETED"
    | "FAILED";

  reference?: string;

  riskScore:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  createdAt?: Date;

  updatedAt?: Date;
}

/* =========================================================
   ENCRYPTED DATA SCHEMA
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
        type:
          Schema.Types.ObjectId,

        ref: "User",

        required: true,
      },

      receiverId: {
        type:
          Schema.Types.ObjectId,

        ref: "User",

        required: true,
      },

      /* =====================================================
         LEGACY PLAINTEXT AMOUNT

         এখন required থাকবে যাতে existing
         application break না করে।
      ====================================================== */

      amount: {
        type: Number,

        required: true,

        min: 1,
      },

      /* =====================================================
         NEW ENCRYPTED AMOUNT

         Migration-এর সময় populate করা হবে।
      ====================================================== */

      amountEncrypted: {
        type:
          encryptedDataSchema,

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

        default:
          "PENDING",
      },

      reference: {
        type: String,

        trim: true,
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