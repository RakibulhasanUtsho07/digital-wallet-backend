import express from "express";

import {
  getAdminOverview,
  getAllUsers,
  getAllTransactions,
  getPendingKYCs,
  getKYCDocuments,
  reviewKYC,
} from "../controllers/adminController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

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
   ALL TRANSACTIONS
   GET /api/admin/transactions
========================================================= */

router.get(
  "/transactions",
  protect,
  adminOnly,
  getAllTransactions
);

/* =========================================================
   KYC
========================================================= */

router.get(
  "/kyc/pending",
  protect,
  adminOnly,
  getPendingKYCs
);

router.get(
  "/kyc/:id/documents",
  protect,
  adminOnly,
  getKYCDocuments
);

router.patch(
  "/kyc/:id/review",
  protect,
  adminOnly,
  reviewKYC
);

export default router;
