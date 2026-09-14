import {
  Router,
} from "express";

import {
  getPublicInvoiceController,
} from "../controllers/merchantInvoiceController.js";

const router =
  Router();

/*
 * GET /api/public/invoices/:invoiceId
 *
 * Required header:
 * X-Invoice-Token
 */
router.get(
  "/:invoiceId",
  getPublicInvoiceController
);

export default router;