import { Router } from "express";

import {
  merchantApiAuth,
} from "../middlewares/merchantAuth.js";

import {
  createMerchantRefundController,
  getMerchantApiRefundController,
} from "../controllers/merchantRefundController.js";

const router = Router();

/* POST /api/v1/refunds */
router.post(
  "/",
  merchantApiAuth("refunds:write"),
  createMerchantRefundController
);

/* GET /api/v1/refunds/:refundId */
router.get(
  "/:refundId",
  merchantApiAuth("refunds:write"),
  getMerchantApiRefundController
);

export default router;