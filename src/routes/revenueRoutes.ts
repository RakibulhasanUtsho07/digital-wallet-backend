import express from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireAdmin,
} from "../middlewares/adminAuthorization.js";

import {
  getContributors,
  getLeakage,
  getRevenueFeePolicy,
  investigateLeakage,
  simulateRevenue,
} from "../controllers/revenueController.js";

import {
  revenueReadLimiter,
  revenueSimulationLimiter,
  revenueWriteLimiter,
} from "../middlewares/revenueRateLimiters.js";

const router =
  express.Router();

router.use(
  protect,
  requireAdmin
);

router.use(
  (
    _req,
    res,
    next
  ) => {
    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    next();
  }
);

router.get(
  "/fee-policy",
  revenueReadLimiter,
  getRevenueFeePolicy
);

router.post(
  "/simulate",
  revenueSimulationLimiter,
  simulateRevenue
);

router.get(
  "/leakage",
  revenueReadLimiter,
  getLeakage
);

router.get(
  "/contributors",
  revenueReadLimiter,
  getContributors
);

router.post(
  "/leakage/investigate",
  revenueWriteLimiter,
  investigateLeakage
);

export default router;
