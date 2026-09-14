/* =========================================================
   SUPPORT ROUTES
========================================================= */

import {
  Router,
} from "express";

import {
  getSupportOverviewController,
  getSupportTicketsController,
  getSupportTicketController,
  createSupportTicketController,
  updateSupportTicketController,
  addSupportReplyController,
  addSupportNoteController,
  escalateSupportTicketController,
  resolveSupportTicketController,
  exportSupportTicketsController,
  getSupportAdminsController,
} from "../controllers/supportController.js";
import {
  getSupportEscalationsController,
  getSupportEscalationDetailController,
} from "../controllers/supportEscalationController.js";



import {
  getSupportSlaController,
  getSupportSlaSummaryController,
} from "../controllers/supportSlaController.js";



import {
  getSupportSavedRepliesController,
  getSupportSavedReplyController,
  createSupportSavedReplyController,
} from "../controllers/supportSavedReplyController.js";


import {
  searchSupportTransactionsController,
  getSupportTransactionDetailController,
} from "../controllers/supportTransactionController.js";


import {
  getSupportKnowledgeBaseController,
  getSupportKnowledgeBaseArticleController,
  createSupportKnowledgeBaseArticleController,
} from "../controllers/supportKnowledgeBaseController.js";

import {
  requireAdminOrSuperAdmin,
} from "../middlewares/authMiddleware.js";



import {
  analyzeSupportTicketController,
} from "../controllers/supportAiController.js";
import {
  searchSupportCustomersController,
  getSupportCustomerProfileController,
} from "../controllers/supportCustomerController.js";
import {
  protect,
  requireSupport,
  requireSupportOrAdmin,
} from "../middlewares/authMiddleware.js";
import {
  getSupportConversationsController,
  getSupportConversationController,
} from "../controllers/supportConversationController.js";
import {
  supportReadLimiter,
  supportWriteLimiter,
  supportCreateLimiter,
} from "../middlewares/supportRateLimiters.js";

import {
  getSupportRefundRequestsController,
} from "../controllers/supportRefundController.js";

import {
  getSupportKycCasesController,
} from "../controllers/supportKycCaseController.js";

import {
  searchSupportPaymentsController,
  getSupportPaymentDetailController,
} from "../controllers/supportPaymentController.js";


import {
  getSupportDisputeCasesController,
} from "../controllers/supportDisputeCaseController.js";


import {
  getSupportActivityController,
} from "../controllers/supportActivityController.js";

import {
  getSupportAccountIssuesController,
} from "../controllers/supportAccountIssueController.js";


import {
  getSupportAnalyticsController,
} from "../controllers/supportAnalyticsController.js";


/* =========================================================
   ROUTER
========================================================= */

const router = Router();

/* =========================================================
   AUTHENTICATION
---------------------------------------------------------
All Support APIs require authentication.

Role authorization is applied per endpoint below so that:
- Support Agent can perform Support operations.
- Admin/Super Admin can access shared/admin Support operations.
========================================================= */

router.use(
  protect
);

/* =========================================================
   NO CACHE
========================================================= */

router.use(
  (req, res, next) => {
    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    next();
  }
);

/* =========================================================
   OVERVIEW
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/overview",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportOverviewController
);

/* =========================================================
   SUPPORT ADMINS / OWNERS
---------------------------------------------------------
Used for:
- ticket assignment
- support staff lookup
- admin-side support management

Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/admins",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportAdminsController
);

/* =========================================================
   EXPORT
---------------------------------------------------------
Exporting Support operational data is treated as an
elevated/shared operation.

Admin + Super Admin
========================================================= */

router.get(
  "/export",
  requireSupportOrAdmin,
  supportReadLimiter,
  exportSupportTicketsController
);
/* =========================================================
   CUSTOMER / MERCHANT SEARCH
========================================================= */

router.get(
  "/customers",
  requireSupportOrAdmin,
  supportReadLimiter,
  searchSupportCustomersController
);

/* =========================================================
   CUSTOMER / MERCHANT PROFILE
========================================================= */

router.get(
  "/customers/:id",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportCustomerProfileController
);


/* =========================================================
   CONVERSATIONS
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/conversations",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportConversationsController
);

router.get(
  "/conversations/:id",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportConversationController
);

/* =========================================================
   SAVED REPLIES
---------------------------------------------------------
Support Agent:
- list
- search
- read

Admin/Super Admin:
- create
========================================================= */

router.get(
  "/saved-replies",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportSavedRepliesController
);

router.get(
  "/saved-replies/:id",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportSavedReplyController
);

router.post(
  "/saved-replies",
  requireAdminOrSuperAdmin,
  supportWriteLimiter,
  createSupportSavedReplyController
);

/* =========================================================
   KNOWLEDGE BASE
---------------------------------------------------------
Support Agent:
- search
- list
- read

Admin/Super Admin:
- create
========================================================= */

router.get(
  "/knowledge-base",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportKnowledgeBaseController
);

router.get(
  "/knowledge-base/:id",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportKnowledgeBaseArticleController
);

router.post(
  "/knowledge-base",
  requireAdminOrSuperAdmin,
  supportWriteLimiter,
  createSupportKnowledgeBaseArticleController
);
/* =========================================================
   ESCALATIONS
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/escalations",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportEscalationsController
);

router.get(
  "/escalations/:id",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportEscalationDetailController
);


/* =========================================================
   TICKET LIST
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/tickets",
  requireSupport,
  supportReadLimiter,
  getSupportTicketsController
);

/* =========================================================
   CREATE TICKET
---------------------------------------------------------
Support Agent + Admin + Super Admin

Support Agent needs this for internal support cases.
========================================================= */

router.post(
  "/tickets",
  requireSupportOrAdmin,
  supportCreateLimiter,
  createSupportTicketController
);

/* =========================================================
   TICKET DETAIL
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/tickets/:id",
  requireSupport,
  supportReadLimiter,
  getSupportTicketController
);

/* =========================================================
   UPDATE TICKET
---------------------------------------------------------
Support Agent + Admin + Super Admin

Used for:
- status
- priority
- category
- assignee
- tags
========================================================= */

router.patch(
  "/tickets/:id",
  requireSupportOrAdmin,
  supportWriteLimiter,
  updateSupportTicketController
);



/* =========================================================
   TRANSACTION LOOKUP
---------------------------------------------------------
Support Agent + Admin + Super Admin

Read-only investigation.
No transaction mutation is exposed.
========================================================= */

router.get(
  "/transactions",
  requireSupportOrAdmin,
  supportReadLimiter,
  searchSupportTransactionsController
);

router.get(
  "/transactions/:id",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportTransactionDetailController
);


/* =========================================================
   PAYMENT LOOKUP
---------------------------------------------------------
Support Agent + Admin + Super Admin

Read-only investigation.
No payment mutation is exposed.
========================================================= */

router.get(
  "/payments",
  requireSupportOrAdmin,
  supportReadLimiter,
  searchSupportPaymentsController
);

router.get(
  "/payments/:paymentId",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportPaymentDetailController
);


/* =========================================================
   DISPUTE CASES
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/disputes",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportDisputeCasesController
);


/* =========================================================
   AI ANALYSIS
---------------------------------------------------------
AI only recommends.
It does not execute financial actions.

Support Agent + Admin + Super Admin
========================================================= */

router.post(
  "/tickets/:id/ai-analysis",
  requireSupportOrAdmin,
  supportWriteLimiter,
  analyzeSupportTicketController
);

/* =========================================================
   MESSAGES
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.post(
  "/tickets/:id/messages",
  requireSupportOrAdmin,
  supportWriteLimiter,
  addSupportReplyController
);
/* =========================================================
   KYC CASES
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/kyc",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportKycCasesController
);


/* =========================================================
   REFUND REQUESTS
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/refunds",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportRefundRequestsController
);


/* =========================================================
   ACCOUNT ISSUES
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */


router.get(
  "/account-issues",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportAccountIssuesController
);
/* =========================================================
   INTERNAL NOTES
---------------------------------------------------------
Internal notes are part of Support investigation workflow.

Support Agent + Admin + Super Admin
========================================================= */

router.post(
  "/tickets/:id/notes",
  requireSupportOrAdmin,
  supportWriteLimiter,
  addSupportNoteController
);

/* =========================================================
   ESCALATE
---------------------------------------------------------
Support Agent + Admin + Super Admin

Support Agent must be able to escalate unresolved cases
to Analyst/Admin according to the Support workflow.
========================================================= */

router.post(
  "/tickets/:id/escalate",
  requireSupportOrAdmin,
  supportWriteLimiter,
  escalateSupportTicketController
);

/* =========================================================
   RESOLVE
---------------------------------------------------------
Support Agent + Admin + Super Admin

Support Agent may resolve cases after investigation.
========================================================= */

router.post(
  "/tickets/:id/resolve",
  requireSupportOrAdmin,
  supportWriteLimiter,
  resolveSupportTicketController
);

/* =========================================================
   SLA MONITORING
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/sla",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportSlaController
);

router.get(
  "/sla/summary",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportSlaSummaryController
);


/* =========================================================
   ANALYTICS
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/analytics",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportAnalyticsController
);

/* =========================================================
   ACTIVITY LOG
---------------------------------------------------------
Support Agent + Admin + Super Admin
========================================================= */

router.get(
  "/activity",
  requireSupportOrAdmin,
  supportReadLimiter,
  getSupportActivityController
);


/* =========================================================
   EXPORT ROUTER
========================================================= */


export default router;