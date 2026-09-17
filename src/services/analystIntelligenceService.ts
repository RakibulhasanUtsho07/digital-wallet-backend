import {
  getAnalystOverview,
} from "./analystOverviewService.js";

import type {
  AnalystDateFilters,
  AnalystInsight,
  AnalystInsightCategory,
  AnalystInsightSeverity,
  AnalystIntelligenceCategoryBreakdown,
  AnalystIntelligenceCategoryFilter,
  AnalystIntelligenceData,
  AnalystIntelligenceSeverityFilter,
  AnalystIntelligenceTimelinePoint,
  AnalystSystemStatus,
} from "../types/analystTypes.js";

/* =========================================================
   INPUT
========================================================= */

export interface GetAnalystIntelligenceInput {
  filters:
    AnalystDateFilters;

  severity:
    AnalystIntelligenceSeverityFilter;

  category:
    AnalystIntelligenceCategoryFilter;
}

/* =========================================================
   CONSTANTS
========================================================= */

const CATEGORIES:
  AnalystInsightCategory[] = [
    "payments",
    "revenue",
    "refunds",
    "disputes",
    "risk",
    "growth",
    "data_quality",
  ];

const SEVERITY_WEIGHT:
  Record<
    AnalystInsightSeverity,
    number
  > = {
    critical:
      5,

    high:
      4,

    medium:
      3,

    info:
      2,

    positive:
      1,
  };

/* =========================================================
   HELPERS
========================================================= */

function round(
  value:
    number,
  digits =
    2
): number {
  const multiplier =
    10 ** digits;

  return (
    Math.round(
      value *
        multiplier
    ) /
    multiplier
  );
}

function clamp(
  value:
    number,
  minimum:
    number,
  maximum:
    number
): number {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value
    )
  );
}

function percentage(
  part:
    number,
  total:
    number
): number {
  if (
    total <=
    0
  ) {
    return 0;
  }

  return round(
    (
      part /
      total
    ) *
      100
  );
}

function changePercent(
  current:
    number,
  previous:
    number
): number | null {
  if (
    previous ===
    0
  ) {
    return current ===
      0
      ? 0
      : null;
  }

  return round(
    (
      (
        current -
        previous
      ) /
      Math.abs(
        previous
      )
    ) *
      100
  );
}

/* =========================================================
   PRESSURE STATUS
========================================================= */

function pressureStatus(
  pressure:
    number
): AnalystSystemStatus {
  if (
    pressure >=
    65
  ) {
    return "critical";
  }

  if (
    pressure >=
    30
  ) {
    return "attention";
  }

  return "healthy";
}

/* =========================================================
   TIMELINE
========================================================= */

function buildTimeline(
  trend:
    Array<{
      bucket:
        string;

      paymentCount:
        number;

      failedCount:
        number;

      volumeMinor:
        number;

      successRate:
        number;
    }>
): AnalystIntelligenceTimelinePoint[] {
  return trend.map(
    (
      point,
      index
    ) => {
      const previous =
        index >
        0
          ? trend[
              index -
                1
            ]
          : undefined;

      const failureRate =
        percentage(
          point.failedCount,
          point.paymentCount
        );

      const volumeChange =
        previous
          ? changePercent(
              point.volumeMinor,
              previous.volumeMinor
            )
          : null;

      /*
       * Explainable deterministic pressure score.
       *
       * No traffic:
       * pressure remains zero.
       *
       * Otherwise:
       * - low success rate increases pressure
       * - payment failures increase pressure
       * - large volume movement increases anomaly pressure
       */
      let pressure =
        0;

      if (
        point.paymentCount >
        0
      ) {
        const reliabilityPenalty =
          Math.max(
            0,
            95 -
              point.successRate
          ) *
          1.5;

        const failurePenalty =
          Math.min(
            35,
            failureRate *
              1.4
          );

        const volumePenalty =
          volumeChange ===
          null
            ? 0
            : Math.min(
                25,
                Math.abs(
                  volumeChange
                ) *
                  0.25
              );

        pressure =
          clamp(
            Math.round(
              reliabilityPenalty +
                failurePenalty +
                volumePenalty
            ),
            0,
            100
          );
      }

      return {
        bucket:
          point.bucket,

        paymentCount:
          point.paymentCount,

        failedCount:
          point.failedCount,

        volumeMinor:
          point.volumeMinor,

        successRate:
          point.successRate,

        failureRate,

        volumeChangePercent:
          volumeChange,

        pressureScore:
          pressure,

        status:
          pressureStatus(
            pressure
          ),
      };
    }
  );
}

/* =========================================================
   CATEGORY BREAKDOWN
========================================================= */

function buildCategories(
  insights:
    AnalystInsight[]
): AnalystIntelligenceCategoryBreakdown[] {
  return CATEGORIES.map(
    (
      category
    ) => {
      const items =
        insights.filter(
          (
            insight
          ) =>
            insight.category ===
            category
        );

      const highestSeverity =
        items.reduce<
          AnalystInsightSeverity |
          null
        >(
          (
            current,
            insight
          ) => {
            if (
              !current
            ) {
              return insight.severity;
            }

            return SEVERITY_WEIGHT[
              insight.severity
            ] >
              SEVERITY_WEIGHT[
                current
              ]
              ? insight.severity
              : current;
          },
          null
        );

      return {
        category,

        count:
          items.length,

        percentage:
          percentage(
            items.length,
            insights.length
          ),

        highestSeverity,
      };
    }
  );
}

/* =========================================================
   FILTER SIGNALS
========================================================= */

function filterInsights(
  insights:
    AnalystInsight[],
  severity:
    AnalystIntelligenceSeverityFilter,
  category:
    AnalystIntelligenceCategoryFilter
): AnalystInsight[] {
  return insights.filter(
    (
      insight
    ) => {
      if (
        severity !==
          "all" &&
        insight.severity !==
          severity
      ) {
        return false;
      }

      if (
        category !==
          "all" &&
        insight.category !==
          category
      ) {
        return false;
      }

      return true;
    }
  );
}

/* =========================================================
   INTELLIGENCE SERVICE
========================================================= */

export async function getAnalystIntelligence(
  input:
    GetAnalystIntelligenceInput
): Promise<AnalystIntelligenceData> {
  /*
   * Reuse the existing analyst aggregation layer.
   *
   * This prevents:
   * - duplicated MongoDB queries
   * - different metric definitions
   * - inconsistent insight calculations
   */
  const overview =
    await getAnalystOverview(
      input.filters
    );

  const allInsights =
    overview.insights;

  const matchedInsights =
    filterInsights(
      allInsights,
      input.severity,
      input.category
    );

  const anomalies =
    matchedInsights.filter(
      (
        insight
      ) =>
        insight.severity ===
          "critical" ||
        insight.severity ===
          "high" ||
        insight.severity ===
          "medium"
    );

  const criticalSignals =
    allInsights.filter(
      (
        insight
      ) =>
        insight.severity ===
        "critical"
    ).length;

  const attentionSignals =
    allInsights.filter(
      (
        insight
      ) =>
        insight.severity ===
          "high" ||
        insight.severity ===
          "medium"
    ).length;

  const positiveSignals =
    allInsights.filter(
      (
        insight
      ) =>
        insight.severity ===
        "positive"
    ).length;

  const dataQualitySignals =
    allInsights.filter(
      (
        insight
      ) =>
        insight.category ===
        "data_quality"
    ).length;

  const paymentCount =
    overview.metrics
      .paymentCount
      .value;

  const walletTransactionCount =
    overview.metrics
      .walletTransactionCount
      .value;

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source:
      "analyst_overview_aggregation",

    engine: {
      type:
        "deterministic_rules",

      version:
        overview
          .intelligenceEngine
          .version,

      paidProviderUsed:
        false,

      localModelUsed:
        false,

      explanation:
        "Signals are generated from explainable deterministic rules over real platform analytics. No paid AI provider is used.",
    },

    filters: {
      range:
        overview.filters
          .range,

      mode:
        overview.filters
          .mode,

      currency:
        overview.filters
          .currency,

      bucket:
        overview.filters
          .bucket,

      from:
        overview.filters
          .from,

      to:
        overview.filters
          .to,

      severity:
        input.severity,

      category:
        input.category,
    },

    status:
      overview.status,

    summary: {
      factsEvaluated:
        paymentCount +
        walletTransactionCount,

      totalSignals:
        allInsights.length,

      matchedSignals:
        matchedInsights.length,

      criticalSignals,

      attentionSignals,

      positiveSignals,

      dataQualitySignals,
    },

    baseline: {
      paymentCount,

      walletTransactionCount,

      paymentVolumeMinor:
        overview.metrics
          .paymentVolumeMinor
          .value,

      feeRevenueMinor:
        overview.metrics
          .paymentFeeRevenueMinor
          .value,

      refundAmountMinor:
        overview.metrics
          .refundAmountMinor
          .value,

      openDisputeExposureMinor:
        overview.metrics
          .openDisputeExposureMinor
          .value,

      highRiskTransactionCount:
        overview.operations
          .highRiskTransactionCount,

      failedPaymentCount:
        overview.operations
          .failedPaymentCount,

      successRate:
        overview.metrics
          .successRate
          .value,
    },

    categories:
      buildCategories(
        allInsights
      ),

    timeline:
      buildTimeline(
        overview.trend
      ),

    insights:
      matchedInsights,

    anomalies,
  };
}