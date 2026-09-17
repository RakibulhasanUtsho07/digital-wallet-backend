import {
  Router,
} from "express";

import {
  protect,
} from "../../../middlewares/authMiddleware.js";

import {
  requireAnalyticsAccess,
} from "../../../middlewares/adminAuthorization.js";

import {
  securityReadLimiter,
} from "../../../middlewares/securityRateLimiters.js";

import {
  getAnalystOverviewController,
} from "../../../controllers/analystOverviewController.js";

import {
  getAnalystLivePulseController,
} from "../../../controllers/analystLivePulseController.js";

import {
  getAnalystPaymentAnalyticsController,
} from "../../../controllers/analystPaymentController.js";

import {
  getAnalystIntelligenceController,
} from "../../../controllers/analystIntelligenceController.js";

import {
  getAnalystConversionAnalyticsController,
} from "../../../controllers/analystConversionController.js";

import {
  getAnalystDisputeAnalyticsController,
} from "../../../controllers/analystDisputeController.js";

import {
  getAnalystMerchantAnalyticsController,
} from "../../../controllers/analystMerchantController.js";

import {
  getAnalystRefundAnalyticsController,
} from "../../../controllers/analystRefundController.js";

import {
  getAnalystRiskAnalyticsController,
} from "../../../controllers/analystRiskController.js";


import {
  getAnalystWalletAnalyticsController,
} from "../../../controllers/analystWalletController.js";


import {
  getAnalystRevenueAnalyticsController,
} from "../../../controllers/analystRevenueController.js";


import {
  getAnalystProviderAnalyticsController,
} from "../../../controllers/analystProviderController.js";


import {
  getAnalystTransactionAnalyticsController,
} from "../../../controllers/analystTransactionController.js";

import {
  getAnalystSettlementAnalyticsController,
} from "../../../controllers/analystSettlementController.js";

import {
  getAnalystPayoutAnalyticsController,
} from "../../../controllers/analystPayoutController.js";

import {
  getAnalystComplianceController,
} from "../../../controllers/analystComplianceController.js";

/* =========================================================
   USER ANALYTICS
========================================================= */

import {
  getAnalystUserAnalyticsController,
} from "../../../controllers/analystUserController.js";

/* =========================================================
   REPORTS
========================================================= */

import {
  createAnalystReportController,
  downloadAnalystReportController,
  getAnalystReportController,
  listAnalystExportsController,
  listAnalystReportsController,
} from "../../../controllers/analystReportController.js";

/* =========================================================
   SAVED VIEWS
========================================================= */

import {
  createAnalystSavedViewController,
  deleteAnalystSavedViewController,
  listAnalystSavedViewsController,
  updateAnalystSavedViewController,
} from "../../../controllers/analystSavedViewController.js";

/* =========================================================
   ROUTER
========================================================= */

const router =
  Router();

/* =========================================================
   SECURITY
========================================================= */

router.use(
  protect,
  requireAnalyticsAccess,
  securityReadLimiter
);

router.use(
  (
    _req,
    res,
    next
  ) => {
    res.setHeader(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    next();
  }
);

/* =========================================================
   COMMAND CENTER
========================================================= */

router.get(
  "/overview",
  getAnalystOverviewController
);

router.get(
  "/live-pulse",
  getAnalystLivePulseController
);

router.get(
  "/intelligence",
  getAnalystIntelligenceController
);

/* =========================================================
   PERFORMANCE
========================================================= */

router.get(
  "/payments",
  getAnalystPaymentAnalyticsController
);

router.get(
  "/conversion",
  getAnalystConversionAnalyticsController
);

router.get(
  "/revenue",
  getAnalystRevenueAnalyticsController
);

router.get(
  "/transactions",
  getAnalystTransactionAnalyticsController
);

/* =========================================================
   BUSINESS & PLATFORM
========================================================= */

router.get(
  "/merchants",
  getAnalystMerchantAnalyticsController
);

router.get(
  "/users",
  getAnalystUserAnalyticsController
);


router.get(
  "/merchants",
  getAnalystMerchantAnalyticsController
);

router.get(
  "/users",
  getAnalystUserAnalyticsController
);

router.get(
  "/wallets",
  getAnalystWalletAnalyticsController
);

router.get(
  "/providers",
  getAnalystProviderAnalyticsController
);
/* =========================================================
   RISK & OPERATIONS
========================================================= */

router.get(
  "/risk",
  getAnalystRiskAnalyticsController
);

router.get(
  "/refunds",
  getAnalystRefundAnalyticsController
);

router.get(
  "/disputes",
  getAnalystDisputeAnalyticsController
);

router.get(
  "/settlement",
  getAnalystSettlementAnalyticsController
);

router.get(
  "/payouts",
  getAnalystPayoutAnalyticsController
);

router.get(
  "/compliance",
  getAnalystComplianceController
);

/* =========================================================
   REPORTS
========================================================= */

router.post(
  "/reports",
  createAnalystReportController
);

router.get(
  "/reports",
  listAnalystReportsController
);

router.get(
  "/reports/:id",
  getAnalystReportController
);

router.get(
  "/reports/:id/download",
  downloadAnalystReportController
);

router.get(
  "/exports",
  listAnalystExportsController
);

/* =========================================================
   SAVED VIEWS
========================================================= */

router.get(
  "/saved-views",
  listAnalystSavedViewsController
);

router.post(
  "/saved-views",
  createAnalystSavedViewController
);

router.patch(
  "/saved-views/:id",
  updateAnalystSavedViewController
);

router.delete(
  "/saved-views/:id",
  deleteAnalystSavedViewController
);

export default router;