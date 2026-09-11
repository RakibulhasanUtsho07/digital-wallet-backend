"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
/* =========================================================
   AUTH CONTROLLERS
========================================================= */
const authController_js_1 = require("../controllers/authController.js");
/* =========================================================
   AUTH MIDDLEWARE
========================================================= */
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
/* =========================================================
   SECURITY RATE LIMITERS
========================================================= */
const securityRateLimiters_js_1 = require("../middlewares/securityRateLimiters.js");
/* =========================================================
   PLATFORM POLICY
========================================================= */
const platformPolicyMiddleware_js_1 = require("../middlewares/platformPolicyMiddleware.js");
/* =========================================================
   PROFILE IMAGE UPLOAD
========================================================= */
const profileImageUploadMiddleware_js_1 = require("../middlewares/profileImageUploadMiddleware.js");
/* =========================================================
   ROUTER
========================================================= */
const router = express_1.default.Router();
/* =========================================================
   REGISTER
   POST /api/auth/register

   Flow:
   1. Check whether signups are open
   2. Upload profile image
   3. Validate/register pending account
   4. Send email verification OTP
========================================================= */
router.post("/register", platformPolicyMiddleware_js_1.requireSignupsOpen, profileImageUploadMiddleware_js_1.profileImageUpload, authController_js_1.registerUser);
/* =========================================================
   LOGIN
   POST /api/auth/login

   Rate limited to protect against brute-force attempts.
========================================================= */
router.post("/login", securityRateLimiters_js_1.loginLimiter, authController_js_1.loginUser);
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
router.post("/verify-otp", securityRateLimiters_js_1.twoFactorVerifyLimiter, authController_js_1.verifyEmailOtp);
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
router.post("/resend-otp", securityRateLimiters_js_1.twoFactorVerifyLimiter, authController_js_1.resendEmailOtp);
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
router.post("/verify-2fa", securityRateLimiters_js_1.twoFactorVerifyLimiter, authController_js_1.verifyLoginTwoFactor);
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
router.get("/sessions", authMiddleware_js_1.protect, authController_js_1.getActiveSessions);
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
router.delete("/sessions/others", authMiddleware_js_1.protect, authController_js_1.logoutOtherSessions);
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
router.delete("/sessions/:sessionId", authMiddleware_js_1.protect, authController_js_1.logoutSession);
/* =========================================================
   LOGOUT CURRENT DEVICE
   POST /api/auth/logout
========================================================= */
/*
 * Revokes the current session and clears the auth cookie.
 */
router.post("/logout", authController_js_1.logoutUser);
/* =========================================================
   FORGOT PASSWORD
   POST /api/auth/forgot-password
========================================================= */
router.post("/forgot-password", authController_js_1.forgotPassword);
/* =========================================================
   RESET PASSWORD
   POST /api/auth/reset-password
========================================================= */
/*
 * Resetting the password revokes all previous sessions
 * and creates a fresh authenticated session.
 */
router.post("/reset-password", authController_js_1.resetPassword);
/* =========================================================
   EXPORT
========================================================= */
exports.default = router;
