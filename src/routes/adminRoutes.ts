import express from "express";

import {
  getAdminOverview,
  getAllUsers,
  getPendingKYCs,
  getKYCDocuments,
  reviewKYC,
} from "../controllers/adminController.js";

import {
  getAllAdminTransactions,
} from "../controllers/adminTransactionController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  adminOnly,
} from "../middlewares/adminMiddleware.js";

const router = express.Router();

/* =========================================================
   ADMIN OVERVIEW

   GET /api/admin/overview?period=30d
========================================================= */

router.get(
  "/overview",
  protect,
  adminOnly,
  getAdminOverview
);

/* =========================================================
   USERS

   GET /api/admin/users
========================================================= */

router.get(
  "/users",
  protect,
  adminOnly,
  getAllUsers
);

/* =========================================================
   ALL TRANSACTIONS / UNIFIED LEDGER

   GET /api/admin/transactions

   Includes:
   - Wallet transfers
   - Add money
   - Merchant payments
   - Merchant refunds
   - Withdrawals
========================================================= */

router.get(
  "/transactions",
  protect,
  adminOnly,
  getAllAdminTransactions
);

/* =========================================================
   KYC - PENDING REQUESTS

   GET /api/admin/kyc/pending
========================================================= */

router.get(
  "/kyc/pending",
  protect,
  adminOnly,
  getPendingKYCs
);

/* =========================================================
   KYC - DOCUMENTS

   GET /api/admin/kyc/:id/documents
========================================================= */

router.get(
  "/kyc/:id/documents",
  protect,
  adminOnly,
  getKYCDocuments
);

/* =========================================================
   KYC - REVIEW

   PATCH /api/admin/kyc/:id/review
========================================================= */

router.patch(
  "/kyc/:id/review",
  protect,
  adminOnly,
  reviewKYC
);

/* =========================================================
   EXPORT
========================================================= */

export default router;