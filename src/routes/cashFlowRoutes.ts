import express from "express";

import {
  createCashFlowPlan,
  deleteCashFlowPlan,
  getCashFlowPlans,
} from "../controllers/cashFlowController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

const router =
  express.Router();

router.get(
  "/plans",
  protect,
  getCashFlowPlans
);

router.post(
  "/plans",
  protect,
  createCashFlowPlan
);

router.delete(
  "/plans/:id",
  protect,
  deleteCashFlowPlan
);

export default router;
