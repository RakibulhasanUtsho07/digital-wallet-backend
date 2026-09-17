import {
  Router,
} from "express";

import {
  merchantApiAuth,
} from "../middlewares/merchantAuth.js";

import {
  createMerchantApiInvoiceController,
  getMerchantApiInvoiceController,
} from "../controllers/merchantInvoiceController.js";

const router =
  Router();

/* POST /api/v1/invoices */
router.post(
  "/",
  merchantApiAuth(
    "invoices:write"
  ),
  createMerchantApiInvoiceController
);

/*
 * MerchantApiScope currently has invoices:write,
 * but does not have invoices:read.
 */
router.get(
  "/:invoiceId",
  merchantApiAuth(
    "invoices:write"
  ),
  getMerchantApiInvoiceController
);

export default router;