import express from "express";

import {
  sendMoney,
  validateRecipient,
} from "../controllers/transferController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireVerifiedKYC,
} from "../middlewares/kycMiddleware.js";

const router = express.Router();

/* =========================================================
   VALIDATE RECIPIENT
   POST /api/transfers/validate-recipient

   Authentication + verified KYC required.

   We also protect this endpoint because it can reveal
   recipient information and is part of the transfer flow.
========================================================= */

router.post(
  "/validate-recipient",
  protect,
  requireVerifiedKYC,
  validateRecipient
);

/* =========================================================
   SEND MONEY
   POST /api/transfers

   Authentication + verified KYC required.
========================================================= */

router.post(
  "/",
  protect,
  requireVerifiedKYC,
  sendMoney
);

export default router;