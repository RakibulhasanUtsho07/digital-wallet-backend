import type {
  AnalystDateFilters,
} from "../types/analystTypes.js";

import {
  getAnalystOverview,
} from "./analystOverviewService.js";

import {
  getAnalystLivePulse,
} from "./analystLivePulseService.js";

import {
  getAnalystProviderAnalytics,
} from "./analystProviderService.js";

import {
  getAnalystRiskAnalytics,
} from "./analystRiskService.js";

import {
  listAnalystReports,
} from "./analystReportService.js";

import type {
  AnalystSettingsPayload,
  AnalystSettingsRange,
} from "./analystSettingsTypes.js";

const RANGE_MS: Record<AnalystSettingsRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

function buildFilters(
  settings: AnalystSettingsPayload
): AnalystDateFilters {
  const to = new Date();

  const duration =
    RANGE_MS[
      settings.general.defaultRange
    ];

  const from =
    new Date(
      to.getTime() -
        duration
    );

  const previousTo =
    new Date(
      from
    );

  const previousFrom =
    new Date(
      previousTo.getTime() -
        duration
    );

  return {
    range:
      settings.general.defaultRange,

    mode:
      settings.general.defaultMode,

    currency:
      settings.general.currency,

    bucket:
      settings.general.defaultRange ===
      "24h"
        ? "hour"
        : "day",

    from,
    to,
    previousFrom,
    previousTo,
  };
}

function sourceState(
  result: PromiseSettledResult<unknown>
) {
  if (
    result.status ===
    "fulfilled"
  ) {
    return {
      available: true,
    };
  }

  return {
    available: false,

    error:
      result.reason instanceof Error
        ? result.reason.message
        : "Backend analytics source is unavailable.",
  };
}

export async function getAnalystSettingsLiveSnapshot({
  userId,
  settings,
}: {
  userId: string;
  settings: AnalystSettingsPayload;
}) {
  const filters =
    buildFilters(
      settings
    );

  const [
    overviewResult,
    pulseResult,
    providerResult,
    riskResult,
    reportsResult,
  ] =
    await Promise.allSettled([
      getAnalystOverview(
        filters
      ),

      getAnalystLivePulse({
        mode:
          settings.general.defaultMode,

        currency:
          settings.general.currency,
      }),

      getAnalystProviderAnalytics({
        range:
          settings.general.defaultRange,

        mode:
          settings.general.defaultMode,

        currency:
          settings.general.currency,

        provider:
          settings.dataScope.provider,
      }),

      getAnalystRiskAnalytics({
        filters,

        provider:
          settings.dataScope.provider,

        source:
          settings.dataScope.riskSource,
      }),

      listAnalystReports({
        userId,
        limit: 25,
      }),
    ]);

  const overview =
    overviewResult.status ===
      "fulfilled"
      ? {
          status:
            overviewResult.value.status,

          paymentVolumeMinor:
            overviewResult.value.metrics
              .paymentVolumeMinor
              .value,

          paymentCount:
            overviewResult.value.metrics
              .paymentCount
              .value,

          successRate:
            overviewResult.value.metrics
              .successRate
              .value,

          activeUsers:
            overviewResult.value.accounts
              .activeUsers,

          activeMerchants:
            overviewResult.value.accounts
              .activeMerchants,

          failedPaymentCount:
            overviewResult.value.operations
              .failedPaymentCount,

          highRiskTransactionCount:
            overviewResult.value.operations
              .highRiskTransactionCount,
        }
      : null;

  const pulse =
    pulseResult.status ===
      "fulfilled"
      ? {
          status:
            pulseResult.value.status,

          last60AttemptCount:
            pulseResult.value.windows
              .last60Minutes
              .attemptCount,

          last60CompletedCount:
            pulseResult.value.windows
              .last60Minutes
              .completedCount,

          last60FailedCount:
            pulseResult.value.windows
              .last60Minutes
              .failedCount,

          last60SuccessRate:
            pulseResult.value.windows
              .last60Minutes
              .successRate,

          highRiskTransactionCount:
            pulseResult.value.transactions
              .last60Minutes
              .highRiskCount,

          stalePaymentCount:
            pulseResult.value.queues
              .stalePaymentCount,

          alertCount:
            pulseResult.value.alerts
              .length,

          providerCount:
            pulseResult.value.providers
              .length,

          refreshAfterSeconds:
            pulseResult.value
              .refreshAfterSeconds,
        }
      : null;

  const providers =
    providerResult.status ===
      "fulfilled"
      ? {
          status:
            providerResult.value.status,

          totalProviders:
            providerResult.value.summary
              .totalProviders,

          healthyProviders:
            providerResult.value.summary
              .healthyProviders,

          attentionProviders:
            providerResult.value.summary
              .attentionProviders,

          criticalProviders:
            providerResult.value.summary
              .criticalProviders,

          overallSuccessRate:
            providerResult.value.summary
              .overallSuccessRate,

          averageCompletionSeconds:
            providerResult.value.summary
              .averageCompletionSeconds,

          topProvider:
            providerResult.value.summary
              .topProvider,

          weakestProvider:
            providerResult.value.summary
              .weakestProvider,
        }
      : null;

  const risk =
    riskResult.status ===
      "fulfilled"
      ? {
          status:
            riskResult.value.status,

          riskSignalCount:
            riskResult.value.metrics
              .riskSignalCount
              .value,

          highRiskTransactions:
            riskResult.value.metrics
              .highRiskTransactions
              .value,

          highRiskTransactionRate:
            riskResult.value.metrics
              .highRiskTransactionRate
              .value,

          failedPayments:
            riskResult.value.metrics
              .failedPayments
              .value,

          failedTransactions:
            riskResult.value.metrics
              .failedTransactions
              .value,
        }
      : null;

  const reports =
    reportsResult.status ===
      "fulfilled"
      ? {
          totalRecent:
            reportsResult.value.length,

          ready:
            reportsResult.value.filter(
              (item) =>
                item.status ===
                "ready"
            ).length,

          processing:
            reportsResult.value.filter(
              (item) =>
                item.status ===
                "processing"
            ).length,

          failed:
            reportsResult.value.filter(
              (item) =>
                item.status ===
                "failed"
            ).length,

          latestCreatedAt:
            reportsResult.value[0]
              ?.createdAt
              ?.toISOString?.() ??
            null,
        }
      : null;

  return {
    generatedAt:
      new Date()
        .toISOString(),

    filters: {
      range:
        settings.general.defaultRange,

      mode:
        settings.general.defaultMode,

      currency:
        settings.general.currency,

      provider:
        settings.dataScope.provider,

      riskSource:
        settings.dataScope.riskSource,
    },

    sources: {
      overview:
        sourceState(
          overviewResult
        ),

      pulse:
        sourceState(
          pulseResult
        ),

      providers:
        sourceState(
          providerResult
        ),

      risk:
        sourceState(
          riskResult
        ),

      reports:
        sourceState(
          reportsResult
        ),
    },

    overview,
    pulse,
    providers,
    risk,
    reports,
  };
}
