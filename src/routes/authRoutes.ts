import express from "express";

import {
  registerUser,
  loginUser,
  verifyLoginTwoFactor,
  logoutUser,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";

import {
  loginLimiter,
  twoFactorVerifyLimiter,
} from "../middlewares/securityRateLimiters.js";

/*
 * Uses your existing Platform Settings signup policy middleware.
 */
import {
  requireSignupsOpen,
} from "../middlewares/platformPolicyMiddleware.js";

const router =
  express.Router();

router.post(
  "/register",
  requireSignupsOpen,
  registerUser
);

router.post(
  "/login",
  loginLimiter,
  loginUser
);

router.post(
  "/verify-2fa",
  twoFactorVerifyLimiter,
  verifyLoginTwoFactor
);

router.post(
  "/logout",
  logoutUser
);

router.post(
  "/forgot-password",
  forgotPassword
);

router.post(
  "/reset-password",
  resetPassword
);

export default router;
