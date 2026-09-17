import express from "express";
import {
  createPasskeyRegistrationOptions,
  createPaymentAuthenticationOptions,
  listPasskeys,
  revokePasskey,
  verifyPasskeyRegistration,
  verifyPaymentAuthentication,
} from "../controllers/passkeyController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { requireVerifiedKYC } from "../middlewares/kycMiddleware.js";
import {
  securityReadLimiter,
  securitySensitiveLimiter,
} from "../middlewares/securityRateLimiters.js";

const router = express.Router();

router.use(protect, requireVerifiedKYC);
router.get("/", securityReadLimiter, listPasskeys);
router.post("/registration/options", securitySensitiveLimiter, createPasskeyRegistrationOptions);
router.post("/registration/verify", securitySensitiveLimiter, verifyPasskeyRegistration);
router.post("/payment/options", securitySensitiveLimiter, createPaymentAuthenticationOptions);
router.post("/payment/verify", securitySensitiveLimiter, verifyPaymentAuthentication);
router.delete("/:id", securitySensitiveLimiter, revokePasskey);

export default router;
