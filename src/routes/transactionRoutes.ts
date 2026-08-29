import express from "express";

import {
  getMyTransactions,
  getTransactionById,
} from "../controllers/transactionController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

const router =
  express.Router();

/* =========================================================
   MY TRANSACTIONS
   GET /api/transactions
========================================================= */

router.get(
  "/",
  protect,
  getMyTransactions
);

/* =========================================================
   TRANSACTION / RECEIPT DETAILS
   GET /api/transactions/:id

   Ownership is enforced by the controller.
========================================================= */

router.get(
  "/:id",
  protect,
  getTransactionById
);

export default router;
