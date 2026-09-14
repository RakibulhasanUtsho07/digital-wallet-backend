import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import type {
  OrderMode,
} from "../models/Order.js";

import {
  createMerchantOrder,

  getOrderByMerchantApi,

  listMerchantDashboardOrders,

  getMerchantDashboardOrder,
} from "../services/merchantOrderService.js";

/* =========================================================
   TYPES
========================================================= */

interface MerchantApiRequest
  extends AuthRequest {
  merchant?: {
    _id: string;
    environment: OrderMode;
  };
}

/* =========================================================
   HELPERS
========================================================= */

function value(
  input: unknown,
): string {
  return typeof input ===
    "string"
    ? input.trim()
    : "";
}

function failure(
  res: Response,
  error: unknown,
): void {
  const message =
    error instanceof Error
      ? error.message
      : "Order request failed.";

  const status =
    message ===
      "Order not found." ||
    message ===
      "Merchant account not found."
      ? 404
      : message.includes(
          "authentication",
        )
        ? 401
        : message.includes(
              "Invalid",
            )
          ? 400
          : 500;

  res.status(status).json({
    success: false,
    message,
  });
}

/* =========================================================
   CREATE MERCHANT API ORDER

   POST /api/v1/orders
========================================================= */

export async function createMerchantOrderController(
  req: MerchantApiRequest,
  res: Response,
): Promise<void> {
  try {
    const merchant =
      req.merchant;

    if (!merchant?._id) {
      res.status(401).json({
        success: false,

        message:
          "Merchant authentication required.",
      });

      return;
    }

    const idempotencyKey =
      value(
        req.get(
          "Idempotency-Key",
        ),
      );

    const body =
      req.body ?? {};

    const result =
      await createMerchantOrder({
        merchantId:
          merchant._id,

        mode:
          merchant.environment,

        idempotencyKey,

        amount:
          body.amount,

        currency:
          body.currency,

        merchantReference:
          body.merchantReference,

        description:
          body.description,

        customer:
          body.customer,

        items:
          body.items,

        metadata:
          body.metadata,

        returnUrl:
          body.returnUrl,

        cancelUrl:
          body.cancelUrl,

        expiresInMinutes:
          body.expiresInMinutes,
      });

    res.status(
      result.duplicate
        ? 200
        : 201,
    ).json({
      success: true,

      duplicate:
        result.duplicate,

      order:
        result.order,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "CREATE MERCHANT ORDER ERROR:",
      error,
    );

    failure(
      res,
      error,
    );
  }
}

/* =========================================================
   GET MERCHANT API ORDER

   GET /api/v1/orders/:orderId
========================================================= */

export async function getMerchantApiOrderController(
  req: MerchantApiRequest,
  res: Response,
): Promise<void> {
  try {
    const merchant =
      req.merchant;

    if (!merchant?._id) {
      res.status(401).json({
        success: false,

        message:
          "Merchant authentication required.",
      });

      return;
    }

    const result =
      await getOrderByMerchantApi({
        merchantId:
          merchant._id,

        mode:
          merchant.environment,

        orderId:
          value(
            req.params.orderId,
          ),
      });

    res.status(200).json({
      success: true,

      ...result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "GET MERCHANT API ORDER ERROR:",
      error,
    );

    failure(
      res,
      error,
    );
  }
}

/* =========================================================
   LIST MERCHANT DASHBOARD ORDERS

   GET /api/merchants/orders
========================================================= */

export async function listMerchantDashboardOrdersController(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const userId =
      req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,

        message:
          "Authentication required.",
      });

      return;
    }

    const result =
      await listMerchantDashboardOrders({
        ownerId:
          String(userId),

        page:
          req.query.page,

        limit:
          req.query.limit,

        search:
          req.query.search,

        status:
          req.query.status,

        mode:
          req.query.mode,

        from:
          req.query.from,

        to:
          req.query.to,
      });

    res.status(200).json({
      success: true,

      data:
        result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "LIST MERCHANT ORDERS ERROR:",
      error,
    );

    failure(
      res,
      error,
    );
  }
}

/* =========================================================
   GET MERCHANT DASHBOARD ORDER

   GET /api/merchants/orders/:orderId
========================================================= */

export async function getMerchantDashboardOrderController(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const userId =
      req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,

        message:
          "Authentication required.",
      });

      return;
    }

    const orderId =
      value(
        req.params.orderId,
      );

    const result =
      await getMerchantDashboardOrder(
        String(userId),
        orderId,
      );

    res.status(200).json({
      success: true,

      ...result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "GET MERCHANT DASHBOARD ORDER ERROR:",
      error,
    );

    failure(
      res,
      error,
    );
  }
}