// src/routes/securityRoutes.ts

import express from "express";

import {
  getSecurityOverview,
  getSessions,
  revokeSession,
  logoutOtherSessions,
  getSecurityActivity,
  runSecurityCheck,
  getAlertPreferences,
  updateAlertPreferences,
  startTwoFactorSetup,
  verifyTwoFactorSetup,
  disableTwoFactor,
  updateTwoFactorMethod,
  regenerateBackupCodes,
  changePassword,
  freezeWallet,
  unfreezeWallet,
} from "../controllers/securityController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  securityReadLimiter,
  securitySensitiveLimiter,
  twoFactorVerifyLimiter,
} from "../middlewares/securityRateLimiters.js";

const router = express.Router();

/* =========================================================
   SECURITY OVERVIEW
========================================================= */

router.get(
  "/overview",
  protect,
  securityReadLimiter,
  getSecurityOverview
);

/* =========================================================
   SESSIONS
========================================================= */

router.get(
  "/sessions",
  protect,
  securityReadLimiter,
  getSessions
);

router.delete(
  "/sessions/others",
  protect,
  securitySensitiveLimiter,
  logoutOtherSessions
);

router.delete(
  "/sessions/:sessionId",
  protect,
  securitySensitiveLimiter,
  revokeSession
);

/* =========================================================
   ACTIVITY
========================================================= */

router.get(
  "/activity",
  protect,
  securityReadLimiter,
  getSecurityActivity
);

/* =========================================================
   SECURITY CHECK
========================================================= */

router.post(
  "/check",
  protect,
  securitySensitiveLimiter,
  runSecurityCheck
);

/* =========================================================
   ALERTS
========================================================= */

router.get(
  "/alerts",
  protect,
  securityReadLimiter,
  getAlertPreferences
);

router.patch(
  "/alerts",
  protect,
  securitySensitiveLimiter,
  updateAlertPreferences
);

/* =========================================================
   2FA
========================================================= */

router.post(
  "/2fa/setup/start",
  protect,
  securitySensitiveLimiter,
  startTwoFactorSetup
);

router.post(
  "/2fa/setup/verify",
  protect,
  twoFactorVerifyLimiter,
  verifyTwoFactorSetup
);

router.post(
  "/2fa/disable",
  protect,
  securitySensitiveLimiter,
  disableTwoFactor
);

router.patch(
  "/2fa/method",
  protect,
  securitySensitiveLimiter,
  updateTwoFactorMethod
);

router.post(
  "/2fa/backup-codes",
  protect,
  securitySensitiveLimiter,
  regenerateBackupCodes
);

/* =========================================================
   PASSWORD
========================================================= */

router.post(
  "/password",
  protect,
  securitySensitiveLimiter,
  changePassword
);

/* =========================================================
   WALLET SECURITY
========================================================= */

router.post(
  "/wallet/freeze",
  protect,
  securitySensitiveLimiter,
  freezeWallet
);

router.post(
  "/wallet/unfreeze",
  protect,
  securitySensitiveLimiter,
  unfreezeWallet
);

export default router;