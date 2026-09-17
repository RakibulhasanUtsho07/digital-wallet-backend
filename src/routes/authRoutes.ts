import express from "express";

/* =========================================================
   AUTH CONTROLLERS
========================================================= */

import {
  registerUser,
  loginUser,
  verifyLoginTwoFactor,
  verifyEmailOtp,
  resendEmailOtp,
  logoutUser,
  forgotPassword,
  resetPassword,

  /* Active sessions */
  getActiveSessions,
  logoutSession,
  logoutOtherSessions,
} from "../controllers/authController.js";

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

import {
  protect,
} from "../middlewares/authMiddleware.js";

/* =========================================================
   SECURITY RATE LIMITERS
========================================================= */

import {
  loginLimiter,
  twoFactorVerifyLimiter,
} from "../middlewares/securityRateLimiters.js";

/* =========================================================
   PLATFORM POLICY
========================================================= */

import {
  requireSignupsOpen,
} from "../middlewares/platformPolicyMiddleware.js";

/* =========================================================
   PROFILE IMAGE UPLOAD
========================================================= */

import {
  profileImageUpload,
} from "../middlewares/profileImageUploadMiddleware.js";

/* =========================================================
   ROUTER
========================================================= */

const router =
  express.Router();

/* =========================================================
   REGISTER
   POST /api/auth/register

   Flow:
   1. Check whether signups are open
   2. Upload profile image
   3. Validate/register pending account
   4. Send email verification OTP
========================================================= */

router.post(
  "/register",
  requireSignupsOpen,
  profileImageUpload,
  registerUser
);

/* =========================================================
   LOGIN
   POST /api/auth/login

   Rate limited to protect against brute-force attempts.
========================================================= */

router.post(
  "/login",
  loginLimiter,
  loginUser
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
  verifyEmailOtp
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
  resendEmailOtp
);

/* =========================================================
   LOGIN TWO-FACTOR AUTHENTICATION
========================================================= */

/*
 * POST /api/auth/verify-2fa
 *
 * Used after login when 2FA is enabled.
 *
 * Body:
 * {
 *   "challengeId": "...",
 *   "code": "123456"
 * }
 */

router.post(
  "/verify-2fa",
  twoFactorVerifyLimiter,
  verifyLoginTwoFactor
);

/* =========================================================
   ACTIVE AUTHENTICATED SESSIONS
   /api/auth/sessions
========================================================= */

/*
 * IMPORTANT:
 *
 * These routes are protected by `protect`.
 *
 * The user can only:
 * - See their own sessions
 * - Logout their own sessions
 * - Logout other devices belonging to their account
 */

/* =========================================================
   GET ACTIVE SESSIONS
   GET /api/auth/sessions
========================================================= */

/*
 * Returns:
 * - device
 * - browser
 * - operating system
 * - location
 * - masked IP
 * - last active time
 * - expiration
 * - created time
 * - current-session indicator
 */

router.get(
  "/sessions",
  protect,
  getActiveSessions
);

/* =========================================================
   LOGOUT ALL OTHER DEVICES
   DELETE /api/auth/sessions/others
========================================================= */

/*
 * Keeps the CURRENT browser/session active.
 *
 * Logs out every other active session.
 *
 * IMPORTANT:
 * This route MUST appear before:
 *
 * /sessions/:sessionId
 *
 * Otherwise "others" could be interpreted as a
 * dynamic sessionId.
 */

router.delete(
  "/sessions/others",
  protect,
  logoutOtherSessions
);

/* =========================================================
   LOGOUT ONE SPECIFIC DEVICE
   DELETE /api/auth/sessions/:sessionId
========================================================= */

/*
 * The current session cannot be revoked using this route.
 *
 * For the current browser use:
 *
 * POST /api/auth/logout
 */

router.delete(
  "/sessions/:sessionId",
  protect,
  logoutSession
);

/* =========================================================
   LOGOUT CURRENT DEVICE
   POST /api/auth/logout
========================================================= */

/*
 * Revokes the current session and clears the auth cookie.
 */

router.post(
  "/logout",
  logoutUser
);

/* =========================================================
   FORGOT PASSWORD
   POST /api/auth/forgot-password
========================================================= */

router.post(
  "/forgot-password",
  forgotPassword
);

/* =========================================================
   RESET PASSWORD
   POST /api/auth/reset-password
========================================================= */

/*
 * Resetting the password revokes all previous sessions
 * and creates a fresh authenticated session.
 */

router.post(
  "/reset-password",
  resetPassword
);

/* =========================================================
   EXPORT
========================================================= */

export default router;