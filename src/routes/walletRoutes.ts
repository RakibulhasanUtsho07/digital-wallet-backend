import express from "express";

import {
  getMyWallet,
  initiateWalletAddMoney,
  confirmWalletAddMoney,
  getAddMoneyHistory,
  getAddMoneyTransaction,
} from "../controllers/walletController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  securityReadLimiter,
  securitySensitiveLimiter,
} from "../middlewares/securityRateLimiters.js";

const router =
  express.Router();

/* =========================================================
   WALLET
========================================================= */

router.get(
  "/",
  protect,
  getMyWallet
);

/* =========================================================
   ADD MONEY
========================================================= */

/*
 * Start Bank/MFS payment
 */
router.post(
  "/add-money/initiate",
  protect,
  securitySensitiveLimiter,
  initiateWalletAddMoney
);

/*
 * Verify demo/live payment
 * and credit wallet.
 */
router.post(
  "/add-money/confirm",
  protect,
  securitySensitiveLimiter,
  confirmWalletAddMoney
);

/*
 * Add Money history.
 */
router.get(
  "/add-money/history",
  protect,
  securityReadLimiter,
  getAddMoneyHistory
);

/*
 * One transaction.
 */
router.get(
  "/add-money/:transactionId",
  protect,
  securityReadLimiter,
  getAddMoneyTransaction
);

export default router;