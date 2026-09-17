import express from "express";

import {
  getFinancialInsights,
} from "../controllers/insightsController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get(
  "/",
  protect,
  getFinancialInsights
);

export default router;
