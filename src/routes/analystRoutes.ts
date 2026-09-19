import {
  Router,
} from "express";
import { protect } from "../middlewares/authMiddleware";
import { requireAnalyticsAccess } from "../middlewares/adminAuthorization";
import { analyticsExportLimiter, analyticsReadLimiter, analyticsReportLimiter } from "../middlewares/analyticsRateLimiters";
import { getAnalystOverviewController } from "../controllers/analystOverviewController";
import { getAnalystLivePulseController } from "../controllers/analystLivePulseController";
import { getAnalystIntelligenceController } from "../controllers/analystIntelligenceController";
import { getAnalystPaymentAnalyticsController } from "../controllers/analystPaymentController";
import { getAnalystConversionAnalyticsController } from "../controllers/analystConversionController";
import { getAnalystRevenueAnalyticsController } from "../controllers/analystRevenueController";
import { getAnalystTransactionAnalyticsController } from "../controllers/analystTransactionController";
import { getAnalystMerchantAnalyticsController } from "../controllers/analystMerchantController";
import { getAnalystUserAnalyticsController } from "../controllers/analystUserController";
import { getAnalystWalletAnalyticsController } from "../controllers/analystWalletController";
import { getAnalystProviderAnalyticsController } from "../controllers/analystProviderController";
import { getAnalystRiskAnalyticsController } from "../controllers/analystRiskController";
import { getAnalystRefundAnalyticsController } from "../controllers/analystRefundController";
import { getAnalystDisputeAnalyticsController } from "../controllers/analystDisputeController";
import { getAnalystSettlementAnalyticsController } from "../controllers/analystSettlementController";
import { getAnalystPayoutAnalyticsController } from "../controllers/analystPayoutController";
import { getAnalystComplianceController } from "../controllers/analystComplianceController";
import { createAnalystReportController, downloadAnalystReportController, getAnalystReportController, listAnalystExportsController, listAnalystReportsController } from "../controllers/analystReportController";
import { createAnalystSavedViewController, deleteAnalystSavedViewController, listAnalystSavedViewsController, updateAnalystSavedViewController } from "../controllers/analystSavedViewController";



/* =========================================================
   REPORTS
========================================================= */



/* =========================================================
   SAVED VIEWS
========================================================= */


const router = Router();

/* =========================================================
   SECURITY
========================================================= */

router.use(
  protect,
  requireAnalyticsAccess,
  analyticsReadLimiter
);

/* =========================================================
   PRIVATE ANALYTICS RESPONSES
========================================================= */

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
  analyticsReportLimiter,
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
  analyticsExportLimiter,
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