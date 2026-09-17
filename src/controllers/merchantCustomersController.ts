import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantCustomers,
} from "../services/merchantCustomerService.js";

/* =========================================================
   GET MERCHANT CUSTOMERS
   GET /api/merchants/customers
========================================================= */

export const getMerchantCustomersController =
  async (
    req: AuthRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const result =
        await getMerchantCustomers({
          ownerId:
            String(userId),

          page:
            req.query.page,

          limit:
            req.query.limit,

          search:
            req.query.search,

          status:
            req.query.status,

          kycStatus:
            req.query.kycStatus,

          from:
            req.query.from,

          to:
            req.query.to,
        });

      res.status(200).json({
        success: true,

        customers:
          result.customers,

        pagination:
          result.pagination,

        filters:
          result.filters,
      });
    } catch (error: unknown) {
      console.error(
        "GET MERCHANT CUSTOMERS ERROR:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to load merchant customers.";

      if (
        message ===
          "Invalid merchant owner ID." ||
        message ===
          "Authenticated merchant owner is required."
      ) {
        res.status(400).json({
          success: false,
          message,
        });

        return;
      }

      if (
        message ===
        "Merchant account not found."
      ) {
        res.status(404).json({
          success: false,
          message,
        });

        return;
      }

      res.status(500).json({
        success: false,
        message,
      });
    }
  };