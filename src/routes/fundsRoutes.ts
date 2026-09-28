import express from "express";

import {
  depositFunds,
  withdrawFunds,
} from "../controllers/fundsController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireVerifiedKYC,
} from "../middlewares/kycMiddleware.js";
import {
  requireWalletNotFrozen,
} from "../middlewares/walletSecurityMiddleware.js";

const router = express.Router();

/* =========================================================
   DEPOSIT FUNDS
   POST /api/funds/deposit

   Authentication required.
   Verified e-KYC is required before the wallet can be credited.
========================================================= */

router.post(
  "/deposit",
  protect,
  requireVerifiedKYC,
  requireWalletNotFrozen,
  depositFunds
);

/* =========================================================
   WITHDRAW FUNDS
   POST /api/funds/withdraw

   Authentication + verified KYC required.
========================================================= */

router.post(
  "/withdraw",
  protect,
  requireVerifiedKYC,
  requireWalletNotFrozen,
  withdrawFunds
);

export default router;
