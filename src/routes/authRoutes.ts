import express from "express";

import {
  registerUser,
  loginUser,
  verifyLoginTwoFactor,
  verifyEmailOtp,
  resendEmailOtp,
  logoutUser,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";

import {
  loginLimiter,
  twoFactorVerifyLimiter,
} from "../middlewares/securityRateLimiters.js";

import {
  requireSignupsOpen,
} from "../middlewares/platformPolicyMiddleware.js";

import {
  profileImageUpload,
} from "../middlewares/profileImageUploadMiddleware.js";

const router = express.Router();

/* =========================================================
   REGISTER
   POST /api/auth/register

   Flow:
   1. Signup policy check
   2. Profile image upload
   3. Create account
   4. Send email verification OTP
========================================================= */

router.post(
  "/register",
  requireSignupsOpen,
  profileImageUpload,
  registerUser,
);

/* =========================================================
   LOGIN
   POST /api/auth/login
========================================================= */

router.post(
  "/login",
  loginLimiter,
  loginUser,
);

/* =========================================================
   EMAIL VERIFICATION
========================================================= */

/*
 * Verify registration email OTP
 *
 * POST /api/auth/verify-otp
 *
 * Body:
 * {
 *   "email": "user@example.com",
 *   "otp": "123456"
 * }
 */

router.post(
  "/verify-otp",
  twoFactorVerifyLimiter,
  verifyEmailOtp,
);

/*
 * Resend registration email OTP
 *
 * POST /api/auth/resend-otp
 *
 * Body:
 * {
 *   "email": "user@example.com"
 * }
 */

router.post(
  "/resend-otp",
  twoFactorVerifyLimiter,
  resendEmailOtp,
);

/* =========================================================
   LOGIN TWO-FACTOR AUTHENTICATION
========================================================= */

/*
 * POST /api/auth/verify-2fa
 *
 * This is for login 2FA.
 * Keep this separate from registration email verification.
 */

router.post(
  "/verify-2fa",
  twoFactorVerifyLimiter,
  verifyLoginTwoFactor,
);

/* =========================================================
   LOGOUT
   POST /api/auth/logout
========================================================= */

router.post(
  "/logout",
  logoutUser,
);

/* =========================================================
   FORGOT PASSWORD
   POST /api/auth/forgot-password
========================================================= */

router.post(
  "/forgot-password",
  forgotPassword,
);

/* =========================================================
   RESET PASSWORD
   POST /api/auth/reset-password
========================================================= */

router.post(
  "/reset-password",
  resetPassword,
);

export default router;