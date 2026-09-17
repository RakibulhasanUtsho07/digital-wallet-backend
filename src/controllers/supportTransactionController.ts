import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  searchSupportTransactions,
  getSupportTransactionDetail,
} from "../services/supportTransactionService.js";

/* =========================================================
   TRANSACTION SEARCH
   GET /api/v1/support/transactions
========================================================= */

export const searchSupportTransactionsController =
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

      const type =
        typeof req.query.type ===
        "string"
          ? req.query.type
          : undefined;

      const status =
        typeof req.query.status ===
        "string"
          ? req.query.status
          : undefined;

      const riskScore =
        typeof req.query.riskScore ===
        "string"
          ? req.query.riskScore
          : undefined;

      const page =
        Number(
          req.query.page ??
            1
        );

      const limit =
        Number(
          req.query.limit ??
            20
        );

      const result =
        await searchSupportTransactions({
          search,
          type,
          status,
          riskScore,
          page:
            Number.isFinite(
              page
            )
              ? page
              : 1,
          limit:
            Number.isFinite(
              limit
            )
              ? limit
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
        "SUPPORT TRANSACTION SEARCH ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to search transactions.",
      });
    }
  };

/* =========================================================
   TRANSACTION DETAIL
   GET /api/v1/support/transactions/:id
========================================================= */

export const getSupportTransactionDetailController =
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

      const transactionId =
        typeof req.params.id ===
        "string"
          ? req.params.id
          : "";

      const transaction =
        await getSupportTransactionDetail(
          transactionId
        );

      if (
        !transaction
      ) {
        res.status(404).json({
          success: false,

          message:
            "Transaction not found.",
        });

        return;
      }

      res.status(200).json({
        success: true,

        transaction,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT TRANSACTION DETAIL ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to load transaction details.",
      });
    }
  };