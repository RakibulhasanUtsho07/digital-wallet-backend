import express from "express";

import {
  getKYCStatus,
  startKYC,
  submitKYC,
} from "../controllers/kycController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get(
  "/status",
  protect,
  getKYCStatus
);

router.post(
  "/start",
  protect,
  startKYC
);

router.put(
  "/submit",
  protect,
  submitKYC
);

export default router;