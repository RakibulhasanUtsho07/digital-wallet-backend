import {
  Router,
} from "express";

import {
  merchantApiAuth,
} from "../middlewares/merchantAuth.js";

import {
  securityReadLimiter,
  securitySensitiveLimiter,
} from "../middlewares/securityRateLimiters.js";

import {
  authenticateCheckoutCustomerController,
  confirmMerchantWalletPaymentController,
  createMerchantPaymentController,
  getCustomerCheckoutPaymentController,
  getMerchantPaymentController,
  verifyCheckoutOtpController,
} from "../controllers/merchantPaymentController.js";

/* =========================================================
   ROUTER
========================================================= */

const router =
  Router();

/* =========================================================
   CREATE MERCHANT PAYMENT

   POST /api/v1/payments

   Authentication:
   - Merchant secret API key

   Scope:
   - payments:write

   TEST:
   - sk_test_...

   LIVE:
   - sk_live_...
========================================================= */

router.post(
  "/",

  merchantApiAuth(
    "payments:write"
  ),

  createMerchantPaymentController
);

/* =========================================================
   PUBLIC HOSTED CHECKOUT

   GET /api/v1/payments/:paymentId/checkout

   IMPORTANT:
   - Public safe checkout endpoint
   - NO normal Coffer login required
   - NO access_token required
   - NO protect middleware
   - NO KYC middleware here

   This endpoint only returns safe checkout information:
   - amount
   - currency
   - merchant
   - mode
   - payment status
   - merchant reference
   - test sandbox info when mode=test

   Customer identity is verified later through:
   password + OTP.
========================================================= */

router.get(
  "/:paymentId/checkout",

  securityReadLimiter,

  getCustomerCheckoutPaymentController
);

/* =========================================================
   CHECKOUT AUTHENTICATION

   POST
   /api/v1/payments/:paymentId/checkout/authenticate

   Customer provides:
   - Email OR phone
   - Password

   LIVE:
   - Real Coffer user lookup
   - Password hash verification
   - KYC validation
   - Real OTP delivery

   TEST:
   - Sandbox credentials
   - Sandbox OTP

   NO normal login session required.
========================================================= */

router.post(
  "/:paymentId/checkout/authenticate",

  securitySensitiveLimiter,

  authenticateCheckoutCustomerController
);

/* =========================================================
   VERIFY CHECKOUT OTP

   POST
   /api/v1/payments/:paymentId/checkout/verify-otp

   Customer provides:
   - challengeId
   - OTP

   Success:
   - Returns short-lived checkout token

   This token is bound to:
   - paymentId
   - payment mode
   - verified customer for live mode
   - checkout purpose
========================================================= */

router.post(
  "/:paymentId/checkout/verify-otp",

  securitySensitiveLimiter,

  verifyCheckoutOtpController
);

/* =========================================================
   CONFIRM PAYMENT

   POST /api/v1/payments/:paymentId/confirm

   Required header:

   X-Checkout-Token: <short-lived-token>

   IMPORTANT:
   - NO normal login cookie required
   - NO protect middleware
   - NO mandatory passkey
   - NO requireVerifiedKYC middleware

   LIVE:
   - Checkout token identifies verified Coffer customer
   - KYC is re-checked server-side
   - Real wallet is debited

   TEST:
   - Dedicated sandbox payment service
   - Real wallet MUST NOT be touched
========================================================= */

router.post(
  "/:paymentId/confirm",

  securitySensitiveLimiter,

  confirmMerchantWalletPaymentController
);

/* =========================================================
   GET PAYMENT FOR MERCHANT

   GET /api/v1/payments/:paymentId

   Authentication:
   - Merchant secret API key

   Scope:
   - payments:read

   NOTE:
   This route must remain AFTER the more specific
   /checkout routes for readability and route clarity.
========================================================= */

router.get(
  "/:paymentId",

  merchantApiAuth(
    "payments:read"
  ),

  getMerchantPaymentController
);

/* =========================================================
   EXPORT
========================================================= */

export default router;