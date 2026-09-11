"use strict";
// src/routes/securityRoutes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const securityController_js_1 = require("../controllers/securityController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const securityRateLimiters_js_1 = require("../middlewares/securityRateLimiters.js");
const router = express_1.default.Router();
/* =========================================================
   SECURITY OVERVIEW
========================================================= */
router.get("/overview", authMiddleware_js_1.protect, securityRateLimiters_js_1.securityReadLimiter, securityController_js_1.getSecurityOverview);
/* =========================================================
   SESSIONS
========================================================= */
router.get("/sessions", authMiddleware_js_1.protect, securityRateLimiters_js_1.securityReadLimiter, securityController_js_1.getSessions);
router.delete("/sessions/others", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.logoutOtherSessions);
router.delete("/sessions/:sessionId", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.revokeSession);
/* =========================================================
   ACTIVITY
========================================================= */
router.get("/activity", authMiddleware_js_1.protect, securityRateLimiters_js_1.securityReadLimiter, securityController_js_1.getSecurityActivity);
/* =========================================================
   SECURITY CHECK
========================================================= */
router.post("/check", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.runSecurityCheck);
/* =========================================================
   ALERTS
========================================================= */
router.get("/alerts", authMiddleware_js_1.protect, securityRateLimiters_js_1.securityReadLimiter, securityController_js_1.getAlertPreferences);
router.patch("/alerts", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.updateAlertPreferences);
/* =========================================================
   2FA
========================================================= */
router.post("/2fa/setup/start", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.startTwoFactorSetup);
router.post("/2fa/setup/verify", authMiddleware_js_1.protect, securityRateLimiters_js_1.twoFactorVerifyLimiter, securityController_js_1.verifyTwoFactorSetup);
router.post("/2fa/disable", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.disableTwoFactor);
router.patch("/2fa/method", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.updateTwoFactorMethod);
router.post("/2fa/backup-codes", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.regenerateBackupCodes);
/* =========================================================
   PASSWORD
========================================================= */
router.post("/password", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.changePassword);
/* =========================================================
   WALLET SECURITY
========================================================= */
router.post("/wallet/freeze", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.freezeWallet);
router.post("/wallet/unfreeze", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, securityController_js_1.unfreezeWallet);
exports.default = router;
