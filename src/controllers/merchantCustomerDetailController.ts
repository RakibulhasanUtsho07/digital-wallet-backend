import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantCustomerDetail,
  getErrorStatus,
} from "../services/merchantCustomerDetailService.js";

/* =========================================================
   GET CUSTOMER DETAIL
   GET /api/merchants/customers/:customerId
========================================================= */

export const getMerchantCustomerDetailController =
  async (
    req: AuthRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      const customerId =
        typeof req.params.customerId ===
        "string"
          ? req.params.customerId
          : "";

      if (!userId) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const result =
        await getMerchantCustomerDetail({
          ownerId:
            String(userId),

          customerId,
        });

      res.status(200).json({
        success: true,

        merchant:
          result.merchant,

        customer:
          result.customer,

        summary:
          result.summary,

        payments:
          result.payments,
      });
    } catch (error: unknown) {
      console.error(
        "GET MERCHANT CUSTOMER DETAIL ERROR:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to load customer details.";

      const status =
        getErrorStatus(
          message,
        );

      res.status(status).json({
        success: false,
        message,
      });
    }
  };