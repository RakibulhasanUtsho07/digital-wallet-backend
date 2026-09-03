import express from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireAdmin,
} from "../middlewares/adminAuthorization.js";

import {
  kycAIReadLimiter,
  kycAIRunLimiter,
} from "../middlewares/kycAIRateLimiters.js";

import {
  getAdminKycOverviewController,
} from "../controllers/kycOverviewController.js";

import {
  getKycAiReviewController,
  runKycAiReviewController,
} from "../controllers/kycAIReviewController.js";

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
  "/overview",
  kycAIReadLimiter,
  getAdminKycOverviewController
);

router.get(
  "/:id/ai-review",
  kycAIReadLimiter,
  getKycAiReviewController
);

router.post(
  "/:id/ai-review",
  kycAIRunLimiter,
  runKycAiReviewController
);

export default router;
