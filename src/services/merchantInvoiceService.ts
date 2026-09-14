import crypto from "node:crypto";

import mongoose from "mongoose";

import {
  Invoice,
  type IInvoice,
  type InvoiceMode,
  type InvoiceStatus,
} from "../models/Invoice.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  User,
} from "../models/User.js";

import {
  sendMerchantInvoiceEmail,
} from "../utils/email.js";

/* =========================================================
   ERRORS
========================================================= */

export type MerchantInvoiceErrorCode =
  | "INVALID_REQUEST"
  | "MERCHANT_NOT_FOUND"
  | "INVOICE_NOT_FOUND"
  | "INVOICE_NOT_EDITABLE"
  | "INVOICE_NOT_SENDABLE"
  | "INVOICE_NOT_CANCELLABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "EMAIL_DELIVERY_FAILED"
  | "PUBLIC_ACCESS_DENIED";

export class MerchantInvoiceError
  extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code:
      MerchantInvoiceErrorCode
  ) {
    super(message);

    this.name =
      "MerchantInvoiceError";
  }
}

/* =========================================================
   INPUT TYPES
========================================================= */

export interface CreateInvoiceItemInput {
  name: unknown;
  description?: unknown;
  quantity: unknown;
  unitAmount: unknown;
}

export interface CreateInvoiceCustomerInput {
  userId?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
}

export interface CreateMerchantInvoiceInput {
  merchantId: string;

  mode:
    InvoiceMode;

  customer:
    CreateInvoiceCustomerInput;

  items:
    CreateInvoiceItemInput[];

  currency?: unknown;

  taxAmount?: unknown;

  discountAmount?: unknown;

  dueDate: unknown;

  title?: unknown;

  note?: unknown;

  footer?: unknown;

  merchantReference?: unknown;

  idempotencyKey:
    string;
}

/* =========================================================
   OUTPUT TYPES
========================================================= */

export interface MerchantInvoiceItemView {
  itemId: string;
  name: string;
  description?: string;
  quantity: number;
  unitAmount: string;
  lineAmount: string;
}

export interface MerchantInvoiceView {
  _id: string;

  invoiceId: string;
  invoiceNumber: string;

  merchantId: string;

  mode:
    InvoiceMode;

  status:
    InvoiceStatus;

  customer: {
    userId?: string;
    name: string;
    email: string;
    phone?: string;
  };

  items:
    MerchantInvoiceItemView[];

  currency: string;

  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  total: string;
  amountPaid: string;
  amountDue: string;

  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;

  issueDate: Date;
  dueDate: Date;

  title?: string;
  note?: string;
  footer?: string;

  merchantReference?: string;

  paymentId?: string;
  checkoutUrl?: string;

  sentAt?: Date;
  viewedAt?: Date;
  paidAt?: Date;
  overdueAt?: Date;
  cancelledAt?: Date;
  voidedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMerchantInvoiceResult {
  duplicate: boolean;
  invoice:
    MerchantInvoiceView;
}

export interface MerchantInvoiceListResult {
  invoices:
    MerchantInvoiceView[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
interface InvoiceCustomerUserRecord {
  _id:
    mongoose.Types.ObjectId;

  name?: string;

  email?: string;

  phone?: string;
}
/* =========================================================
   HELPERS
========================================================= */

function normalizeText(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function optionalText(
  value: unknown,
  fieldName: string,
  maxLength: number
): string | undefined {
  const normalized =
    normalizeText(value);

  if (!normalized) {
    return undefined;
  }

  if (
    normalized.length >
    maxLength
  ) {
    throw new MerchantInvoiceError(
      `${fieldName} is too long.`,
      400,
      "INVALID_REQUEST"
    );
  }

  return normalized;
}

function normalizeEmail(
  value: unknown
): string {
  const email =
    normalizeText(value)
      .toLowerCase();

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    throw new MerchantInvoiceError(
      "A valid customer email is required.",
      400,
      "INVALID_REQUEST"
    );
  }

  return email;
}

function majorToMinor(
  value: unknown,
  fieldName: string,
  allowZero = false
): number {
  let raw: string;

  if (
    typeof value === "number"
  ) {
    if (!Number.isFinite(value)) {
      throw new MerchantInvoiceError(
        `${fieldName} is invalid.`,
        400,
        "INVALID_REQUEST"
      );
    }

    raw =
      String(value);
  } else {
    raw =
      normalizeText(value);
  }

  if (
    !/^\d+(?:\.\d{1,2})?$/.test(
      raw
    )
  ) {
    throw new MerchantInvoiceError(
      `${fieldName} can contain maximum 2 decimal places.`,
      400,
      "INVALID_REQUEST"
    );
  }

  const [
    whole,
    fraction = "",
  ] = raw.split(".");

  const minor =
    Number(whole) *
      100 +
    Number(
      fraction
        .padEnd(2, "0")
        .slice(0, 2)
    );

  if (
    !Number.isSafeInteger(minor) ||
    minor < 0 ||
    (!allowZero && minor === 0)
  ) {
    throw new MerchantInvoiceError(
      allowZero
        ? `${fieldName} cannot be negative.`
        : `${fieldName} must be greater than zero.`,
      400,
      "INVALID_REQUEST"
    );
  }

  return minor;
}

function minorToMajor(
  value: number
): string {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new MerchantInvoiceError(
      "Invalid invoice amount.",
      500,
      "INVALID_REQUEST"
    );
  }

  return (
    value / 100
  ).toFixed(2);
}

function parseQuantity(
  value: unknown
): number {
  const quantity =
    Number(value);

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 100000
  ) {
    throw new MerchantInvoiceError(
      "Invoice item quantity must be an integer between 1 and 100000.",
      400,
      "INVALID_REQUEST"
    );
  }

  return quantity;
}

function parseDueDate(
  value: unknown
): Date {
  const raw =
    normalizeText(value);

  if (!raw) {
    throw new MerchantInvoiceError(
      "Invoice due date is required.",
      400,
      "INVALID_REQUEST"
    );
  }

  /*
   * HTML date inputs return YYYY-MM-DD.
   * Use the end of that UTC day.
   */
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(
      raw
    )
      ? new Date(
          `${raw}T23:59:59.999Z`
        )
      : new Date(raw);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new MerchantInvoiceError(
      "Invoice due date is invalid.",
      400,
      "INVALID_REQUEST"
    );
  }

  if (
    date.getTime() <
    Date.now() -
      60_000
  ) {
    throw new MerchantInvoiceError(
      "Invoice due date cannot be in the past.",
      400,
      "INVALID_REQUEST"
    );
  }

  const maximumDueDate =
    Date.now() +
    2 *
      365 *
      24 *
      60 *
      60 *
      1000;

  if (
    date.getTime() >
    maximumDueDate
  ) {
    throw new MerchantInvoiceError(
      "Invoice due date cannot be more than two years in the future.",
      400,
      "INVALID_REQUEST"
    );
  }

  return date;
}

function generateInvoiceId(): string {
  return `inv_${crypto.randomUUID()}`;
}

function generateInvoiceNumber(): string {
  const date =
    new Date();

  const datePart = [
    date.getUTCFullYear(),
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0"),
    String(
      date.getUTCDate()
    ).padStart(2, "0"),
  ].join("");

  const randomPart =
    crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase();

  return `INV-${datePart}-${randomPart}`;
}

function createPublicToken(): {
  token: string;
  hash: string;
} {
  const token =
    crypto
      .randomBytes(32)
      .toString("base64url");

  const hash =
    crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

  return {
    token,
    hash,
  };
}

function hashPublicToken(
  token: string
): string {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function tokensMatch(
  leftHash: string,
  rightHash: string
): boolean {
  const left =
    Buffer.from(
      leftHash,
      "hex"
    );

  const right =
    Buffer.from(
      rightHash,
      "hex"
    );

  return (
    left.length ===
      right.length &&
    crypto.timingSafeEqual(
      left,
      right
    )
  );
}

function escapeRegExp(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

/* =========================================================
   VIEW MAPPER
========================================================= */

function toInvoiceView(
  invoice: IInvoice
): MerchantInvoiceView {
  return {
    _id:
      String(invoice._id),

    invoiceId:
      invoice.invoiceId,

    invoiceNumber:
      invoice.invoiceNumber,

    merchantId:
      invoice.merchantId
        .toString(),

    mode:
      invoice.mode,

    status:
      invoice.status,

    customer: {
      userId:
        invoice.customer.userId
          ?.toString(),

      name:
        invoice.customer.name,

      email:
        invoice.customer.email,

      phone:
        invoice.customer.phone,
    },

    items:
      invoice.items.map(
        (item) => ({
          itemId:
            item.itemId,

          name:
            item.name,

          description:
            item.description,

          quantity:
            item.quantity,

          unitAmount:
            minorToMajor(
              item.unitAmountMinor
            ),

          lineAmount:
            minorToMajor(
              item.lineAmountMinor
            ),
        })
      ),

    currency:
      invoice.currency,

    subtotal:
      minorToMajor(
        invoice.subtotalMinor
      ),

    taxAmount:
      minorToMajor(
        invoice.taxMinor
      ),

    discountAmount:
      minorToMajor(
        invoice.discountMinor
      ),

    total:
      minorToMajor(
        invoice.totalMinor
      ),

    amountPaid:
      minorToMajor(
        invoice.amountPaidMinor
      ),

    amountDue:
      minorToMajor(
        invoice.amountDueMinor
      ),

    subtotalMinor:
      invoice.subtotalMinor,

    taxMinor:
      invoice.taxMinor,

    discountMinor:
      invoice.discountMinor,

    totalMinor:
      invoice.totalMinor,

    amountPaidMinor:
      invoice.amountPaidMinor,

    amountDueMinor:
      invoice.amountDueMinor,

    issueDate:
      invoice.issueDate,

    dueDate:
      invoice.dueDate,

    title:
      invoice.title,

    note:
      invoice.note,

    footer:
      invoice.footer,

    merchantReference:
      invoice.merchantReference,

    paymentId:
      invoice.paymentId,

    checkoutUrl:
      invoice.checkoutUrl,

    sentAt:
      invoice.sentAt,

    viewedAt:
      invoice.viewedAt,

    paidAt:
      invoice.paidAt,

    overdueAt:
      invoice.overdueAt,

    cancelledAt:
      invoice.cancelledAt,

    voidedAt:
      invoice.voidedAt,

    createdAt:
      invoice.createdAt,

    updatedAt:
      invoice.updatedAt,
  };
}

/* =========================================================
   MERCHANT VALIDATION
========================================================= */

async function requireMerchant(
  merchantId: string,
  mode:
    InvoiceMode
) {
  if (
    !mongoose.isValidObjectId(
      merchantId
    )
  ) {
    throw new MerchantInvoiceError(
      "Invalid merchant ID.",
      400,
      "INVALID_REQUEST"
    );
  }

  const merchant =
    await Merchant.findById(
      merchantId
    )
      .select(
        "businessName status verificationStatus defaultCurrency testEnabled liveEnabled"
      )
      .lean();

  if (!merchant) {
    throw new MerchantInvoiceError(
      "Merchant account not found.",
      404,
      "MERCHANT_NOT_FOUND"
    );
  }

  if (
    merchant.status !==
    "active"
  ) {
    throw new MerchantInvoiceError(
      "Merchant account is not active.",
      403,
      "MERCHANT_NOT_FOUND"
    );
  }

  if (
    mode === "test" &&
    merchant.testEnabled !==
      true
  ) {
    throw new MerchantInvoiceError(
      "Test mode is disabled for this merchant.",
      403,
      "MERCHANT_NOT_FOUND"
    );
  }

  if (
    mode === "live" &&
    (
      merchant.liveEnabled !==
        true ||
      merchant.verificationStatus !==
        "verified"
    )
  ) {
    throw new MerchantInvoiceError(
      "Verified live access is required.",
      403,
      "MERCHANT_NOT_FOUND"
    );
  }

  return merchant;
}

async function getMerchantByOwner(
  ownerId: string
) {
  if (
    !mongoose.isValidObjectId(
      ownerId
    )
  ) {
    throw new MerchantInvoiceError(
      "Invalid merchant owner ID.",
      400,
      "INVALID_REQUEST"
    );
  }

  const merchant =
    await Merchant.findOne({
      ownerId:
        new mongoose.Types.ObjectId(
          ownerId
        ),
    })
      .select(
        "_id businessName status verificationStatus defaultCurrency testEnabled liveEnabled"
      )
      .lean();

  if (!merchant) {
    throw new MerchantInvoiceError(
      "Merchant account not found.",
      404,
      "MERCHANT_NOT_FOUND"
    );
  }

  return merchant;
}

/* =========================================================
   CUSTOMER
========================================================= */
async function resolveCustomer(
  input:
    CreateInvoiceCustomerInput
): Promise<{
  userId?:
    mongoose.Types.ObjectId;

  name: string;

  email: string;

  phone?: string;
}> {
  const userId =
    normalizeText(
      input.userId
    );

  /* =======================================================
     EXISTING COFFER USER
  ======================================================= */

  if (userId) {
    if (
      !mongoose.isValidObjectId(
        userId
      )
    ) {
      throw new MerchantInvoiceError(
        "Invalid customer user ID.",
        400,
        "INVALID_REQUEST"
      );
    }

    /*
     * Explicit lean result type is required because
     * User model's current TypeScript interface does not
     * expose every selected field.
     */
    const user =
      await User.findById(
        userId
      )
        .select(
          "_id name email phone"
        )
        .lean<InvoiceCustomerUserRecord>();

    if (!user) {
      throw new MerchantInvoiceError(
        "Customer account not found.",
        404,
        "INVALID_REQUEST"
      );
    }

    const databaseName =
      normalizeText(
        user.name
      );

    const suppliedName =
      normalizeText(
        input.name
      );

    const customerName =
      databaseName ||
      suppliedName ||
      "Coffer Customer";

    const databaseEmail =
      normalizeText(
        user.email
      );

    const suppliedEmail =
      normalizeText(
        input.email
      );

    const customerEmail =
      normalizeEmail(
        databaseEmail ||
        suppliedEmail
      );

    const databasePhone =
      normalizeText(
        user.phone
      );

    const suppliedPhone =
      optionalText(
        input.phone,
        "Customer phone",
        40
      );

    return {
      userId:
        new mongoose.Types.ObjectId(
          userId
        ),

      name:
        customerName,

      email:
        customerEmail,

      phone:
        databasePhone ||
        suppliedPhone,
    };
  }

  /* =======================================================
     GUEST CUSTOMER
  ======================================================= */

  const name =
    normalizeText(
      input.name
    );

  if (
    name.length < 2 ||
    name.length > 150
  ) {
    throw new MerchantInvoiceError(
      "Customer name must contain between 2 and 150 characters.",
      400,
      "INVALID_REQUEST"
    );
  }

  return {
    name,

    email:
      normalizeEmail(
        input.email
      ),

    phone:
      optionalText(
        input.phone,
        "Customer phone",
        40
      ),
  };
}

/* =========================================================
   CREATE INVOICE
========================================================= */

export async function createMerchantInvoice(
  input:
    CreateMerchantInvoiceInput
): Promise<CreateMerchantInvoiceResult> {
  const merchantId =
    normalizeText(
      input.merchantId
    );

  const idempotencyKey =
    normalizeText(
      input.idempotencyKey
    );

  if (
    !idempotencyKey ||
    idempotencyKey.length >
      200
  ) {
    throw new MerchantInvoiceError(
      "A valid idempotency key is required.",
      400,
      "INVALID_REQUEST"
    );
  }

  const merchant =
    await requireMerchant(
      merchantId,
      input.mode
    );

  const currency =
    (
      normalizeText(
        input.currency
      ) ||
      merchant.defaultCurrency
    ).toUpperCase();

  if (
    ![
      "BDT",
      "USD",
      "EUR",
    ].includes(currency)
  ) {
    throw new MerchantInvoiceError(
      "Unsupported invoice currency.",
      400,
      "INVALID_REQUEST"
    );
  }

  if (
    currency !==
    merchant.defaultCurrency
      .toUpperCase()
  ) {
    throw new MerchantInvoiceError(
      `Merchant currency is ${merchant.defaultCurrency}.`,
      400,
      "INVALID_REQUEST"
    );
  }

  if (
    !Array.isArray(
      input.items
    ) ||
    input.items.length < 1 ||
    input.items.length > 100
  ) {
    throw new MerchantInvoiceError(
      "Invoice must contain between 1 and 100 items.",
      400,
      "INVALID_REQUEST"
    );
  }

  const customer =
    await resolveCustomer(
      input.customer
    );

  const items =
    input.items.map(
      (
        inputItem,
        index
      ) => {
        const name =
          normalizeText(
            inputItem.name
          );

        if (
          !name ||
          name.length > 200
        ) {
          throw new MerchantInvoiceError(
            `Invoice item ${index + 1} requires a valid name.`,
            400,
            "INVALID_REQUEST"
          );
        }

        const quantity =
          parseQuantity(
            inputItem.quantity
          );

        const unitAmountMinor =
          majorToMinor(
            inputItem.unitAmount,
            `Invoice item ${index + 1} amount`
          );

        const lineAmountMinor =
          quantity *
          unitAmountMinor;

        if (
          !Number.isSafeInteger(
            lineAmountMinor
          )
        ) {
          throw new MerchantInvoiceError(
            `Invoice item ${index + 1} amount is too large.`,
            400,
            "INVALID_REQUEST"
          );
        }

        return {
          itemId:
            `item_${crypto.randomUUID()}`,

          name,

          description:
            optionalText(
              inputItem.description,
              `Invoice item ${index + 1} description`,
              1000
            ),

          quantity,

          unitAmountMinor,

          lineAmountMinor,
        };
      }
    );

  const subtotalMinor =
    items.reduce(
      (
        total,
        item
      ) =>
        total +
        item.lineAmountMinor,
      0
    );

  const taxMinor =
    input.taxAmount ===
      undefined
      ? 0
      : majorToMinor(
          input.taxAmount,
          "Tax amount",
          true
        );

  const discountMinor =
    input.discountAmount ===
      undefined
      ? 0
      : majorToMinor(
          input.discountAmount,
          "Discount amount",
          true
        );

  if (
    discountMinor >
    subtotalMinor +
      taxMinor
  ) {
    throw new MerchantInvoiceError(
      "Discount cannot exceed invoice subtotal and tax.",
      400,
      "INVALID_REQUEST"
    );
  }

  const totalMinor =
    subtotalMinor +
    taxMinor -
    discountMinor;

  if (
    totalMinor <= 0 ||
    !Number.isSafeInteger(
      totalMinor
    )
  ) {
    throw new MerchantInvoiceError(
      "Invoice total must be greater than zero.",
      400,
      "INVALID_REQUEST"
    );
  }

  const dueDate =
    parseDueDate(
      input.dueDate
    );

  const merchantObjectId =
    new mongoose.Types.ObjectId(
      merchantId
    );

  const existing =
    await Invoice.findOne({
      merchantId:
        merchantObjectId,

      mode:
        input.mode,

      idempotencyKey,
    }).select(
      "+idempotencyKey"
    );

  if (existing) {
    if (
      existing.customer.email !==
        customer.email ||
      existing.totalMinor !==
        totalMinor
    ) {
      throw new MerchantInvoiceError(
        "This idempotency key has already been used for another invoice.",
        409,
        "IDEMPOTENCY_CONFLICT"
      );
    }

    return {
      duplicate: true,
      invoice:
        toInvoiceView(
          existing
        ),
    };
  }

  try {
    const invoice =
      await Invoice.create({
        invoiceId:
          generateInvoiceId(),

        invoiceNumber:
          generateInvoiceNumber(),

        merchantId:
          merchantObjectId,

        mode:
          input.mode,

        status:
          "draft",

        customer,

        items,

        currency,

        subtotalMinor,

        taxMinor,

        discountMinor,

        totalMinor,

        amountPaidMinor: 0,

        amountDueMinor:
          totalMinor,

        issueDate:
          new Date(),

        dueDate,

        merchantReference:
          optionalText(
            input.merchantReference,
            "Merchant reference",
            150
          ),

        title:
          optionalText(
            input.title,
            "Invoice title",
            200
          ),

        note:
          optionalText(
            input.note,
            "Invoice note",
            2000
          ),

        footer:
          optionalText(
            input.footer,
            "Invoice footer",
            1000
          ),

        idempotencyKey,
      });

    return {
      duplicate: false,
      invoice:
        toInvoiceView(
          invoice
        ),
    };
  } catch (error: unknown) {
    if (
      typeof error ===
        "object" &&
      error !== null &&
      "code" in error &&
      (
        error as {
          code?: unknown;
        }
      ).code === 11000
    ) {
      const duplicate =
        await Invoice.findOne({
          merchantId:
            merchantObjectId,

          mode:
            input.mode,

          idempotencyKey,
        }).select(
          "+idempotencyKey"
        );

      if (duplicate) {
        return {
          duplicate: true,
          invoice:
            toInvoiceView(
              duplicate
            ),
        };
      }
    }

    throw error;
  }
}

/* =========================================================
   DASHBOARD CREATE
========================================================= */

export async function createMerchantDashboardInvoice(
  input:
    Omit<
      CreateMerchantInvoiceInput,
      "merchantId"
    > & {
      ownerId: string;
    }
): Promise<CreateMerchantInvoiceResult> {
  const merchant =
    await getMerchantByOwner(
      input.ownerId
    );

  return createMerchantInvoice({
    ...input,

    merchantId:
      merchant._id.toString(),
  });
}

/* =========================================================
   REFRESH OVERDUE STATUS
========================================================= */

async function refreshOverdueInvoices(
  merchantId:
    mongoose.Types.ObjectId
): Promise<void> {
  const now =
    new Date();

  await Invoice.updateMany(
    {
      merchantId,

      status: {
        $in: [
          "sent",
          "viewed",
        ],
      },

      dueDate: {
        $lt:
          now,
      },

      amountDueMinor: {
        $gt: 0,
      },
    },
    {
      $set: {
        status:
          "overdue",

        overdueAt:
          now,
      },
    }
  );
}

/* =========================================================
   DASHBOARD LIST
========================================================= */

export async function listMerchantDashboardInvoices(
  input: {
    ownerId: string;
    status?: string;
    mode?: string;
    search?: string;
    page?: number;
    limit?: number;
  }
): Promise<MerchantInvoiceListResult> {
  const merchant =
    await getMerchantByOwner(
      input.ownerId
    );

  await refreshOverdueInvoices(
    merchant._id
  );

  const statuses:
    InvoiceStatus[] = [
      "draft",
      "sent",
      "viewed",
      "partially_paid",
      "paid",
      "overdue",
      "cancelled",
      "void",
    ];

  const modes:
    InvoiceMode[] = [
      "test",
      "live",
    ];

  const status =
    normalizeText(
      input.status
    );

  const mode =
    normalizeText(
      input.mode
    );

  if (
    status &&
    !statuses.includes(
      status as
        InvoiceStatus
    )
  ) {
    throw new MerchantInvoiceError(
      "Invalid invoice status filter.",
      400,
      "INVALID_REQUEST"
    );
  }

  if (
    mode &&
    !modes.includes(
      mode as
        InvoiceMode
    )
  ) {
    throw new MerchantInvoiceError(
      "Invalid invoice mode filter.",
      400,
      "INVALID_REQUEST"
    );
  }

  const page =
    Number.isInteger(
      input.page
    ) &&
    Number(input.page) > 0
      ? Number(input.page)
      : 1;

  const limit =
    Number.isInteger(
      input.limit
    )
      ? Math.min(
          Math.max(
            Number(input.limit),
            1
          ),
          100
        )
      : 20;

  const filter:
    Record<string, unknown> = {
      merchantId:
        merchant._id,
    };

  if (status) {
    filter.status =
      status;
  }

  if (mode) {
    filter.mode =
      mode;
  }

  const search =
    normalizeText(
      input.search
    ).slice(0, 100);

  if (search) {
    const expression =
      new RegExp(
        escapeRegExp(
          search
        ),
        "i"
      );

    filter.$or = [
      {
        invoiceId:
          expression,
      },
      {
        invoiceNumber:
          expression,
      },
      {
        merchantReference:
          expression,
      },
      {
        "customer.name":
          expression,
      },
      {
        "customer.email":
          expression,
      },
    ];
  }

  const [
    invoices,
    total,
  ] = await Promise.all([
    Invoice.find(
      filter
    )
      .sort({
        createdAt: -1,
      })
      .skip(
        (
          page -
          1
        ) *
          limit
      )
      .limit(limit),

    Invoice.countDocuments(
      filter
    ),
  ]);

  return {
    invoices:
      invoices.map(
        toInvoiceView
      ),

    pagination: {
      page,
      limit,
      total,

      totalPages:
        Math.ceil(
          total / limit
        ),
    },
  };
}

/* =========================================================
   DASHBOARD DETAILS
========================================================= */

export async function getMerchantDashboardInvoice(
  input: {
    ownerId: string;
    invoiceId: string;
  }
): Promise<MerchantInvoiceView> {
  const merchant =
    await getMerchantByOwner(
      input.ownerId
    );

  const invoiceId =
    normalizeText(
      input.invoiceId
    );

  if (!invoiceId) {
    throw new MerchantInvoiceError(
      "Invoice ID is required.",
      400,
      "INVALID_REQUEST"
    );
  }

  await refreshOverdueInvoices(
    merchant._id
  );

  const invoice =
    await Invoice.findOne({
      merchantId:
        merchant._id,

      invoiceId,
    });

  if (!invoice) {
    throw new MerchantInvoiceError(
      "Invoice not found.",
      404,
      "INVOICE_NOT_FOUND"
    );
  }

  return toInvoiceView(
    invoice
  );
}

/* =========================================================
   MERCHANT API DETAILS
========================================================= */

export async function getMerchantApiInvoice(
  input: {
    merchantId: string;
    mode:
      InvoiceMode;
    invoiceId: string;
  }
): Promise<MerchantInvoiceView> {
  if (
    !mongoose.isValidObjectId(
      input.merchantId
    )
  ) {
    throw new MerchantInvoiceError(
      "Invalid merchant ID.",
      400,
      "INVALID_REQUEST"
    );
  }

  const invoice =
    await Invoice.findOne({
      merchantId:
        new mongoose.Types.ObjectId(
          input.merchantId
        ),

      mode:
        input.mode,

      invoiceId:
        normalizeText(
          input.invoiceId
        ),
    });

  if (!invoice) {
    throw new MerchantInvoiceError(
      "Invoice not found.",
      404,
      "INVOICE_NOT_FOUND"
    );
  }

  return toInvoiceView(
    invoice
  );
}

/* =========================================================
   SEND INVOICE
========================================================= */

export async function sendMerchantDashboardInvoice(
  input: {
    ownerId: string;
    invoiceId: string;
  }
): Promise<{
  invoice:
    MerchantInvoiceView;
  publicUrl: string;
}> {
  const merchant =
    await getMerchantByOwner(
      input.ownerId
    );

  const invoice =
    await Invoice.findOne({
      merchantId:
        merchant._id,

      invoiceId:
        normalizeText(
          input.invoiceId
        ),
    }).select(
      "+publicTokenHash"
    );

  if (!invoice) {
    throw new MerchantInvoiceError(
      "Invoice not found.",
      404,
      "INVOICE_NOT_FOUND"
    );
  }

  if (
    [
      "paid",
      "cancelled",
      "void",
    ].includes(
      invoice.status
    )
  ) {
    throw new MerchantInvoiceError(
      `Invoice cannot be sent from status "${invoice.status}".`,
      409,
      "INVOICE_NOT_SENDABLE"
    );
  }

  const {
    token,
    hash,
  } = createPublicToken();

  const clientUrl =
    (
      process.env.CLIENT_URL
        ?.trim() ||
      "http://localhost:3000"
    ).replace(
      /\/+$/,
      ""
    );

  let parsedClientUrl:
    URL;

  try {
    parsedClientUrl =
      new URL(
        clientUrl
      );
  } catch {
    throw new MerchantInvoiceError(
      "CLIENT_URL is invalid.",
      500,
      "INVALID_REQUEST"
    );
  }

  if (
    process.env.NODE_ENV ===
      "production" &&
    parsedClientUrl.protocol !==
      "https:"
  ) {
    throw new MerchantInvoiceError(
      "CLIENT_URL must use HTTPS in production.",
      500,
      "INVALID_REQUEST"
    );
  }

  /*
 * URL fragment browser/server request logs-এ পাঠানো হয় না।
 * Public page fragment থেকে token নিয়ে API header-এ পাঠাবে।
 */
const publicUrl =
  `${clientUrl}/invoice/${encodeURIComponent(
    invoice.invoiceId
  )}#token=${encodeURIComponent(
    token
  )}`;

  /*
   * Save the hash before sending the email so the
   * emailed token becomes valid immediately.
   */
  invoice.publicTokenHash =
    hash;

  await invoice.save();

  try {
    await sendMerchantInvoiceEmail({
      email:
        invoice.customer.email,

      customerName:
        invoice.customer.name,

      merchantName:
        merchant.businessName,

      invoiceNumber:
        invoice.invoiceNumber,

      amount:
        minorToMajor(
          invoice.totalMinor
        ),

      currency:
        invoice.currency,

      dueDate:
        invoice.dueDate,

      invoiceUrl:
        publicUrl,
    });
  } catch (error) {
    throw new MerchantInvoiceError(
      error instanceof Error
        ? error.message
        : "Invoice email delivery failed.",
      502,
      "EMAIL_DELIVERY_FAILED"
    );
  }

  const now =
    new Date();

  invoice.status =
    invoice.dueDate.getTime() <
      now.getTime()
      ? "overdue"
      : "sent";

  invoice.sentAt =
    now;

  if (
    invoice.status ===
    "overdue"
  ) {
    invoice.overdueAt =
      now;
  }

  await invoice.save();

  return {
    invoice:
      toInvoiceView(
        invoice
      ),

    publicUrl,
  };
}

/* =========================================================
   CANCEL INVOICE
========================================================= */

export async function cancelMerchantDashboardInvoice(
  input: {
    ownerId: string;
    invoiceId: string;
  }
): Promise<MerchantInvoiceView> {
  const merchant =
    await getMerchantByOwner(
      input.ownerId
    );

  const invoice =
    await Invoice.findOne({
      merchantId:
        merchant._id,

      invoiceId:
        normalizeText(
          input.invoiceId
        ),
    });

  if (!invoice) {
    throw new MerchantInvoiceError(
      "Invoice not found.",
      404,
      "INVOICE_NOT_FOUND"
    );
  }

  if (
    ![
      "draft",
      "sent",
      "viewed",
      "overdue",
    ].includes(
      invoice.status
    )
  ) {
    throw new MerchantInvoiceError(
      `Invoice cannot be cancelled from status "${invoice.status}".`,
      409,
      "INVOICE_NOT_CANCELLABLE"
    );
  }

  if (
    invoice.amountPaidMinor >
    0
  ) {
    throw new MerchantInvoiceError(
      "An invoice with received payments cannot be cancelled.",
      409,
      "INVOICE_NOT_CANCELLABLE"
    );
  }

  invoice.status =
    "cancelled";

  invoice.cancelledAt =
    new Date();

  invoice.publicTokenHash =
    undefined;

  await invoice.save();

  return toInvoiceView(
    invoice
  );
}

/* =========================================================
   PUBLIC INVOICE
========================================================= */

export async function getPublicInvoice(
  input: {
    invoiceId: string;
    token: string;
  }
): Promise<MerchantInvoiceView> {
  const invoiceId =
    normalizeText(
      input.invoiceId
    );

  const token =
    normalizeText(
      input.token
    );

  if (
    !invoiceId ||
    !token
  ) {
    throw new MerchantInvoiceError(
      "Valid invoice access is required.",
      401,
      "PUBLIC_ACCESS_DENIED"
    );
  }

  const invoice =
    await Invoice.findOne({
      invoiceId,
    }).select(
      "+publicTokenHash"
    );

  if (
    !invoice ||
    !invoice.publicTokenHash
  ) {
    throw new MerchantInvoiceError(
      "Invoice access was denied.",
      401,
      "PUBLIC_ACCESS_DENIED"
    );
  }

  const presentedHash =
    hashPublicToken(
      token
    );

  if (
    !tokensMatch(
      invoice.publicTokenHash,
      presentedHash
    )
  ) {
    throw new MerchantInvoiceError(
      "Invoice access was denied.",
      401,
      "PUBLIC_ACCESS_DENIED"
    );
  }

  if (
    ![
      "sent",
      "viewed",
      "overdue",
      "paid",
    ].includes(
      invoice.status
    )
  ) {
    throw new MerchantInvoiceError(
      "This invoice is not publicly available.",
      409,
      "PUBLIC_ACCESS_DENIED"
    );
  }

  if (
    invoice.status ===
    "sent"
  ) {
    invoice.status =
      "viewed";

    invoice.viewedAt =
      new Date();

    await invoice.save();
  }

  return toInvoiceView(
    invoice
  );
}