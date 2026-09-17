import express from "express";

import {
  addReceipt,
  addReceiptTag,
  deleteReceipt,
  getReceiptById,
  getReceipts,
  toggleReceiptFavorite,
  updateReceipt,
} from "../controllers/receiptController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

const router =
  express.Router();

/* =========================================================
   COLLECTION
========================================================= */

router.get(
  "/",
  protect,
  getReceipts
);

router.post(
  "/",
  protect,
  addReceipt
);

/* =========================================================
   SINGLE RECEIPT
========================================================= */

router.get(
  "/:id",
  protect,
  getReceiptById
);

router.patch(
  "/:id",
  protect,
  updateReceipt
);

router.delete(
  "/:id",
  protect,
  deleteReceipt
);

/* =========================================================
   RECEIPT ACTIONS
========================================================= */

router.patch(
  "/:id/favorite",
  protect,
  toggleReceiptFavorite
);

router.post(
  "/:id/tags",
  protect,
  addReceiptTag
);

export default router;
