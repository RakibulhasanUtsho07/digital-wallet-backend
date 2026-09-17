import {
  getAnalystPaymentAnalytics,
  type AnalystPaymentMode,
  type AnalystPaymentRange,
  type AnalystPaymentAnalyticsData,
} from "./analystPaymentService.js";

/* =========================================================
   TYPES
========================================================= */

export interface AnalystProviderFilters {
  range:
    AnalystPaymentRange;

  mode:
    AnalystPaymentMode;

  currency:
    string;

  provider:
    string;
}

export type AnalystProviderHealth =
  | "healthy"
  | "attention"
  | "critical";

export type AnalystProviderInsightSeverity =
  | "critical"
  | "high"
  | "medium"
  | "info"
  | "positive";

export interface AnalystProviderInsight {
  id:
    string;

  severity:
    AnalystProviderInsightSeverity;

  title:
    string;

  description:
    string;

  evidence:
    string;

  recommendedReview:
    string;
}

export interface AnalystProviderPerformance {
  provider:
    string;

  attemptCount:
    number;

  completedCount:
    number;

  failedCount:
    number;

  pendingCount:
    number;

  volumeMinor:
    number;

  feeRevenueMinor:
    number;

  successRate:
    number;

  averageCompletionSeconds:
    number;

  health:
    AnalystProviderHealth;
}

/* =========================================================
   HELPERS
========================================================= */

function round(
  value: number,
  digits = 2
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

function normalizeProvider(
  value:
    string
): string {
  return value
    .trim()
    .toLowerCase();
}

/* =========================================================
   PROVIDER HEALTH SUMMARY
========================================================= */

function buildHealthSummary(
  providers:
    AnalystProviderPerformance[]
) {
  return {
    totalProviders:
      providers.length,

    healthyProviders:
      providers.filter(
        (
          provider
        ) =>
          provider.health ===
          "healthy"
      ).length,

    attentionProviders:
      providers.filter(
        (
          provider
        ) =>
          provider.health ===
          "attention"
      ).length,

    criticalProviders:
      providers.filter(
        (
          provider
        ) =>
          provider.health ===
          "critical"
      ).length,
  };
}

/* =========================================================
   BEST / WEAKEST PROVIDER
========================================================= */

function findTopProvider(
  providers:
    AnalystProviderPerformance[]
): AnalystProviderPerformance | null {
  if (
    providers.length ===
    0
  ) {
    return null;
  }

  return [
    ...providers,
  ].sort(
    (
      first,
      second
    ) => {
      if (
        second.successRate !==
        first.successRate
      ) {
        return (
          second.successRate -
          first.successRate
        );
      }

      return (
        second.attemptCount -
        first.attemptCount
      );
    }
  )[0] ?? null;
}

function findWeakestProvider(
  providers:
    AnalystProviderPerformance[]
): AnalystProviderPerformance | null {
  const providersWithTraffic =
    providers.filter(
      (
        provider
      ) =>
        provider.attemptCount >
        0
    );

  if (
    providersWithTraffic.length ===
    0
  ) {
    return null;
  }

  return [
    ...providersWithTraffic,
  ].sort(
    (
      first,
      second
    ) => {
      if (
        first.successRate !==
        second.successRate
      ) {
        return (
          first.successRate -
          second.successRate
        );
      }

      return (
        second.attemptCount -
        first.attemptCount
      );
    }
  )[0] ?? null;
}

/* =========================================================
   INSIGHTS
========================================================= */

function buildProviderInsights({
  providers,
  selectedProvider,
  selectedAnalytics,
}: {
  providers:
    AnalystProviderPerformance[];

  selectedProvider:
    string;

  selectedAnalytics:
    AnalystPaymentAnalyticsData;
}): AnalystProviderInsight[] {
  const insights:
    AnalystProviderInsight[] =
    [];

  const attempts =
    selectedAnalytics
      .metrics
      .attemptCount
      .value;

  const successRate =
    selectedAnalytics
      .metrics
      .successRate
      .value;

  const failureRate =
    selectedAnalytics
      .metrics
      .failureRate
      .value;

  const latency =
    selectedAnalytics
      .metrics
      .averageCompletionSeconds
      .value;

  /* =======================================================
     NO ACTIVITY
  ======================================================= */

  if (
    attempts ===
    0
  ) {
    insights.push({
      id:
        "provider-no-activity",

      severity:
        "info",

      title:
        selectedProvider
          ? "No activity for the selected provider"
          : "No provider activity for this filter",

      description:
        selectedProvider
          ? `No payment attempts were recorded for ${selectedProvider} with the current filters.`
          : "No provider-backed payment attempt was recorded with the current filters.",

      evidence:
        "0 payment attempts",

      recommendedReview:
        "Review the selected range, environment and currency or confirm that merchant integrations are creating payment attempts.",
    });

    return insights;
  }

  /* =======================================================
     FAILURE RATE
  ======================================================= */

  if (
    failureRate >=
    25
  ) {
    insights.push({
      id:
        "provider-critical-failure-rate",

      severity:
        "critical",

      title:
        "Provider failure rate is critical",

      description:
        "At least one quarter of matching provider attempts failed.",

      evidence:
        `${failureRate.toFixed(
          2
        )}% failure rate across ${attempts} attempts.`,

      recommendedReview:
        "Inspect provider failure codes and recent integration responses before escalating the provider.",
    });
  } else if (
    failureRate >=
    10
  ) {
    insights.push({
      id:
        "provider-elevated-failure-rate",

      severity:
        "high",

      title:
        "Provider failures need review",

      description:
        "The matching payment traffic exceeded the 10% failure attention threshold.",

      evidence:
        `${failureRate.toFixed(
          2
        )}% failure rate.`,

      recommendedReview:
        "Compare failure reasons, traffic source and provider completion latency.",
    });
  }

  /* =======================================================
     LATENCY
  ======================================================= */

  if (
    latency >
    30
  ) {
    insights.push({
      id:
        "provider-high-latency",

      severity:
        "medium",

      title:
        "Provider completion latency is elevated",

      description:
        "Average successful payment completion exceeded the deterministic 30-second attention threshold.",

      evidence:
        `${latency.toFixed(
          2
        )} seconds average completion time.`,

      recommendedReview:
        "Inspect provider callback, authorization and capture timing for slow requests.",
    });
  }

  /* =======================================================
     PROVIDER COMPARISON
  ======================================================= */

  const weakProvider =
    findWeakestProvider(
      providers
    );

  if (
    !selectedProvider &&
    weakProvider &&
    weakProvider.attemptCount >=
      5 &&
    weakProvider.successRate <
      70
  ) {
    insights.push({
      id:
        `provider-weak-${weakProvider.provider}`,

      severity:
        weakProvider.successRate <
        50
          ? "critical"
          : "high",

      title:
        "A provider is underperforming",

      description:
        `${weakProvider.provider} has materially weaker success performance across the current traffic sample.`,

      evidence:
        `${weakProvider.successRate.toFixed(
          2
        )}% success across ${weakProvider.attemptCount} attempts.`,

      recommendedReview:
        "Compare this provider with healthier providers and inspect its recorded failure reasons.",
    });
  }

  /* =======================================================
     HEALTHY
  ======================================================= */

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "provider-healthy",

      severity:
        "positive",

      title:
        "Provider performance is within thresholds",

      description:
        selectedProvider
          ? `${selectedProvider} is operating within the current deterministic provider-health thresholds.`
          : "No material provider-health threshold was breached for the current filters.",

      evidence:
        `${successRate.toFixed(
          2
        )}% success rate across ${attempts} attempts.`,

      recommendedReview:
        "Continue monitoring provider success rate, failure reasons and completion latency.",
    });
  }

  return insights;
}

/* =========================================================
   MAIN SERVICE
========================================================= */

export async function getAnalystProviderAnalytics(
  filters:
    AnalystProviderFilters
) {
  const provider =
    normalizeProvider(
      filters.provider
    );

  /* =======================================================
     ALL PROVIDERS

     Used for:
     - comparison
     - provider selector
     - health distribution
  ======================================================= */

  const allAnalytics =
    await getAnalystPaymentAnalytics({
      range:
        filters.range,

      mode:
        filters.mode,

      currency:
        filters.currency,

      provider:
        "",

      status:
        "all",

      source:
        "all",
    });

  /* =======================================================
     SELECTED PROVIDER

     If provider is empty, selected analytics represents
     all provider traffic.
  ======================================================= */

  const selectedAnalytics =
    provider
      ? await getAnalystPaymentAnalytics({
          range:
            filters.range,

          mode:
            filters.mode,

          currency:
            filters.currency,

          provider,

          status:
            "all",

          source:
            "all",
        })
      : allAnalytics;

  /* =======================================================
     PROVIDER PERFORMANCE
  ======================================================= */

  const providers:
    AnalystProviderPerformance[] =
    allAnalytics.providers.map(
      (
        item
      ) => ({
        provider:
          item.provider,

        attemptCount:
          item.attemptCount,

        completedCount:
          item.completedCount,

        failedCount:
          item.failedCount,

        pendingCount:
          item.pendingCount,

        volumeMinor:
          item.volumeMinor,

        feeRevenueMinor:
          item.feeRevenueMinor,

        successRate:
          item.successRate,

        averageCompletionSeconds:
          item.averageCompletionSeconds,

        health:
          item.health,
      })
    );

  const selectedProvider =
    provider
      ? providers.find(
          (
            item
          ) =>
            item.provider ===
            provider
        ) ??
        {
          provider,

          attemptCount:
            selectedAnalytics
              .metrics
              .attemptCount
              .value,

          completedCount:
            selectedAnalytics
              .metrics
              .completedCount
              .value,

          failedCount:
            selectedAnalytics
              .metrics
              .failedCount
              .value,

          pendingCount:
            selectedAnalytics
              .operations
              .pendingCount,

          volumeMinor:
            selectedAnalytics
              .metrics
              .paymentVolumeMinor
              .value,

          feeRevenueMinor:
            selectedAnalytics
              .metrics
              .feeRevenueMinor
              .value,

          successRate:
            selectedAnalytics
              .metrics
              .successRate
              .value,

          averageCompletionSeconds:
            selectedAnalytics
              .metrics
              .averageCompletionSeconds
              .value,

          health:
            selectedAnalytics
              .metrics
              .successRate
              .value >=
            85
              ? "healthy"
              : selectedAnalytics
                    .metrics
                    .successRate
                    .value >=
                  65
                ? "attention"
                : "critical",
        }
      : null;

  /* =======================================================
     PROVIDER OPTIONS
  ======================================================= */

  const providerOptions =
    providers
      .map(
        (
          item
        ) =>
          item.provider
      )
      .filter(
        (
          value,
          index,
          array
        ) =>
          value &&
          array.indexOf(
            value
          ) ===
            index
      )
      .sort();

  /* =======================================================
     SUMMARY
  ======================================================= */

  const health =
    buildHealthSummary(
      providers
    );

  const topProvider =
    findTopProvider(
      providers
    );

  const weakestProvider =
    findWeakestProvider(
      providers
    );

  /* =======================================================
     RESPONSE
  ======================================================= */

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source:
      "mongodb_payment_collection" as const,

    intelligenceEngine: {
      type:
        "deterministic_rules" as const,

      paidProviderUsed:
        false as const,

      version:
        "provider-rules-v1",
    },

    filters: {
      range:
        filters.range,

      mode:
        filters.mode,

      currency:
        filters.currency,

      provider,

      from:
        selectedAnalytics
          .filters
          .from,

      to:
        selectedAnalytics
          .filters
          .to,

      previousFrom:
        selectedAnalytics
          .filters
          .previousFrom,

      bucket:
        selectedAnalytics
          .filters
          .bucket,
    },

    scopeNote:
      "Provider Analytics observes payment-provider performance from recorded Coffer gateway payment attempts. It does not modify provider configuration or financial records.",

    status:
      selectedProvider
        ? selectedProvider.health
        : health.criticalProviders >
            0
          ? "critical"
          : health.attentionProviders >
              0
            ? "attention"
            : "healthy",

    summary: {
      ...health,

      totalAttempts:
        allAnalytics
          .metrics
          .attemptCount
          .value,

      completedPayments:
        allAnalytics
          .metrics
          .completedCount
          .value,

      failedPayments:
        allAnalytics
          .metrics
          .failedCount
          .value,

      overallSuccessRate:
        allAnalytics
          .metrics
          .successRate
          .value,

      completedVolumeMinor:
        allAnalytics
          .metrics
          .paymentVolumeMinor
          .value,

      feeRevenueMinor:
        allAnalytics
          .metrics
          .feeRevenueMinor
          .value,

      averageCompletionSeconds:
        round(
          allAnalytics
            .metrics
            .averageCompletionSeconds
            .value
        ),

      topProvider:
        topProvider
          ? {
              provider:
                topProvider.provider,

              successRate:
                topProvider.successRate,

              attemptCount:
                topProvider.attemptCount,
            }
          : null,

      weakestProvider:
        weakestProvider
          ? {
              provider:
                weakestProvider.provider,

              successRate:
                weakestProvider.successRate,

              attemptCount:
                weakestProvider.attemptCount,
            }
          : null,
    },

    selected: {
      provider:
        provider ||
        "all",

      performance:
        selectedProvider,

      metrics:
        selectedAnalytics
          .metrics,

      operations:
        selectedAnalytics
          .operations,
    },

    providerOptions,

    providers,

    trend:
      selectedAnalytics
        .trend,

    failureReasons:
      selectedAnalytics
        .failureReasons,

    latency:
      selectedAnalytics
        .latency,

    sources:
      selectedAnalytics
        .sources,

    modes:
      selectedAnalytics
        .modes,

    insights:
      buildProviderInsights({
        providers,

        selectedProvider:
          provider,

        selectedAnalytics,
      }),
  };
}