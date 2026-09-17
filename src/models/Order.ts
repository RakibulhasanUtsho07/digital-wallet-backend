import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   ORDER TYPES
========================================================= */

export type OrderStatus =
  | "created"
  | "pending"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "cancelled"
  | "expired"
  | "failed";

export type OrderMode =
  | "test"
  | "live";

/* =========================================================
   CUSTOMER
========================================================= */

export interface IOrderCustomer {
  name?: string;
  email?: string;
  phone?: string;
  externalCustomerId?: string;
}

/* =========================================================
   ORDER ITEM
========================================================= */

export interface IOrderItem {
  name: string;
  sku?: string;
  quantity: number;
  unitAmount:
    mongoose.Types.Decimal128;
  totalAmount:
    mongoose.Types.Decimal128;
}

/* =========================================================
   ORDER
========================================================= */

export interface IOrder
  extends Document {
  /*
   * Public Coffer order identifier.
   *
   * Example:
   * ord_test_xxxxx
   * ord_live_xxxxx
   */
  orderId: string;

  /*
   * Merchant who owns the order.
   */
  merchantId:
    mongoose.Types.ObjectId;

  mode: OrderMode;

  status: OrderStatus;

  amount:
    mongoose.Types.Decimal128;

  currency: string;

  /*
   * Merchant's own order/reference ID.
   */
  merchantReference?: string;

  description?: string;

  customer?: IOrderCustomer;

  items: IOrderItem[];

  metadata:
    Map<string, string>;

  returnUrl?: string;

  cancelUrl?: string;

  checkoutUrl: string;

  /*
   * Used to prevent duplicate order creation.
   * This field is never returned by default.
   */
  idempotencyKey: string;

  paidAt?: Date;

  cancelledAt?: Date;

  expiredAt?: Date;

  /*
   * Checkout expiration time.
   *
   * This does not automatically delete the record.
   */
  expiresAt: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   CUSTOMER SCHEMA
========================================================= */

const orderCustomerSchema =
  new Schema<IOrderCustomer>(
    {
      name: {
        type: String,
        trim: true,
        maxlength: 150,
        default: undefined,
      },

      email: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 254,
        default: undefined,
      },

      phone: {
        type: String,
        trim: true,
        maxlength: 40,
        default: undefined,
      },

      externalCustomerId: {
        type: String,
        trim: true,
        maxlength: 150,
        default: undefined,
      },
    },
    {
      _id: false,
      strict: true,
    }
  );

/* =========================================================
   ITEM SCHEMA
========================================================= */

const orderItemSchema =
  new Schema<IOrderItem>(
    {
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 180,
      },

      sku: {
        type: String,
        trim: true,
        maxlength: 100,
        default: undefined,
      },

      quantity: {
        type: Number,
        required: true,
        min: 1,
        max: 10_000,
      },

      unitAmount: {
        type:
          Schema.Types.Decimal128,
        required: true,
      },

      totalAmount: {
        type:
          Schema.Types.Decimal128,
        required: true,
      },
    },
    {
      _id: false,
      strict: true,
    }
  );

/* =========================================================
   ORDER SCHEMA
========================================================= */

const orderSchema =
  new Schema<IOrder>(
    {
      /* ===================================================
         PUBLIC ORDER ID
      =================================================== */

      orderId: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        trim: true,
        minlength: 12,
        maxlength: 120,
        index: true,
      },

      /* ===================================================
         MERCHANT
      =================================================== */

      merchantId: {
        type:
          Schema.Types.ObjectId,
        ref: "Merchant",
        required: true,
        immutable: true,
        index: true,
      },

      /* ===================================================
         ENVIRONMENT
      =================================================== */

      mode: {
        type: String,

        enum: [
          "test",
          "live",
        ],

        required: true,
        immutable: true,
        index: true,
      },

      /* ===================================================
         STATUS
      =================================================== */

      status: {
        type: String,

        enum: [
          "created",
          "pending",
          "paid",
          "partially_refunded",
          "refunded",
          "cancelled",
          "expired",
          "failed",
        ],

        required: true,
        default: "created",
        index: true,
      },

      /* ===================================================
         AMOUNT
      =================================================== */

      amount: {
        type:
          Schema.Types.Decimal128,
        required: true,
      },

      currency: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
      },

      /* ===================================================
         MERCHANT INFORMATION
      =================================================== */

      merchantReference: {
        type: String,
        trim: true,
        maxlength: 150,
        default: undefined,
      },

      description: {
        type: String,
        trim: true,
        maxlength: 500,
        default: undefined,
      },

      /* ===================================================
         CUSTOMER
      =================================================== */

      customer: {
        type:
          orderCustomerSchema,
        default: undefined,
      },

      /* ===================================================
         ITEMS
      =================================================== */

      items: {
        type: [
          orderItemSchema,
        ],

        default: [],

        validate: {
          validator: (
            value: IOrderItem[]
          ): boolean => {
            return (
              Array.isArray(value) &&
              value.length <= 100
            );
          },

          message:
            "An order can contain at most 100 items.",
        },
      },

      /* ===================================================
         METADATA
      =================================================== */

      metadata: {
        type: Map,
        of: String,
        default: {},
      },

      /* ===================================================
         REDIRECT URLS
      =================================================== */

      returnUrl: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: undefined,
      },

      cancelUrl: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: undefined,
      },

      /* ===================================================
         CHECKOUT URL
      =================================================== */

      checkoutUrl: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000,
      },

      /* ===================================================
         IDEMPOTENCY
      =================================================== */

      idempotencyKey: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
        select: false,
      },

      /* ===================================================
         LIFECYCLE TIMESTAMPS
      =================================================== */

      paidAt: {
        type: Date,
        default: undefined,
      },

      cancelledAt: {
        type: Date,
        default: undefined,
      },

      expiredAt: {
        type: Date,
        default: undefined,
      },

      expiresAt: {
        type: Date,
        required: true,
        index: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: true,

      toJSON: {
        virtuals: true,
      },

      toObject: {
        virtuals: true,
      },
    }
  );

/* =========================================================
   INDEXES
========================================================= */

/*
 * Prevent duplicate orders for the same merchant,
 * API environment and idempotency key.
 */
orderSchema.index(
  {
    merchantId: 1,
    mode: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    name:
      "unique_order_idempotency_key",
  }
);

/*
 * Merchant dashboard status filtering.
 */
orderSchema.index(
  {
    merchantId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name:
      "order_merchant_status_created_at",
  }
);

/*
 * Test/live order filtering.
 */
orderSchema.index(
  {
    merchantId: 1,
    mode: 1,
    createdAt: -1,
  },
  {
    name:
      "order_merchant_mode_created_at",
  }
);

/*
 * Merchant reference lookup.
 */
orderSchema.index(
  {
    merchantId: 1,
    merchantReference: 1,
  },
  {
    sparse: true,
    name:
      "order_merchant_reference",
  }
);

/*
 * Expired order processing.
 *
 * This is a normal index, not a TTL index.
 * Financial records must not be deleted automatically.
 */
orderSchema.index(
  {
    status: 1,
    expiresAt: 1,
  },
  {
    name:
      "order_status_expiry",
  }
);

/* =========================================================
   MODEL
========================================================= */

const OrderModel:
  Model<IOrder> =
  (
    mongoose.models
      .Order as Model<IOrder>
  ) ||
  mongoose.model<IOrder>(
    "Order",
    orderSchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const Order =
  OrderModel;

export default OrderModel;