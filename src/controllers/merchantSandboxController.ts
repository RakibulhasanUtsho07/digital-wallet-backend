import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  createMerchantSandboxOrder,
  getMerchantSandboxOrder,
  listMerchantSandboxOrders,
} from "../services/merchantSandboxService.js";

/* =========================================================
   HELPERS
========================================================= */

function textValue(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function respondWithError(
  res: Response,
  error: unknown,
): void {
  const message =
    error instanceof Error
      ? error.message
      : "Sandbox request failed.";

  let statusCode =
    500;

  if (
    message ===
      "Order not found." ||
    message ===
      "Merchant account not found."
  ) {
    statusCode =
      404;
  } else if (
    message.includes(
      "not active",
    ) ||
    message.includes(
      "disabled",
    )
  ) {
    statusCode =
      403;
  } else if (
    message.includes(
      "required",
    ) ||
    message.includes(
      "Invalid",
    ) ||
    message.includes(
      "invalid",
    ) ||
    message.includes(
      "must",
    ) ||
    message.includes(
      "cannot",
    ) ||
    message.includes(
      "equal",
    ) ||
    message.includes(
      "between",
    )
  ) {
    statusCode =
      400;
  }

  res.status(
    statusCode,
  ).json({
    success: false,
    message,
  });
}

function requireUserId(
  req: AuthRequest,
  res: Response,
): string | undefined {
  const userId =
    req.user?._id;

  if (!userId) {
    res.status(401).json({
      success: false,
      message:
        "Authentication is required.",
    });

    return undefined;
  }

  return String(
    userId,
  );
}

/* =========================================================
   CREATE TEST ORDER

   POST /api/merchants/sandbox/orders
========================================================= */

export async function createMerchantSandboxOrderController(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const userId =
    requireUserId(
      req,
      res,
    );

  if (!userId) {
    return;
  }

  try {
    const idempotencyKey =
      textValue(
        req.get(
          "Idempotency-Key",
        ),
      );

    if (!idempotencyKey) {
      res.status(400).json({
        success: false,
        message:
          "Idempotency-Key header is required.",
      });

      return;
    }

    if (
      idempotencyKey.length >
      200
    ) {
      res.status(400).json({
        success: false,
        message:
          "Idempotency-Key is too long.",
      });

      return;
    }

    const body =
      req.body ?? {};

    const result =
      await createMerchantSandboxOrder({
        ownerId:
          userId,

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

      message:
        result.duplicate
          ? "The existing sandbox order was returned."
          : "Sandbox order created successfully.",

      order:
        result.order,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "CREATE MERCHANT SANDBOX ORDER ERROR:",
      error,
    );

    respondWithError(
      res,
      error,
    );
  }
}

/* =========================================================
   LIST TEST ORDERS

   GET /api/merchants/sandbox/orders
========================================================= */

export async function listMerchantSandboxOrdersController(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const userId =
    requireUserId(
      req,
      res,
    );

  if (!userId) {
    return;
  }

  try {
    const result =
      await listMerchantSandboxOrders({
        ownerId:
          userId,

        page:
          req.query.page,

        limit:
          req.query.limit,

        search:
          req.query.search,

        status:
          req.query.status,

        from:
          req.query.from,

        to:
          req.query.to,
      });

    res.status(200).json({
      success: true,

      data: {
        merchant:
          result.merchant,

        orders:
          result.orders,

        pagination:
          result.pagination,
      },
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "LIST MERCHANT SANDBOX ORDERS ERROR:",
      error,
    );

    respondWithError(
      res,
      error,
    );
  }
}

/* =========================================================
   GET TEST ORDER

   GET /api/merchants/sandbox/orders/:orderId
========================================================= */

export async function getMerchantSandboxOrderController(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const userId =
    requireUserId(
      req,
      res,
    );

  if (!userId) {
    return;
  }

  try {
    const result =
      await getMerchantSandboxOrder(
        userId,
        textValue(
          req.params.orderId,
        ),
      );

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "GET MERCHANT SANDBOX ORDER ERROR:",
      error,
    );

    respondWithError(
      res,
      error,
    );
  }
}
