import express from "express";

import {
  sendMoney,
  validateRecipient,
} from "../controllers/transferController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

const router =
  express.Router();

/* =========================================================
   VALIDATE RECIPIENT

   POST /api/transfers/validate-recipient
========================================================= */

router.post(
  "/validate-recipient",
  protect,
  validateRecipient
);

/* =========================================================
   SEND MONEY

   POST /api/transfers
========================================================= */

router.post(
  "/",
  protect,
  sendMoney
);

export default router;