import express from "express";
import { sendMoney, validateRecipient } from "../controllers/transferController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { requireVerifiedKYC } from "../middlewares/kycMiddleware.js";
import { requireTransferAuthorization } from "../middlewares/transferAuthorizationMiddleware.js";
import { requireWalletNotFrozen } from "../middlewares/walletSecurityMiddleware.js";
import {
  securityReadLimiter,
  securitySensitiveLimiter,
} from "../middlewares/securityRateLimiters.js";

const router = express.Router();

router.post(
  "/validate-recipient",
  protect,
  requireVerifiedKYC,
  securityReadLimiter,
  validateRecipient
);

router.post(
  "/",
  protect,
  requireVerifiedKYC,
  requireWalletNotFrozen,
  securitySensitiveLimiter,
  requireTransferAuthorization,
  sendMoney
);

export default router;
