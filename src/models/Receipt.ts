import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export interface IEncryptedReceiptValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

export type ReceiptStatus =
  | "normal"
  | "warranty_active"
  | "warranty_expiring"
  | "return_open";

export interface IReceiptLineItem {
  _id?: mongoose.Types.ObjectId;
  nameEncrypted:
    IEncryptedReceiptValue;
  quantity: number;
  unitPriceEncrypted:
    IEncryptedReceiptValue;
  totalEncrypted:
    IEncryptedReceiptValue;
  categoryEncrypted:
    IEncryptedReceiptValue;
}

export interface IReceipt
  extends Document {
  userId:
    mongoose.Types.ObjectId;

  merchantEncrypted?:
    IEncryptedReceiptValue;

  amountEncrypted?:
    IEncryptedReceiptValue;

  taxEncrypted?:
    IEncryptedReceiptValue;

  categoryEncrypted?:
    IEncryptedReceiptValue;

  paymentMethodEncrypted?:
    IEncryptedReceiptValue;

  receiptNumberEncrypted?:
    IEncryptedReceiptValue;

  tagsEncrypted:
    IEncryptedReceiptValue[];

  lineItems:
    IReceiptLineItem[];

  currency:
    string;

  receiptDate:
    Date;

  status:
    ReceiptStatus;

  warrantyExpiry?:
    Date;

  returnDeadline?:
    Date;

  isFavorite:
    boolean;

  imageUrl?:
    string;

  imagePublicId?:
    string;

  isAiParsed:
    boolean;

  /*
   * Legacy fields are kept optional so old receipt records
   * remain readable while all new writes use encryption.
   */
  merchantName?:
    string;

  amount?:
    number;

  tax?:
    number;

  category?:
    string;

  paymentMethod?:
    string;

  receiptNumber?:
    string;

  tags?:
    string[];

  createdAt?: Date;
  updatedAt?: Date;
}

/* =========================================================
   SUB-SCHEMAS
========================================================= */

const encryptedValueSchema =
  new Schema<IEncryptedReceiptValue>(
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

const lineItemSchema =
  new Schema<IReceiptLineItem>(
    {
      nameEncrypted: {
        type:
          encryptedValueSchema,
        required: true,
      },

      quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1,
      },

      unitPriceEncrypted: {
        type:
          encryptedValueSchema,
        required: true,
      },

      totalEncrypted: {
        type:
          encryptedValueSchema,
        required: true,
      },

      categoryEncrypted: {
        type:
          encryptedValueSchema,
        required: true,
      },
    },
    {
      _id: true,
    }
  );

/* =========================================================
   RECEIPT SCHEMA
========================================================= */

const receiptSchema =
  new Schema<IReceipt>(
    {
      userId: {
        type:
          Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      merchantEncrypted: {
        type:
          encryptedValueSchema,
      },

      amountEncrypted: {
        type:
          encryptedValueSchema,
      },

      taxEncrypted: {
        type:
          encryptedValueSchema,
      },

      categoryEncrypted: {
        type:
          encryptedValueSchema,
      },

      paymentMethodEncrypted: {
        type:
          encryptedValueSchema,
      },

      receiptNumberEncrypted: {
        type:
          encryptedValueSchema,
      },

      tagsEncrypted: {
        type: [
          encryptedValueSchema,
        ],
        default: [],
      },

      lineItems: {
        type: [
          lineItemSchema,
        ],
        default: [],
      },

      currency: {
        type: String,
        default: "BDT",
        trim: true,
        maxlength: 8,
      },

      receiptDate: {
        type: Date,
        default: Date.now,
        index: true,
      },

      status: {
        type: String,
        enum: [
          "normal",
          "warranty_active",
          "warranty_expiring",
          "return_open",
        ],
        default:
          "normal",
      },

      warrantyExpiry: {
        type: Date,
      },

      returnDeadline: {
        type: Date,
      },

      isFavorite: {
        type: Boolean,
        default: false,
      },

      imageUrl: {
        type: String,
        trim: true,
        maxlength: 1000,
      },

      imagePublicId: {
        type: String,
        trim: true,
        maxlength: 300,
      },

      isAiParsed: {
        type: Boolean,
        default: false,
      },

      /* =========================
         LEGACY OPTIONAL FIELDS
      ========================== */

      merchantName: {
        type: String,
        trim: true,
      },

      amount: {
        type: Number,
        min: 0,
      },

      tax: {
        type: Number,
        min: 0,
      },

      category: {
        type: String,
        trim: true,
      },

      paymentMethod: {
        type: String,
        trim: true,
      },

      receiptNumber: {
        type: String,
        trim: true,
      },

      tags: {
        type: [String],
        default: undefined,
      },
    },
    {
      timestamps: true,
    }
  );

receiptSchema.index(
  {
    userId: 1,
    receiptDate: -1,
  }
);

export const Receipt =
  mongoose.models.Receipt ||
  mongoose.model<IReceipt>(
    "Receipt",
    receiptSchema
  );

export default Receipt;
