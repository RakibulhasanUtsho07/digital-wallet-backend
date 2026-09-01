import express from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireAdmin,
} from "../middlewares/adminAuthorization.js";

import {
  addSupportNoteController,
  addSupportReplyController,
  createSupportTicketController,
  escalateSupportTicketController,
  exportSupportTicketsController,
  getSupportAdminsController,
  getSupportOverviewController,
  getSupportTicketController,
  getSupportTicketsController,
  resolveSupportTicketController,
  updateSupportTicketController,
} from "../controllers/supportController.js";

import {
  supportCreateLimiter,
  supportReadLimiter,
  supportWriteLimiter,
} from "../middlewares/supportRateLimiters.js";

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
  supportReadLimiter,
  getSupportOverviewController
);

router.get(
  "/admins",
  supportReadLimiter,
  getSupportAdminsController
);

router.get(
  "/export",
  supportReadLimiter,
  exportSupportTicketsController
);

router.get(
  "/tickets",
  supportReadLimiter,
  getSupportTicketsController
);

router.post(
  "/tickets",
  supportCreateLimiter,
  createSupportTicketController
);

router.get(
  "/tickets/:id",
  supportReadLimiter,
  getSupportTicketController
);

router.patch(
  "/tickets/:id",
  supportWriteLimiter,
  updateSupportTicketController
);

router.post(
  "/tickets/:id/messages",
  supportWriteLimiter,
  addSupportReplyController
);

router.post(
  "/tickets/:id/notes",
  supportWriteLimiter,
  addSupportNoteController
);

router.post(
  "/tickets/:id/escalate",
  supportWriteLimiter,
  escalateSupportTicketController
);

router.post(
  "/tickets/:id/resolve",
  supportWriteLimiter,
  resolveSupportTicketController
);

export default router;
