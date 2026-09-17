import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled"
  | "void";

export type InvoiceMode =
  | "test"
  | "live";

export interface IInvoiceItem {
  itemId: string;

  name: string;

  description?: string;

  quantity: number;

  /*
   * All financial amounts are stored in minor units.
   *
   * BDT 500.00 = 50000
   */
  unitAmountMinor: number;

  lineAmountMinor: number;
}

export interface IInvoiceCustomer {
  userId?:
    mongoose.Types.ObjectId;

  name: string;

  email: string;

  phone?: string;
}

/* =========================================================
   INVOICE DOCUMENT
========================================================= */

export interface IInvoice
  extends Document {
  /*
   * Public invoice identifier.
   *
   * Example:
   * inv_550e8400-e29b-41d4-a716-446655440000
   */
  invoiceId: string;

  /*
   * Merchant-visible invoice number.
   *
   * Example:
   * INV-2026-000001
   */
  invoiceNumber: string;

  merchantId:
    mongoose.Types.ObjectId;

  mode:
    InvoiceMode;

  status:
    InvoiceStatus;

  customer:
    IInvoiceCustomer;

  items:
    IInvoiceItem[];

  currency: string;

  subtotalMinor: number;

  taxMinor: number;

  discountMinor: number;

  totalMinor: number;

  amountPaidMinor: number;

  amountDueMinor: number;

  issueDate: Date;

  dueDate: Date;

  merchantReference?: string;

  title?: string;

  note?: string;

  footer?: string;

  /*
   * Public Payment ID created for invoice checkout.
   */
  paymentId?: string;

  checkoutUrl?: string;

  /*
   * Only the hash is stored.
   * The reusable public token is never stored as plaintext.
   */
  publicTokenHash?: string;

  idempotencyKey: string;

  sentAt?: Date;

  viewedAt?: Date;

  paidAt?: Date;

  overdueAt?: Date;

  cancelledAt?: Date;

  voidedAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   ITEM SCHEMA
========================================================= */

const invoiceItemSchema =
  new Schema<IInvoiceItem>(
    {
      itemId: {
        type: String,
        required: true,
        trim: true,
        immutable: true,
        maxlength: 100,
      },

      name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 200,
      },

      description: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: undefined,
      },

      quantity: {
        type: Number,
        required: true,
        min: 1,
        max: 100000,

        validate: {
          validator: (
            value: number
          ): boolean =>
            Number.isInteger(
              value
            ),

          message:
            "Invoice item quantity must be an integer.",
        },
      },

      unitAmountMinor: {
        type: Number,
        required: true,
        min: 1,

        validate: {
          validator: (
            value: number
          ): boolean =>
            Number.isSafeInteger(
              value
            ),

          message:
            "Invoice item unit amount must be valid minor units.",
        },
      },

      lineAmountMinor: {
        type: Number,
        required: true,
        min: 1,

        validate: {
          validator: (
            value: number
          ): boolean =>
            Number.isSafeInteger(
              value
            ),

          message:
            "Invoice item line amount must be valid minor units.",
        },
      },
    },
    {
      _id: false,
      strict: true,
    }
  );

/* =========================================================
   CUSTOMER SCHEMA
========================================================= */

const invoiceCustomerSchema =
  new Schema<IInvoiceCustomer>(
    {
      userId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        default: undefined,

        index: true,
      },

      name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 150,
      },

      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 254,
      },

      phone: {
        type: String,
        trim: true,
        maxlength: 40,
        default: undefined,
      },
    },
    {
      _id: false,
      strict: true,
    }
  );

/* =========================================================
   INVOICE SCHEMA
========================================================= */

const invoiceSchema =
  new Schema<IInvoice>(
    {
      invoiceId: {
        type: String,
        required: true,
        trim: true,
        immutable: true,
        minlength: 10,
        maxlength: 120,
      },

      invoiceNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 80,
      },

      merchantId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Merchant",

        required: true,

        index: true,
      },

      mode: {
        type: String,

        enum: [
          "test",
          "live",
        ],

        required: true,

        index: true,
      },

      status: {
        type: String,

        enum: [
          "draft",
          "sent",
          "viewed",
          "partially_paid",
          "paid",
          "overdue",
          "cancelled",
          "void",
        ],

        required: true,

        default:
          "draft",

        index: true,
      },

      customer: {
        type:
          invoiceCustomerSchema,

        required: true,
      },

      items: {
        type: [
          invoiceItemSchema,
        ],

        required: true,

        validate: {
          validator: (
            value:
              IInvoiceItem[]
          ): boolean =>
            Array.isArray(
              value
            ) &&
            value.length > 0 &&
            value.length <= 100,

          message:
            "Invoice must contain between 1 and 100 items.",
        },
      },

      currency: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,

        enum: [
          "BDT",
          "USD",
          "EUR",
        ],

        default:
          "BDT",
      },

      subtotalMinor: {
        type: Number,
        required: true,
        min: 1,
      },

      taxMinor: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },

      discountMinor: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },

      totalMinor: {
        type: Number,
        required: true,
        min: 1,
      },

      amountPaidMinor: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },

      amountDueMinor: {
        type: Number,
        required: true,
        min: 0,
      },

      issueDate: {
        type: Date,
        required: true,
        default: Date.now,
      },

      dueDate: {
        type: Date,
        required: true,
        index: true,
      },

      merchantReference: {
        type: String,
        trim: true,
        maxlength: 150,
        default: undefined,
      },

      title: {
        type: String,
        trim: true,
        maxlength: 200,
        default: undefined,
      },

      note: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: undefined,
      },

      footer: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: undefined,
      },

      paymentId: {
        type: String,
        trim: true,
        maxlength: 120,
        default: undefined,
        index: true,
      },

      checkoutUrl: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: undefined,
      },

      publicTokenHash: {
        type: String,
        select: false,
        default: undefined,
      },

      idempotencyKey: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
        select: false,
      },

      sentAt: {
        type: Date,
        default: undefined,
      },

      viewedAt: {
        type: Date,
        default: undefined,
      },

      paidAt: {
        type: Date,
        default: undefined,
      },

      overdueAt: {
        type: Date,
        default: undefined,
      },

      cancelledAt: {
        type: Date,
        default: undefined,
      },

      voidedAt: {
        type: Date,
        default: undefined,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: true,
    }
  );

/* =========================================================
   VALIDATION
========================================================= */

invoiceSchema.pre(
  "validate",
  function () {
    if (
      !Number.isSafeInteger(
        this.subtotalMinor
      ) ||
      !Number.isSafeInteger(
        this.taxMinor
      ) ||
      !Number.isSafeInteger(
        this.discountMinor
      ) ||
      !Number.isSafeInteger(
        this.totalMinor
      ) ||
      !Number.isSafeInteger(
        this.amountPaidMinor
      ) ||
      !Number.isSafeInteger(
        this.amountDueMinor
      )
    ) {
      throw new Error(
        "Invoice amounts must be stored as integer minor units."
      );
    }

    const expectedSubtotal =
      this.items.reduce(
        (
          total,
          item
        ) =>
          total +
          item.lineAmountMinor,
        0
      );

    if (
      expectedSubtotal !==
      this.subtotalMinor
    ) {
      throw new Error(
        "Invoice subtotal does not match item totals."
      );
    }

    const expectedTotal =
      this.subtotalMinor +
      this.taxMinor -
      this.discountMinor;

    if (
      expectedTotal !==
      this.totalMinor
    ) {
      throw new Error(
        "Invoice total calculation is invalid."
      );
    }

    if (
      this.discountMinor >
      this.subtotalMinor +
        this.taxMinor
    ) {
      throw new Error(
        "Invoice discount cannot exceed the subtotal and tax."
      );
    }

    const expectedDue =
      this.totalMinor -
      this.amountPaidMinor;

    if (
      expectedDue !==
      this.amountDueMinor ||
      expectedDue < 0
    ) {
      throw new Error(
        "Invoice due amount is invalid."
      );
    }

    if (
      this.dueDate.getTime() <
      this.issueDate.getTime()
    ) {
      throw new Error(
        "Invoice due date cannot be before its issue date."
      );
    }
  }
);

/* =========================================================
   INDEXES
========================================================= */

invoiceSchema.index(
  {
    invoiceId: 1,
  },
  {
    unique: true,
    name:
      "unique_invoice_id",
  }
);

invoiceSchema.index(
  {
    merchantId: 1,
    mode: 1,
    invoiceNumber: 1,
  },
  {
    unique: true,
    name:
      "unique_merchant_invoice_number",
  }
);

invoiceSchema.index(
  {
    merchantId: 1,
    mode: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    name:
      "unique_invoice_idempotency",
  }
);

invoiceSchema.index(
  {
    merchantId: 1,
    status: 1,
    dueDate: 1,
    createdAt: -1,
  },
  {
    name:
      "merchant_invoice_status_due_date",
  }
);

invoiceSchema.index(
  {
    "customer.email": 1,
    createdAt: -1,
  },
  {
    name:
      "invoice_customer_email",
  }
);

invoiceSchema.index(
  {
    "customer.userId": 1,
    createdAt: -1,
  },
  {
    sparse: true,
    name:
      "invoice_customer_user",
  }
);

/* =========================================================
   MODEL
========================================================= */

const InvoiceModel:
  Model<IInvoice> =
  (
    mongoose.models
      .Invoice as
      Model<IInvoice>
  ) ||
  mongoose.model<IInvoice>(
    "Invoice",
    invoiceSchema
  );

export const Invoice =
  InvoiceModel;

export default InvoiceModel;