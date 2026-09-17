import crypto from "node:crypto";

import mongoose, {
  type PipelineStage,
} from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Order,
  type IOrder,
  type OrderMode,
  type OrderStatus,
} from "../models/Order.js";

import {
  Payment,
} from "../models/Payment.js";

/* =========================================================
   TYPES
========================================================= */

export interface MerchantApiContext {
  merchantId:
    string;

  mode:
    OrderMode;
}

export interface CreateMerchantOrderInput
  extends MerchantApiContext {
  idempotencyKey:
    string;

  amount:
    unknown;

  currency?:
    unknown;

  merchantReference?:
    unknown;

  description?:
    unknown;

  customer?:
    unknown;

  items?:
    unknown;

  metadata?:
    unknown;

  returnUrl?:
    unknown;

  cancelUrl?:
    unknown;

  expiresInMinutes?:
    unknown;
}

export interface ListMerchantOrdersInput {
  ownerId:
    string;

  page?:
    unknown;

  limit?:
    unknown;

  search?:
    unknown;

  status?:
    unknown;

  mode?:
    unknown;

  from?:
    unknown;

  to?:
    unknown;
}

/* =========================================================
   CONSTANTS
========================================================= */

const ORDER_STATUSES:
  readonly OrderStatus[] = [
    "created",
    "pending",
    "paid",
    "partially_refunded",
    "refunded",
    "cancelled",
    "expired",
    "failed",
  ] as const;

const MAX_ORDER_AMOUNT =
  1_000_000_000;

const DEFAULT_EXPIRY_MINUTES =
  30;

/* =========================================================
   BASIC HELPERS
========================================================= */

function normalizeText(
  value:
    unknown,

  maximumLength =
    500
): string | undefined {
  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  const normalized =
    value.trim();

  if (
    !normalized
  ) {
    return undefined;
  }

  return normalized.slice(
    0,
    maximumLength
  );
}

/* =========================================================
   NORMALIZE MONEY
========================================================= */

function normalizeMoney(
  value:
    unknown,

  fieldName =
    "amount"
): number {
  const amount =
    Number(
      value
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <=
      0 ||
    amount >
      MAX_ORDER_AMOUNT
  ) {
    throw new Error(
      `${fieldName} must be greater than zero and within the supported limit.`
    );
  }

  return (
    Math.round(
      (
        amount +
        Number.EPSILON
      ) *
        100
    ) /
    100
  );
}

/* =========================================================
   DECIMAL
========================================================= */

function toDecimal(
  value:
    number
): mongoose.Types.Decimal128 {
  return mongoose.Types.Decimal128.fromString(
    value.toFixed(
      2
    )
  );
}

/* =========================================================
   DECIMAL TO NUMBER
========================================================= */

function decimalToNumber(
  value:
    unknown
): number {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return 0;
  }

  if (
    typeof value ===
    "number"
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  if (
    typeof value ===
      "object" &&
    value !==
      null &&
    "toString" in
      value
  ) {
    const parsed =
      Number(
        String(
          value
        )
      );

    return Number.isFinite(
      parsed
    )
      ? parsed
      : 0;
  }

  const parsed =
    Number(
      value
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

/* =========================================================
   CURRENCY
========================================================= */

function normalizeCurrency(
  value:
    unknown,

  fallback:
    string
): string {
  const normalized =
    normalizeText(
      value,
      3
    )?.toUpperCase() ||
    fallback.toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      normalized
    )
  ) {
    throw new Error(
      "currency must be a valid three-letter code."
    );
  }

  return normalized;
}

/* =========================================================
   ESCAPE REGEX
========================================================= */

function escapeRegex(
  value:
    string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

/* =========================================================
   URL VALIDATION
========================================================= */

function normalizeUrl(
  value:
    unknown,

  fieldName:
    string,

  mode:
    OrderMode
): string | undefined {
  const normalized =
    normalizeText(
      value,
      1000
    );

  if (
    !normalized
  ) {
    return undefined;
  }

  let parsedUrl:
    URL;

  try {
    parsedUrl =
      new URL(
        normalized
      );
  } catch {
    throw new Error(
      `${fieldName} must be a valid URL.`
    );
  }

  const isLocalhost =
    parsedUrl.hostname ===
      "localhost" ||
    parsedUrl.hostname ===
      "127.0.0.1";

  /*
   * Local HTTP is allowed only in test mode.
   *
   * Live mode callback URLs must use HTTPS.
   */

  if (
    parsedUrl.protocol !==
      "https:" &&
    !(
      mode ===
        "test" &&
      isLocalhost
    )
  ) {
    throw new Error(
      `${fieldName} must use HTTPS outside local test mode.`
    );
  }

  return parsedUrl.toString();
}

/* =========================================================
   CUSTOMER VALIDATION
========================================================= */

function normalizeCustomer(
  value:
    unknown
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return undefined;
  }

  if (
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw new Error(
      "customer must be an object."
    );
  }

  const customer =
    value as Record<
      string,
      unknown
    >;

  const email =
    normalizeText(
      customer.email,
      254
    )?.toLowerCase();

  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    throw new Error(
      "customer.email is invalid."
    );
  }

  return {
    name:
      normalizeText(
        customer.name,
        150
      ),

    email,

    phone:
      normalizeText(
        customer.phone,
        40
      ),

    externalCustomerId:
      normalizeText(
        customer.externalCustomerId,
        150
      ),
  };
}

/* =========================================================
   ORDER ITEMS
========================================================= */

function normalizeItems(
  value:
    unknown
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return [];
  }

  if (
    !Array.isArray(
      value
    ) ||
    value.length >
      100
  ) {
    throw new Error(
      "items must be an array containing at most 100 items."
    );
  }

  return value.map(
    (
      item:
        unknown,

      index:
        number
    ) => {
      if (
        typeof item !==
          "object" ||
        item ===
          null ||
        Array.isArray(
          item
        )
      ) {
        throw new Error(
          `items[${index}] must be an object.`
        );
      }

      const rawItem =
        item as Record<
          string,
          unknown
        >;

      const name =
        normalizeText(
          rawItem.name,
          180
        );

      if (
        !name
      ) {
        throw new Error(
          `items[${index}].name is required.`
        );
      }

      const quantity =
        Number(
          rawItem.quantity
        );

      if (
        !Number.isInteger(
          quantity
        ) ||
        quantity <
          1 ||
        quantity >
          10_000
      ) {
        throw new Error(
          `items[${index}].quantity is invalid.`
        );
      }

      const unitAmount =
        normalizeMoney(
          rawItem.unitAmount,
          `items[${index}].unitAmount`
        );

      const totalAmount =
        Math.round(
          (
            unitAmount *
              quantity +
            Number.EPSILON
          ) *
            100
        ) /
        100;

      return {
        name,

        sku:
          normalizeText(
            rawItem.sku,
            100
          ),

        quantity,

        unitAmount:
          toDecimal(
            unitAmount
          ),

        totalAmount:
          toDecimal(
            totalAmount
          ),
      };
    }
  );
}

/* =========================================================
   METADATA
========================================================= */

function normalizeMetadata(
  value:
    unknown
): Record<
  string,
  string
> {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return {};
  }

  if (
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw new Error(
      "metadata must be an object."
    );
  }

  const entries =
    Object.entries(
      value as Record<
        string,
        unknown
      >
    );

  if (
    entries.length >
    20
  ) {
    throw new Error(
      "metadata can contain at most 20 fields."
    );
  }

  return Object.fromEntries(
    entries.map(
      ([
        rawKey,
        rawValue,
      ]) => {
        const key =
          rawKey
            .trim()
            .slice(
              0,
              50
            );

        if (
          !key
        ) {
          throw new Error(
            "metadata keys cannot be empty."
          );
        }

        if (
          typeof rawValue !==
            "string" &&
          typeof rawValue !==
            "number" &&
          typeof rawValue !==
            "boolean"
        ) {
          throw new Error(
            `metadata.${key} must be a string, number or boolean.`
          );
        }

        return [
          key,

          String(
            rawValue
          ).slice(
            0,
            500
          ),
        ];
      }
    )
  );
}

/* =========================================================
   ORDER IDENTIFIER
========================================================= */

function generateOrderId(
  mode:
    OrderMode
): string {
  const timestamp =
    Date.now().toString(
      36
    );

  const randomPart =
    crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      );

  return `ord_${mode}_${timestamp}_${randomPart}`;
}

/* =========================================================
   CHECKOUT URL
========================================================= */

function createCheckoutUrl(
  orderId:
    string
): string {
  const baseUrl =
    process.env
      .CHECKOUT_BASE_URL?.trim() ||
    process.env
      .CLIENT_URL?.trim() ||
    "http://localhost:3000";

  let parsedBaseUrl:
    URL;

  try {
    parsedBaseUrl =
      new URL(
        baseUrl
      );
  } catch {
    throw new Error(
      "CHECKOUT_BASE_URL is invalid."
    );
  }

  return new URL(
    `/checkout/${encodeURIComponent(
      orderId
    )}`,

    parsedBaseUrl
  ).toString();
}

/* =========================================================
   ORDER DTO
========================================================= */

function formatOrder(
  order:
    | IOrder
    | Record<
        string,
        unknown
      >
) {
  const rawOrder =
    order as unknown as Record<
      string,
      unknown
    >;

  const rawCustomer =
    rawOrder.customer &&
    typeof rawOrder.customer ===
      "object"
      ? rawOrder.customer as Record<
          string,
          unknown
        >
      : undefined;

  const rawItems =
    Array.isArray(
      rawOrder.items
    )
      ? rawOrder.items
      : [];

  const rawMetadata =
    rawOrder.metadata;

  return {
    id:
      String(
        rawOrder._id
      ),

    orderId:
      rawOrder.orderId,

    merchantId:
      String(
        rawOrder.merchantId
      ),

    mode:
      rawOrder.mode,

    status:
      rawOrder.status,

    amount:
      decimalToNumber(
        rawOrder.amount
      ),

    currency:
      rawOrder.currency,

    merchantReference:
      rawOrder.merchantReference ??
      null,

    description:
      rawOrder.description ??
      null,

    customer:
      rawCustomer
        ? {
            name:
              rawCustomer.name ??
              null,

            email:
              rawCustomer.email ??
              null,

            phone:
              rawCustomer.phone ??
              null,

            externalCustomerId:
              rawCustomer.externalCustomerId ??
              null,
          }
        : null,

    items:
      rawItems.map(
        (
          rawItem:
            unknown
        ) => {
          const item =
            rawItem as Record<
              string,
              unknown
            >;

          return {
            name:
              item.name,

            sku:
              item.sku ??
              null,

            quantity:
              Number(
                item.quantity
              ),

            unitAmount:
              decimalToNumber(
                item.unitAmount
              ),

            totalAmount:
              decimalToNumber(
                item.totalAmount
              ),
          };
        }
      ),

    metadata:
      rawMetadata instanceof
      Map
        ? Object.fromEntries(
            rawMetadata.entries()
          )
        : rawMetadata ??
          {},

    returnUrl:
      rawOrder.returnUrl ??
      null,

    cancelUrl:
      rawOrder.cancelUrl ??
      null,

    checkoutUrl:
      rawOrder.checkoutUrl,

    paidAt:
      rawOrder.paidAt ??
      null,

    cancelledAt:
      rawOrder.cancelledAt ??
      null,

    expiredAt:
      rawOrder.expiredAt ??
      null,

    expiresAt:
      rawOrder.expiresAt,

    createdAt:
      rawOrder.createdAt,

    updatedAt:
      rawOrder.updatedAt,
  };
}

/* =========================================================
   PAYMENT DTO
========================================================= */

function formatPayment(
  payment:
    | Record<
        string,
        unknown
      >
    | null
) {
  if (
    !payment
  ) {
    return null;
  }

  return {
    paymentId:
      payment.paymentId,

    status:
      payment.status,

    amount:
      decimalToNumber(
        payment.amount
      ),

    currency:
      payment.currency,

    provider:
      payment.provider,

    sourceType:
      payment.sourceType,

    mode:
      payment.mode,

    checkoutUrl:
      payment.checkoutUrl ??
      null,

    createdAt:
      payment.createdAt,

    completedAt:
      payment.completedAt ??
      null,
  };
}

/* =========================================================
   MERCHANT LOOKUP FOR DASHBOARD
========================================================= */

async function findMerchantForOwner(
  ownerId:
    string
) {
  if (
    !mongoose.isValidObjectId(
      ownerId
    )
  ) {
    throw new Error(
      "Invalid merchant owner ID."
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
        [
          "_id",
          "businessName",
          "displayName",
          "businessDisplayName",
          "slug",
          "status",
          "verificationStatus",
          "defaultCurrency",
          "testEnabled",
          "liveEnabled",
        ].join(
          " "
        )
      )
      .lean();

  if (
    !merchant
  ) {
    throw new Error(
      "Merchant account not found."
    );
  }

  return merchant;
}

/* =========================================================
   CREATE MERCHANT ORDER
========================================================= */

export async function createMerchantOrder(
  input:
    CreateMerchantOrderInput
) {
  /* =======================================================
     MERCHANT ID
  ======================================================= */

  if (
    !mongoose.isValidObjectId(
      input.merchantId
    )
  ) {
    throw new Error(
      "Invalid merchant ID."
    );
  }

  /* =======================================================
     IDEMPOTENCY KEY
  ======================================================= */

  const idempotencyKey =
    normalizeText(
      input.idempotencyKey,
      200
    );

  if (
    !idempotencyKey
  ) {
    throw new Error(
      "Idempotency-Key header is required."
    );
  }

  /* =======================================================
     LOAD MERCHANT
  ======================================================= */

  const merchant =
    await Merchant.findById(
      input.merchantId
    )
      .select(
        [
          "_id",
          "defaultCurrency",
          "status",
          "testEnabled",
          "liveEnabled",
          "verificationStatus",
        ].join(
          " "
        )
      )
      .lean();

  if (
    !merchant
  ) {
    throw new Error(
      "Merchant account not found."
    );
  }

  /* =======================================================
     TEST MODE ACCESS

     Pending merchants are intentionally allowed to use the
     sandbox environment.

     This lets merchants integrate and test Coffer before
     completing official verification / KYB.

     Allowed:
     - pending
     - active

     Blocked:
     - suspended
     - disabled
  ======================================================= */

  if (
    input.mode ===
    "test"
  ) {
    const allowedStatus =
      merchant.status ===
        "pending" ||
      merchant.status ===
        "active";

    if (
      !allowedStatus
    ) {
      throw new Error(
        "Merchant account is not available for test mode."
      );
    }

    if (
      merchant.testEnabled !==
      true
    ) {
      throw new Error(
        "Test mode is disabled."
      );
    }
  }

  /* =======================================================
     LIVE MODE ACCESS

     Live payments require:
     - active merchant
     - verified merchant
     - live access enabled
  ======================================================= */

  if (
    input.mode ===
    "live"
  ) {
    if (
      merchant.status !==
      "active"
    ) {
      throw new Error(
        "Merchant account must be active for live mode."
      );
    }

    if (
      merchant.verificationStatus !==
      "verified"
    ) {
      throw new Error(
        "Merchant verification is required for live mode."
      );
    }

    if (
      merchant.liveEnabled !==
      true
    ) {
      throw new Error(
        "Live mode is not enabled for this merchant."
      );
    }
  }

  /* =======================================================
     IDEMPOTENCY CHECK
  ======================================================= */

  const existingOrder =
    await Order.findOne({
      merchantId:
        merchant._id,

      mode:
        input.mode,

      idempotencyKey,
    }).select(
      "+idempotencyKey"
    );

  if (
    existingOrder
  ) {
    return {
      duplicate:
        true,

      order:
        formatOrder(
          existingOrder
        ),
    };
  }

  /* =======================================================
     NORMALIZE INPUT
  ======================================================= */

  const amount =
    normalizeMoney(
      input.amount
    );

  const normalizedCurrency =
    normalizeCurrency(
      input.currency,
      merchant.defaultCurrency
    );

  const normalizedItems =
    normalizeItems(
      input.items
    );

  /* =======================================================
     ITEM TOTAL VALIDATION
  ======================================================= */

  if (
    normalizedItems.length >
    0
  ) {
    const itemTotal =
      normalizedItems.reduce(
        (
          total,
          item
        ) =>
          total +
          decimalToNumber(
            item.totalAmount
          ),
        0
      );

    if (
      Math.abs(
        itemTotal -
          amount
      ) >
      0.009
    ) {
      throw new Error(
        "The sum of item totals must equal the order amount."
      );
    }
  }

  /* =======================================================
     EXPIRATION
  ======================================================= */

  const expiresInMinutes =
    Number(
      input.expiresInMinutes ??
        DEFAULT_EXPIRY_MINUTES
    );

  if (
    !Number.isInteger(
      expiresInMinutes
    ) ||
    expiresInMinutes <
      5 ||
    expiresInMinutes >
      1440
  ) {
    throw new Error(
      "expiresInMinutes must be between 5 and 1440."
    );
  }

  /* =======================================================
     GENERATE ORDER ID
  ======================================================= */

  const orderId =
    generateOrderId(
      input.mode
    );

  /* =======================================================
     CREATE ORDER
  ======================================================= */

  try {
    const order =
      await Order.create({
        orderId,

        merchantId:
          merchant._id,

        mode:
          input.mode,

        status:
          "created",

        amount:
          toDecimal(
            amount
          ),

        currency:
          normalizedCurrency,

        merchantReference:
          normalizeText(
            input.merchantReference,
            150
          ),

        description:
          normalizeText(
            input.description,
            500
          ),

        customer:
          normalizeCustomer(
            input.customer
          ),

        items:
          normalizedItems,

        metadata:
          normalizeMetadata(
            input.metadata
          ),

        returnUrl:
          normalizeUrl(
            input.returnUrl,
            "returnUrl",
            input.mode
          ),

        cancelUrl:
          normalizeUrl(
            input.cancelUrl,
            "cancelUrl",
            input.mode
          ),

        checkoutUrl:
          createCheckoutUrl(
            orderId
          ),

        idempotencyKey,

        expiresAt:
          new Date(
            Date.now() +
              expiresInMinutes *
                60_000
          ),
      });

    return {
      duplicate:
        false,

      order:
        formatOrder(
          order
        ),
    };
  } catch (
    error:
      unknown
  ) {
    /*
     * Race-safe duplicate handling.
     */

    if (
      typeof error ===
        "object" &&
      error !==
        null &&
      "code" in
        error &&
      error.code ===
        11000
    ) {
      const duplicateOrder =
        await Order.findOne({
          merchantId:
            merchant._id,

          mode:
            input.mode,

          idempotencyKey,
        }).select(
          "+idempotencyKey"
        );

      if (
        duplicateOrder
      ) {
        return {
          duplicate:
            true,

          order:
            formatOrder(
              duplicateOrder
            ),
        };
      }
    }

    throw error;
  }
}

/* =========================================================
   GET ORDER FOR MERCHANT API
========================================================= */

export async function getOrderByMerchantApi(
  input:
    MerchantApiContext & {
      orderId:
        string;
    }
) {
  const orderId =
    input.orderId.trim();

  if (
    !orderId
  ) {
    throw new Error(
      "Order ID is required."
    );
  }

  if (
    !mongoose.isValidObjectId(
      input.merchantId
    )
  ) {
    throw new Error(
      "Invalid merchant ID."
    );
  }

  const order =
    await Order.findOne({
      orderId,

      merchantId:
        new mongoose.Types.ObjectId(
          input.merchantId
        ),

      mode:
        input.mode,
    });

  if (
    !order
  ) {
    throw new Error(
      "Order not found."
    );
  }

  const payment =
    await Payment.findOne({
      merchantId:
        new mongoose.Types.ObjectId(
          input.merchantId
        ),

      orderId:
        order._id,
    })
      .sort({
        createdAt:
          -1,
      })
      .lean();

  return {
    order:
      formatOrder(
        order
      ),

    payment:
      formatPayment(
        payment as unknown as
          | Record<
              string,
              unknown
            >
          | null
      ),
  };
}

/* =========================================================
   LIST DASHBOARD ORDERS
========================================================= */

export async function listMerchantDashboardOrders(
  input:
    ListMerchantOrdersInput
) {
  const merchant =
    await findMerchantForOwner(
      input.ownerId
    );

  /* =======================================================
     PAGINATION
  ======================================================= */

  const parsedPage =
    Number(
      input.page
    );

  const page =
    Number.isInteger(
      parsedPage
    ) &&
    parsedPage >
      0
      ? parsedPage
      : 1;

  const parsedLimit =
    Number(
      input.limit
    );

  const limit =
    Number.isInteger(
      parsedLimit
    ) &&
    parsedLimit >=
      5
      ? Math.min(
          parsedLimit,
          100
        )
      : 20;

  /* =======================================================
     FILTER VALUES
  ======================================================= */

  const search =
    normalizeText(
      input.search,
      150
    ) ||
    "";

  const status =
    ORDER_STATUSES.includes(
      input.status as
        OrderStatus
    )
      ? input.status as
          OrderStatus
      : undefined;

  const mode:
    | OrderMode
    | undefined =
    input.mode ===
      "test" ||
    input.mode ===
      "live"
      ? input.mode
      : undefined;

  /* =======================================================
     BASE FILTER
  ======================================================= */

  const filter:
    Record<
      string,
      unknown
    > = {
    merchantId:
      merchant._id,
  };

  if (
    status
  ) {
    filter.status =
      status;
  }

  if (
    mode
  ) {
    filter.mode =
      mode;
  }

  /* =======================================================
     SEARCH
  ======================================================= */

  if (
    search
  ) {
    const regex =
      new RegExp(
        escapeRegex(
          search
        ),
        "i"
      );

    filter.$or = [
      {
        orderId:
          regex,
      },

      {
        merchantReference:
          regex,
      },

      {
        "customer.name":
          regex,
      },

      {
        "customer.email":
          regex,
      },
    ];
  }

  /* =======================================================
     DATE FILTER
  ======================================================= */

  const from =
    normalizeText(
      input.from,
      30
    );

  const to =
    normalizeText(
      input.to,
      30
    );

  if (
    from ||
    to
  ) {
    const dateRange:
      Record<
        string,
        Date
      > = {};

    if (
      from
    ) {
      const fromDate =
        new Date(
          from
        );

      if (
        !Number.isNaN(
          fromDate.getTime()
        )
      ) {
        fromDate.setHours(
          0,
          0,
          0,
          0
        );

        dateRange.$gte =
          fromDate;
      }
    }

    if (
      to
    ) {
      const toDate =
        new Date(
          to
        );

      if (
        !Number.isNaN(
          toDate.getTime()
        )
      ) {
        toDate.setHours(
          23,
          59,
          59,
          999
        );

        dateRange.$lte =
          toDate;
      }
    }

    if (
      Object.keys(
        dateRange
      ).length >
      0
    ) {
      filter.createdAt =
        dateRange;
    }
  }

  /* =======================================================
     TOTAL
  ======================================================= */

  const total =
    await Order.countDocuments(
      filter
    );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total /
          limit
      )
    );

  const safePage =
    Math.min(
      page,
      totalPages
    );

  /* =======================================================
     ORDERS
  ======================================================= */

  const orders =
    await Order.find(
      filter
    )
      .sort({
        createdAt:
          -1,
      })
      .skip(
        (
          safePage -
          1
        ) *
          limit
      )
      .limit(
        limit
      )
      .lean();

  /* =======================================================
     SUMMARY
  ======================================================= */

  const summaryResult =
    await Order.aggregate<{
      totalOrders:
        number;

      paidOrders:
        number;

      pendingOrders:
        number;

      grossAmount:
        unknown;
    }>(
      [
        {
          $match: {
            merchantId:
              merchant._id,
          },
        },

        {
          $group: {
            _id:
              null,

            totalOrders: {
              $sum:
                1,
            },

            paidOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "paid",
                    ],
                  },

                  1,

                  0,
                ],
              },
            },

            pendingOrders: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",

                      [
                        "created",
                        "pending",
                      ],
                    ],
                  },

                  1,

                  0,
                ],
              },
            },

            grossAmount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "paid",
                    ],
                  },

                  "$amount",

                  0,
                ],
              },
            },
          },
        },
      ] as PipelineStage[]
    );

  const summary =
    summaryResult[0];

  /* =======================================================
     MERCHANT DISPLAY NAME
  ======================================================= */

  const merchantRaw =
    merchant as unknown as Record<
      string,
      unknown
    >;

  const businessName =
    typeof merchantRaw.businessDisplayName ===
      "string" &&
    merchantRaw.businessDisplayName.trim()
      ? merchantRaw.businessDisplayName
      : typeof merchantRaw.displayName ===
          "string" &&
        merchantRaw.displayName.trim()
        ? merchantRaw.displayName
        : typeof merchantRaw.businessName ===
            "string"
          ? merchantRaw.businessName
          : "Merchant";

  /* =======================================================
     RESPONSE
  ======================================================= */

  return {
    merchant: {
      id:
        String(
          merchant._id
        ),

      businessName,

      defaultCurrency:
        merchant.defaultCurrency,
    },

    orders:
      orders.map(
        (
          order
        ) =>
          formatOrder(
            order as unknown as Record<
              string,
              unknown
            >
          )
      ),

    summary: {
      totalOrders:
        summary?.totalOrders ??
        0,

      paidOrders:
        summary?.paidOrders ??
        0,

      pendingOrders:
        summary?.pendingOrders ??
        0,

      grossAmount:
        decimalToNumber(
          summary?.grossAmount ??
            0
        ),
    },

    pagination: {
      page:
        safePage,

      limit,

      total,

      totalPages,

      hasNextPage:
        safePage <
        totalPages,

      hasPreviousPage:
        safePage >
        1,
    },
  };
}

/* =========================================================
   GET DASHBOARD ORDER
========================================================= */

export async function getMerchantDashboardOrder(
  ownerId:
    string,

  orderIdValue:
    string
) {
  const merchant =
    await findMerchantForOwner(
      ownerId
    );

  const orderId =
    orderIdValue.trim();

  if (
    !orderId
  ) {
    throw new Error(
      "Order ID is required."
    );
  }

  const order =
    await Order.findOne({
      orderId,

      merchantId:
        merchant._id,
    });

  if (
    !order
  ) {
    throw new Error(
      "Order not found."
    );
  }

  const payment =
    await Payment.findOne({
      merchantId:
        merchant._id,

      orderId:
        order._id,
    })
      .sort({
        createdAt:
          -1,
      })
      .lean();

  return {
    order:
      formatOrder(
        order
      ),

    payment:
      formatPayment(
        payment as unknown as
          | Record<
              string,
              unknown
            >
          | null
      ),
  };
}