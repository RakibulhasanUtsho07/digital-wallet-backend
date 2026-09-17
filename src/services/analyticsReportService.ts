import mongoose from "mongoose";

import {
  AnalyticsReport,
} from "../models/AnalyticsReport.js";

import {
  getAnalyticsDashboard,
} from "./analyticsAggregationService.js";

import type {
  AnalyticsDashboardData,
  AnalyticsRange,
  AnalyticsReportFormat,
} from "../types/analytics.js";

/* =========================================================
   HELPERS
========================================================= */

const REPORT_TTL_DAYS =
  7;

const csvCell =
  (
    value:
      unknown
  ) =>
    `"${String(
      value ??
        ""
    ).replace(
      /"/g,
      '""'
    )}"`;

const numberValue =
  (
    value:
      number
  ) =>
    Number.isFinite(
      value
    )
      ? value
      : 0;

/* =========================================================
   CSV EXPORT
========================================================= */

export const analyticsDashboardToCsv =
  (
    dashboard:
      AnalyticsDashboardData
  ) => {
    const rows:
      Array<
        Array<
          string |
          number
        >
      > = [
      [
        "Section",
        "Metric",
        "Value",
        "Range",
        "Generated At",
      ],

      [
        "Overview",
        "Transaction Volume",
        numberValue(
          dashboard.overview.transactionVolume
        ),
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "Transaction Count",
        dashboard.overview.transactionCount,
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "Active Users",
        dashboard.overview.activeUsers,
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "Wallet Balance",
        numberValue(
          dashboard.overview.walletBalance
        ),
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "KYC Completion %",
        dashboard.overview.kycCompletion,
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "Platform Revenue",
        numberValue(
          dashboard.overview.platformRevenue
        ),
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "Failure Rate %",
        dashboard.overview.failedRate,
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "High Risk Exposure",
        numberValue(
          dashboard.overview.highRiskExposure
        ),
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "Average Transaction Value",
        numberValue(
          dashboard.overview.avgTransactionValue
        ),
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "Merchant Share %",
        dashboard.overview.merchantShare,
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "Retention Rate %",
        dashboard.overview.retentionRate,
        dashboard.range,
        dashboard.generatedAt,
      ],

      [
        "Overview",
        "Dispute Rate %",
        dashboard.overview.disputeRate,
        dashboard.range,
        dashboard.generatedAt,
      ],
    ];

    for (
      const item of
      dashboard.pulse
    ) {
      rows.push([
        "Platform Pulse",
        item.label,
        item.score,
        dashboard.range,
        dashboard.generatedAt,
      ]);
    }

    for (
      const item of
      dashboard.channels
    ) {
      rows.push([
        "Channels",
        item.label,
        item.value,
        dashboard.range,
        dashboard.generatedAt,
      ]);
    }

    for (
      const item of
      dashboard.failureReasons
    ) {
      rows.push([
        "Failure Reasons",
        item.label,
        item.value,
        dashboard.range,
        dashboard.generatedAt,
      ]);
    }

    for (
      const item of
      dashboard.geography
    ) {
      rows.push([
        "Geography",
        item.label,
        item.value,
        dashboard.range,
        dashboard.generatedAt,
      ]);
    }

    for (
      const item of
      dashboard.riskMatrix
    ) {
      rows.push([
        "Risk Matrix",
        `${item.label} Count`,
        item.count,
        dashboard.range,
        dashboard.generatedAt,
      ]);

      rows.push([
        "Risk Matrix",
        `${item.label} Exposure`,
        item.amount,
        dashboard.range,
        dashboard.generatedAt,
      ]);
    }

    return rows
      .map(
        (
          row
        ) =>
          row
            .map(
              csvCell
            )
            .join(
              ","
            )
      )
      .join(
        "\n"
      );
  };

/* =========================================================
   REPORT CREATION
========================================================= */

export const createAnalyticsReport =
  async ({
    adminId,
    range,
    format,
  }: {
    adminId:
      string;
    range:
      AnalyticsRange;
    format:
      AnalyticsReportFormat;
  }) => {
    const report =
      await AnalyticsReport.create({
        requestedByAdminId:
          adminId,
        range,
        format,
        status:
          "processing",
        expiresAt:
          new Date(
            Date.now() +
              REPORT_TTL_DAYS *
                24 *
                60 *
                60 *
                1000
          ),
      });

    try {
      const dashboard =
        await getAnalyticsDashboard({
          range,
          forceFresh:
            false,
        });

      report.snapshot =
        dashboard;

      report.status =
        "ready";

      report.completedAt =
        new Date();

      report.errorMessage =
        undefined;

      await report.save();

      return report;
    } catch (
      error
    ) {
      report.status =
        "failed";

      report.errorMessage =
        error instanceof
        Error
          ? error.message.slice(
              0,
              500
            )
          : "Analytics report generation failed.";

      report.completedAt =
        new Date();

      await report.save();

      throw error;
    }
  };

/* =========================================================
   REPORT READ
========================================================= */

export const getAnalyticsReport =
  async ({
    reportId,
    adminId,
  }: {
    reportId:
      string;
    adminId:
      string;
  }) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        reportId
      )
    ) {
      return null;
    }

    return AnalyticsReport.findOne({
      _id:
        reportId,
      requestedByAdminId:
        adminId,
      expiresAt: {
        $gt:
          new Date(),
      },
    }).lean();
  };

export const getAnalyticsReportCsv =
  async ({
    reportId,
    adminId,
  }: {
    reportId:
      string;
    adminId:
      string;
  }) => {
    const report =
      await getAnalyticsReport({
        reportId,
        adminId,
      });

    if (
      !report ||
      report.status !==
        "ready" ||
      !report.snapshot
    ) {
      return null;
    }

    return analyticsDashboardToCsv(
      report.snapshot as
        AnalyticsDashboardData
    );
  };
