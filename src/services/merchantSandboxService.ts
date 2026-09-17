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

   TEST MODE RULE:

   Allowed:
   - pending
   - active

   Blocked:
   - suspended
   - disabled
   - any other unavailable state

   Merchant verification is NOT required for sandbox mode.
========================================================= */

async function requireSandboxMerchant(
  ownerId: string,
) {
  const normalizedOwnerId =
    typeof ownerId ===
    "string"
      ? ownerId.trim()
      : "";

  if (
    !normalizedOwnerId ||
    !mongoose.isValidObjectId(
      normalizedOwnerId,
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
          normalizedOwnerId,
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

  /* =======================================================
     FIX #1

     Previously only active merchants could access the
     dashboard sandbox.

     That contradicted merchantOrderService, where both
     pending and active merchants may test their integration
     before production verification.
  ======================================================== */

  const sandboxStatusAllowed =
    merchant.status ===
      "pending" ||
    merchant.status ===
      "active";

  if (
    !sandboxStatusAllowed
  ) {
    throw new Error(
      "Merchant account is not available for test mode.",
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

   SECURITY:
   Mode is intentionally hard-coded to "test".

   A merchant dashboard request cannot turn this endpoint
   into a live payment/order endpoint.
========================================================= */

export async function createMerchantSandboxOrder(
  input:
    CreateMerchantSandboxOrderInput,
) {
  const merchant =
    await requireSandboxMerchant(
      input.ownerId,
    );

  return createMerchantOrder({
    merchantId:
      merchant._id.toString(),

    /*
     * Never accept this value from the frontend.
     */
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
        input.metadata !==
          null &&
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

   Only TEST orders can be returned.
========================================================= */

export async function listMerchantSandboxOrders(
  input:
    ListMerchantSandboxOrdersInput,
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

    /*
     * Never allow frontend to override this.
     */
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

  const normalizedOrderId =
    typeof orderId ===
    "string"
      ? orderId.trim()
      : "";

  if (
    !normalizedOrderId
  ) {
    throw new Error(
      "Order ID is required.",
    );
  }

  const result =
    await getMerchantDashboardOrder(
      ownerId,
      normalizedOrderId,
    );

  /* =======================================================
     LIVE ORDER ISOLATION

     Even if somebody knows a live order ID, it must never
     be exposed through this sandbox endpoint.
  ======================================================== */

  if (
    result.order.mode !==
    "test"
  ) {
    throw new Error(
      "Order not found.",
    );
  }

  return result;
}