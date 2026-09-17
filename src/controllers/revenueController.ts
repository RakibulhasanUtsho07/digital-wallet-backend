import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  feePolicyToDTO,
  getOrCreateRevenueFeePolicy,
  getRevenueContributors,
  getRevenueLeakage,
  normalizeRevenueRange,
  openLeakageInvestigation,
  simulateRevenueFees,
} from "../services/revenueAnalyticsService.js";

const asString =
  (
    value:
      unknown
  ) => {
    if (
      typeof value ===
      "string"
    ) {
      return value;
    }

    if (
      Array.isArray(
        value
      )
    ) {
      const first =
        value[0];

      return typeof first ===
        "string"
        ? first
        : "";
    }

    return "";
  };

export const getRevenueFeePolicy =
  async (
    _req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    try {
      const policy =
        await getOrCreateRevenueFeePolicy();

      res.status(
        200
      ).json({
        success:
          true,

        policy:
          feePolicyToDTO(
            policy
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "GET REVENUE FEE POLICY ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to load the revenue fee policy.",
      });
    }
  };

export const simulateRevenue =
  async (
    req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    try {
      const simulation =
        await simulateRevenueFees({
          transferFeeMinor:
            req.body
              ?.transferFeeMinor,

          withdrawalFeeMinor:
            req.body
              ?.withdrawalFeeMinor,

          monthlyTransactions:
            req.body
              ?.monthlyTransactions,
        });

      res.status(
        200
      ).json({
        success:
          true,

        simulation,
      });
    } catch (
      error
    ) {
      const message =
        error instanceof
        Error
          ? error.message
          : "Invalid revenue simulation request.";

      res.status(
        400
      ).json({
        success:
          false,

        message,
      });
    }
  };

export const getLeakage =
  async (
    req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    try {
      const range =
        normalizeRevenueRange(
          req.query
            .range
        );

      const result =
        await getRevenueLeakage(
          range
        );

      res.status(
        200
      ).json({
        success:
          true,

        range,

        ...result,
      });
    } catch (
      error
    ) {
      console.error(
        "GET REVENUE LEAKAGE ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to load revenue leakage signals.",
      });
    }
  };

export const getContributors =
  async (
    req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    try {
      const range =
        normalizeRevenueRange(
          req.query
            .range
        );

      const requestedLimit =
        Number(
          req.query
            .limit
        );

      const limit =
        Number.isFinite(
          requestedLimit
        )
          ? Math.max(
              1,
              Math.min(
                25,
                Math.floor(
                  requestedLimit
                )
              )
            )
          : 4;

      const contributors =
        await getRevenueContributors({
          range,
          limit,
        });

      res.status(
        200
      ).json({
        success:
          true,

        range,

        contributors,
      });
    } catch (
      error
    ) {
      console.error(
        "GET REVENUE CONTRIBUTORS ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to load top revenue contributors.",
      });
    }
  };

export const investigateLeakage =
  async (
    req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    try {
      const adminId =
        req.user
          ?._id;

      if (
        !adminId
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "Authentication is required.",
        });

        return;
      }

      const category =
        asString(
          req.body
            ?.category
        )
          .trim()
          .slice(
            0,
            120
          );

      const range =
        normalizeRevenueRange(
          req.body
            ?.range
        );

      const note =
        asString(
          req.body
            ?.note
        );

      if (
        !category
      ) {
        res.status(
          400
        ).json({
          success:
            false,

          message:
            "Leakage category is required.",
        });

        return;
      }

      const investigation =
        await openLeakageInvestigation({
          category,
          range,
          note,
          adminId,
        });

      res.status(
        201
      ).json({
        success:
          true,

        message:
          "Revenue leakage investigation is active.",

        investigation: {
          id:
            investigation._id.toString(),

          category:
            investigation.category,

          status:
            investigation.status,
        },
      });
    } catch (
      error
    ) {
      console.error(
        "OPEN REVENUE INVESTIGATION ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to open the leakage investigation.",
      });
    }
  };
