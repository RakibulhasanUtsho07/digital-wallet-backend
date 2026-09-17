import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getSupportCustomerProfile,
  searchSupportCustomers,
  type SupportCustomerType,
} from "../services/supportCustomerService.js";

/* =========================================================
   SEARCH CUSTOMERS / MERCHANTS
   GET /api/v1/support/customers
========================================================= */

export const searchSupportCustomersController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const search =
        typeof req.query.search ===
        "string"
          ? req.query.search
          : undefined;

      const role =
        typeof req.query.role ===
        "string"
          ? req.query.role
          : undefined;

      const pageValue =
        Number(
          req.query.page ?? 1
        );

      const limitValue =
        Number(
          req.query.limit ?? 20
        );

      const validRole =
        role === "user" ||
        role === "merchant"
          ? (
              role as SupportCustomerType
            )
          : undefined;

      const result =
        await searchSupportCustomers({
          search,
          role:
            validRole,
          page:
            Number.isFinite(
              pageValue
            )
              ? pageValue
              : 1,
          limit:
            Number.isFinite(
              limitValue
            )
              ? limitValue
              : 20,
        });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT CUSTOMER SEARCH ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to search support customers.",
      });
    }
  };

/* =========================================================
   CUSTOMER / MERCHANT PROFILE
   GET /api/v1/support/customers/:id
========================================================= */

export const getSupportCustomerProfileController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const customerId =
        typeof req.params.id ===
        "string"
          ? req.params.id
          : "";

      const customer =
        await getSupportCustomerProfile(
          customerId
        );

      if (
        !customer
      ) {
        res.status(404).json({
          success: false,
          message:
            "Customer or merchant not found.",
        });

        return;
      }

      res.status(200).json({
        success: true,
        customer,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT CUSTOMER PROFILE ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load customer profile.",
      });
    }
  };