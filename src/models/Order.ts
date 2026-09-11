import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

export type OrderStatus =
  | "created"
  | "pending"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "cancelled"
  | "expired"
  | "failed";

export type OrderMode = "test" | "live";

export interface IOrderCustomer {
  name?: string;
  email?: string;
  phone?: string;
  externalCustomerId?: string;
}

export interface IOrderItem {
  name: string;
  sku?: string;
  quantity: number;
  unitAmount: mongoose.Types.Decimal128;
  totalAmount: mongoose.Types.Decimal128;
}

export interface IOrder extends Document {
  orderId: string;
  merchantId: mongoose.Types.ObjectId;
  mode: OrderMode;
  status: OrderStatus;
  amount: mongoose.Types.Decimal128;
  currency: string;
  merchantReference?: string;
  description?: string;
  customer?: IOrderCustomer;
  items: IOrderItem[];
  metadata: Map<string, string>;
  returnUrl?: string;
  cancelUrl?: string;
  checkoutUrl: string;
  idempotencyKey: string;
  paidAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const orderCustomerSchema = new Schema<IOrderCustomer>(
  {
    name: { type: String, trim: true, maxlength: 150, default: undefined },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: undefined },
    phone: { type: String, trim: true, maxlength: 40, default: undefined },
    externalCustomerId: { type: String, trim: true, maxlength: 150, default: undefined },
  },
  { _id: false, strict: true }
);

const orderItemSchema = new Schema<IOrderItem>(
  {
    name: { type: String, required: true, trim: true, maxlength: 180 },
    sku: { type: String, trim: true, maxlength: 100, default: undefined },
    quantity: { type: Number, required: true, min: 1, max: 10_000 },
    unitAmount: { type: Schema.Types.Decimal128, required: true },
    totalAmount: { type: Schema.Types.Decimal128, required: true },
  },
  { _id: false, strict: true }
);

const orderSchema = new Schema<IOrder>(
  {
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
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
      immutable: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ["test", "live"],
      required: true,
      immutable: true,
      index: true,
    },
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
    amount: { type: Schema.Types.Decimal128, required: true },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
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
    customer: { type: orderCustomerSchema, default: undefined },
    items: { type: [orderItemSchema], default: [] },
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
    returnUrl: { type: String, trim: true, maxlength: 1000, default: undefined },
    cancelUrl: { type: String, trim: true, maxlength: 1000, default: undefined },
    checkoutUrl: { type: String, required: true, trim: true, maxlength: 2000 },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      select: false,
    },
    paidAt: { type: Date, default: undefined },
    cancelledAt: { type: Date, default: undefined },
    expiredAt: { type: Date, default: undefined },
    expiresAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

orderSchema.index(
  { merchantId: 1, mode: 1, idempotencyKey: 1 },
  { unique: true, name: "unique_order_idempotency_key" }
);
orderSchema.index(
  { merchantId: 1, status: 1, createdAt: -1 },
  { name: "order_merchant_status_created_at" }
);
orderSchema.index(
  { merchantId: 1, mode: 1, createdAt: -1 },
  { name: "order_merchant_mode_created_at" }
);
orderSchema.index(
  { merchantId: 1, merchantReference: 1 },
  { sparse: true, name: "order_merchant_reference" }
);

const OrderModel: Model<IOrder> =
  (mongoose.models.Order as Model<IOrder>) ||
  mongoose.model<IOrder>("Order", orderSchema);

export const Order = OrderModel;
export default OrderModel;
