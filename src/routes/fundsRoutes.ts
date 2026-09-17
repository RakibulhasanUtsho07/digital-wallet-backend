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

const router = express.Router();

/* =========================================================
   DEPOSIT FUNDS
   POST /api/funds/deposit

   Authentication required.
   KYC is not required for deposit for now.
========================================================= */

router.post(
  "/deposit",
  protect,
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
  withdrawFunds
);

export default router;