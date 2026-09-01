import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getAnalyticsDashboard,
} from "../services/analyticsAggregationService.js";

import {
  analyticsDashboardToCsv,
  createAnalyticsReport,
  getAnalyticsReport,
  getAnalyticsReportCsv,
} from "../services/analyticsReportService.js";

import {
  parseAnalyticsRange,
} from "../services/analyticsRangeService.js";

import type {
  AnalyticsReportFormat,
} from "../types/analytics.js";

/* =========================================================
   HELPERS
========================================================= */

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
        value[
          0
        ];

      return typeof first ===
        "string"
        ? first
        : "";
    }

    return "";
  };

const getAdminId =
  (
    req:
      AuthRequest,
    res:
      Response
  ):
    string |
    null => {
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

      return null;
    }

    return adminId;
  };

const parseReportFormat =
  (
    value:
      unknown
  ):
    AnalyticsReportFormat |
    null => {
    const format =
      asString(
        value
      );

    if (
      format ===
        "summary" ||
      format ===
        "executive" ||
      format ===
        "risk"
    ) {
      return format;
    }

    return null;
  };

/* =========================================================
   GET DASHBOARD
   GET /api/admin/analytics/dashboard
========================================================= */

export const getAnalyticsDashboardController =
  async (
    req:
      AuthRequest,
    res:
      Response
  ):
    Promise<void> => {
    try {
      const range =
        parseAnalyticsRange(
          req.query
            .range
        );

      const forceFresh =
        asString(
          req.query
            .refresh
        ) ===
        "1";

      const dashboard =
        await getAnalyticsDashboard({
          range,
          forceFresh,
        });

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.status(
        200
      ).json({
        success:
          true,

        dashboard,
      });
    } catch (
      error
    ) {
      console.error(
        "GET ANALYTICS DASHBOARD ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to load analytics dashboard.",
      });
    }
  };

/* =========================================================
   EXPORT
   GET /api/admin/analytics/export
========================================================= */

export const exportAnalyticsController =
  async (
    req:
      AuthRequest,
    res:
      Response
  ):
    Promise<void> => {
    try {
      const range =
        parseAnalyticsRange(
          req.query
            .range
        );

      const format =
        asString(
          req.query
            .format
        ) ||
        "csv";

      if (
        format !==
        "csv"
      ) {
        res.status(
          400
        ).json({
          success:
            false,

          message:
            "Only CSV export is currently supported.",
        });

        return;
      }

      const dashboard =
        await getAnalyticsDashboard({
          range,
          forceFresh:
            false,
        });

      const csv =
        analyticsDashboardToCsv(
          dashboard
        );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="analytics-${range.toLowerCase()}-${new Date()
          .toISOString()
          .slice(
            0,
            10
          )}.csv"`
      );

      res.status(
        200
      ).send(
        csv
      );
    } catch (
      error
    ) {
      console.error(
        "EXPORT ANALYTICS ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to export analytics.",
      });
    }
  };

/* =========================================================
   CREATE REPORT
   POST /api/admin/analytics/reports
========================================================= */

export const createAnalyticsReportController =
  async (
    req:
      AuthRequest,
    res:
      Response
  ):
    Promise<void> => {
    const adminId =
      getAdminId(
        req,
        res
      );

    if (
      !adminId
    ) {
      return;
    }

    const range =
      parseAnalyticsRange(
        req.body
          ?.range
      );

    const format =
      parseReportFormat(
        req.body
          ?.format
      );

    if (
      !format
    ) {
      res.status(
        400
      ).json({
        success:
          false,

        message:
          "Report format must be summary, executive, or risk.",
      });

      return;
    }

    try {
      const report =
        await createAnalyticsReport({
          adminId,
          range,
          format,
        });

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.status(
        201
      ).json({
        success:
          true,

        report: {
          id:
            report._id.toString(),

          status:
            report.status,
        },
      });
    } catch (
      error
    ) {
      console.error(
        "CREATE ANALYTICS REPORT ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to generate analytics report.",
      });
    }
  };

/* =========================================================
   GET REPORT
   GET /api/admin/analytics/reports/:id
========================================================= */

export const getAnalyticsReportController =
  async (
    req:
      AuthRequest,
    res:
      Response
  ):
    Promise<void> => {
    const adminId =
      getAdminId(
        req,
        res
      );

    if (
      !adminId
    ) {
      return;
    }

    try {
      const report =
        await getAnalyticsReport({
          reportId:
            asString(
              req.params
                .id
            ),

          adminId,
        });

      if (
        !report
      ) {
        res.status(
          404
        ).json({
          success:
            false,

          message:
            "Analytics report not found or expired.",
        });

        return;
      }

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.status(
        200
      ).json({
        success:
          true,

        report: {
          id:
            report._id.toString(),

          range:
            report.range,

          format:
            report.format,

          status:
            report.status,

          completedAt:
            report.completedAt ??
            null,

          createdAt:
            report.createdAt,

          expiresAt:
            report.expiresAt,
        },
      });
    } catch (
      error
    ) {
      console.error(
        "GET ANALYTICS REPORT ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to load analytics report.",
      });
    }
  };

/* =========================================================
   DOWNLOAD REPORT
   GET /api/admin/analytics/reports/:id/download
========================================================= */

export const downloadAnalyticsReportController =
  async (
    req:
      AuthRequest,
    res:
      Response
  ):
    Promise<void> => {
    const adminId =
      getAdminId(
        req,
        res
      );

    if (
      !adminId
    ) {
      return;
    }

    try {
      const reportId =
        asString(
          req.params
            .id
        );

      const csv =
        await getAnalyticsReportCsv({
          reportId,
          adminId,
        });

      if (
        !csv
      ) {
        res.status(
          404
        ).json({
          success:
            false,

          message:
            "Analytics report is unavailable, expired, or not ready.",
        });

        return;
      }

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="analytics-report-${reportId}.csv"`
      );

      res.status(
        200
      ).send(
        csv
      );
    } catch (
      error
    ) {
      console.error(
        "DOWNLOAD ANALYTICS REPORT ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to download analytics report.",
      });
    }
  };
