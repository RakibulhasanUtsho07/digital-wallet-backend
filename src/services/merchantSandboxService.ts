import mongoose from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  createMerchantOrder,
  getMerchantDashboardOrder,
  listMerchantDashboardOrders,
} from "./merchantOrderService.js";

/* =========================================================
   TYPES
========================================================= */

export interface CreateMerchantSandboxOrderInput {
  ownerId: string;
  idempotencyKey: string;
  amount: unknown;
  currency?: unknown;
  merchantReference?: unknown;
  description?: unknown;
  customer?: unknown;
  items?: unknown;
  metadata?: unknown;
  returnUrl?: unknown;
  cancelUrl?: unknown;
  expiresInMinutes?: unknown;
}

export interface ListMerchantSandboxOrdersInput {
  ownerId: string;
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  status?: unknown;
  from?: unknown;
  to?: unknown;
}

/* =========================================================
   MERCHANT LOOKUP
========================================================= */

async function requireSandboxMerchant(
  ownerId: string,
) {
  if (
    !mongoose.isValidObjectId(
      ownerId,
    )
  ) {
    throw new Error(
      "Invalid merchant owner ID.",
    );
  }

  const merchant =
    await Merchant.findOne({
      ownerId:
        new mongoose.Types.ObjectId(
          ownerId,
        ),
    })
      .select(
        [
          "_id",
          "status",
          "testEnabled",
          "defaultCurrency",
        ].join(" "),
      )
      .lean();

  if (!merchant) {
    throw new Error(
      "Merchant account not found.",
    );
  }

  if (
    merchant.status !==
    "active"
  ) {
    throw new Error(
      "Merchant account is not active.",
    );
  }

  if (
    merchant.testEnabled !==
    true
  ) {
    throw new Error(
      "Test mode is disabled for this merchant.",
    );
  }

  return merchant;
}

/* =========================================================
   CREATE SANDBOX ORDER

   The mode is intentionally hard-coded to test. A dashboard
   request cannot turn this endpoint into a live transaction.
========================================================= */

export async function createMerchantSandboxOrder(
  input: CreateMerchantSandboxOrderInput,
) {
  const merchant =
    await requireSandboxMerchant(
      input.ownerId,
    );

  return createMerchantOrder({
    merchantId:
      merchant._id.toString(),

    mode:
      "test",

    idempotencyKey:
      input.idempotencyKey,

    amount:
      input.amount,

    currency:
      input.currency ??
      merchant.defaultCurrency,

    merchantReference:
      input.merchantReference,

    description:
      input.description,

    customer:
      input.customer,

    items:
      input.items,

    metadata: {
      ...(
        typeof input.metadata ===
          "object" &&
        input.metadata !== null &&
        !Array.isArray(
          input.metadata,
        )
          ? input.metadata
          : {}
      ),

      source:
        "merchant_dashboard_sandbox",
    },

    returnUrl:
      input.returnUrl,

    cancelUrl:
      input.cancelUrl,

    expiresInMinutes:
      input.expiresInMinutes,
  });
}

/* =========================================================
   LIST SANDBOX ORDERS
========================================================= */

export async function listMerchantSandboxOrders(
  input: ListMerchantSandboxOrdersInput,
) {
  await requireSandboxMerchant(
    input.ownerId,
  );

  return listMerchantDashboardOrders({
    ownerId:
      input.ownerId,

    page:
      input.page,

    limit:
      input.limit,

    search:
      input.search,

    status:
      input.status,

    mode:
      "test",

    from:
      input.from,

    to:
      input.to,
  });
}

/* =========================================================
   GET SANDBOX ORDER
========================================================= */

export async function getMerchantSandboxOrder(
  ownerId: string,
  orderId: string,
) {
  await requireSandboxMerchant(
    ownerId,
  );

  const result =
    await getMerchantDashboardOrder(
      ownerId,
      orderId,
    );

  if (
    result.order.mode !==
    "test"
  ) {
    /*
     * Do not reveal whether a live order exists through the
     * sandbox endpoint.
     */
    throw new Error(
      "Order not found.",
    );
  }

  return result;
}



