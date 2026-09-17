/* =========================================================
   PAYPAL PAYMENT ROUTES
========================================================= */

import {
  Router,
  type RequestHandler,
} from "express";

import {
  createMerchantPaymentController,
} from "../controllers/paypalPaymentController.js";

import {
  capturePayPalPayment,
} from "../controllers/paypalCaptureController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireMerchant,
} from "../middlewares/adminAuthorization.js";

/* =========================================================
   ROUTER
========================================================= */

const router = Router();

/* =========================================================
   CREATE PAYPAL PAYMENT HANDLER
   ---------------------------------------------------------
   The payment controller uses a custom MerchantRequest type.
   Express expects a standard RequestHandler.

   The adapter keeps the controller logic unchanged and
   forwards errors to Express's error middleware.
========================================================= */

const createPayPalPayment: RequestHandler = (
  req,
  res,
  next,
) => {
  createMerchantPaymentController(
    req as Parameters<
      typeof createMerchantPaymentController
    >[0],
    res,
  ).catch(next);
};

/* =========================================================
   CREATE PAYPAL PAYMENT
   ---------------------------------------------------------
   POST /api/v1/payments/paypal
========================================================= */

router.post(
  "/paypal",
  protect,
  requireMerchant,
  createPayPalPayment,
);

/* =========================================================
   PAYPAL RETURN / CAPTURE
   ---------------------------------------------------------
   GET /api/v1/payments/paypal/return?token=ORDER_ID
========================================================= */

router.get(
  "/paypal/return",
  capturePayPalPayment,
);

/* =========================================================
   PAYPAL CANCEL
   ---------------------------------------------------------
   GET /api/v1/payments/paypal/cancel
========================================================= */

router.get(
  "/paypal/cancel",
  (req, res) => {
    const token =
      typeof req.query.token === "string"
        ? req.query.token
        : undefined;

    return res.status(200).json({
      success: true,

      message:
        "PayPal payment was cancelled by the customer.",

      data: {
        provider: "paypal",

        providerPaymentId:
          token ?? null,

        status: "cancelled",
      },
    });
  },
);

/* =========================================================
   EXPORT
========================================================= */

export default router;