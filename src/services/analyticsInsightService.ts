import type {
  AnalyticsAlert,
  AnalyticsInsight,
  AnalyticsOverview,
  AnalyticsTone,
} from "../types/analytics.js";

const percentChange =
  (
    current:
      number,
    previous:
      number
  ) => {
    if (
      previous <=
      0
    ) {
      return current >
        0
        ? 100
        : 0;
    }

    return (
      (
        current -
        previous
      ) /
      previous
    ) *
      100;
  };

const money =
  (
    value:
      number
  ) => {
    if (
      value >=
      1_000_000
    ) {
      return `৳${(
        value /
        1_000_000
      ).toFixed(
        2
      )}M`;
    }

    if (
      value >=
      1_000
    ) {
      return `৳${(
        value /
        1_000
      ).toFixed(
        1
      )}K`;
    }

    return `৳${Math.round(
      value
    ).toLocaleString()}`;
  };

export const buildAnalyticsAlerts =
  ({
    overview,
    failedTransactions,
    failureGatewayCount,
  }: {
    overview:
      AnalyticsOverview;
    failedTransactions:
      number;
    failureGatewayCount:
      number;
  }):
    AnalyticsAlert[] => {
    const alerts:
      AnalyticsAlert[] = [];

    if (
      overview.highRiskExposure >=
      1_000_000
    ) {
      alerts.push({
        id:
          "risk-exposure",
        title:
          "High-value risk exposure needs monitoring",
        description:
          "High-risk transaction exposure is material in the selected analytics window.",
        level:
          overview.highRiskExposure >=
          5_000_000
            ? "critical"
            : "warning",
        metric:
          `${money(
            overview.highRiskExposure
          )} exposure`,
        action:
          "Review risk queue",
      });
    }

    if (
      overview.failedRate >=
      2
    ) {
      alerts.push({
        id:
          "failure-rate",
        title:
          "Transaction failure rate is elevated",
        description:
          "Failure rate is above the preferred operating threshold for the selected period.",
        level:
          overview.failedRate >=
          3.5
            ? "critical"
            : "warning",
        metric:
          `${overview.failedRate.toFixed(
            2
          )}% failed`,
        action:
          "Inspect failure trend",
      });
    }

    if (
      failureGatewayCount >
      0 &&
      failureGatewayCount >=
        Math.max(
          3,
          failedTransactions *
            0.25
        )
    ) {
      alerts.push({
        id:
          "gateway-cluster",
        title:
          "Gateway timeout concentration detected",
        description:
          "Gateway-related failures represent a meaningful share of failed transactions.",
        level:
          "warning",
        metric:
          `${failureGatewayCount.toLocaleString()} events`,
        action:
          "Inspect gateway health",
      });
    }

    if (
      overview.kycCompletion <
      85
    ) {
      alerts.push({
        id:
          "kyc-completion",
        title:
          "KYC completion has headroom",
        description:
          "A meaningful share of eligible customer accounts are not fully verified yet.",
        level:
          "info",
        metric:
          `${overview.kycCompletion.toFixed(
            1
          )}% verified`,
        action:
          "Review KYC funnel",
      });
    }

    if (
      alerts.length ===
      0
    ) {
      alerts.push({
        id:
          "healthy-window",
        title:
          "No major operating exception detected",
        description:
          "Current failure, risk and verification signals are inside the configured baseline.",
        level:
          "info",
        metric:
          "Healthy",
        action:
          "Continue monitoring",
      });
    }

    return alerts.slice(
      0,
      4
    );
  };

export const buildAnalyticsInsights =
  ({
    current,
    previous,
  }: {
    current:
      AnalyticsOverview;
    previous:
      AnalyticsOverview;
  }):
    AnalyticsInsight[] => {
    const volumeGrowth =
      percentChange(
        current.transactionVolume,
        previous.transactionVolume
      );

    const revenueGrowth =
      percentChange(
        current.platformRevenue,
        previous.platformRevenue
      );

    const userGrowth =
      percentChange(
        current.activeUsers,
        previous.activeUsers
      );

    const items:
      AnalyticsInsight[] = [];

    if (
      revenueGrowth >
      volumeGrowth +
        1
    ) {
      items.push({
        title:
          "Revenue outpaced transaction growth",
        body:
          "Platform fee revenue is growing faster than transaction volume, which indicates stronger revenue yield.",
        impact:
          `${(
            revenueGrowth -
            volumeGrowth
          ).toFixed(
            1
          )}pp yield advantage`,
        tone:
          "emerald",
      });
    } else {
      items.push({
        title:
          "Volume is leading revenue growth",
        body:
          "Transaction activity is expanding faster than fee revenue in this period.",
        impact:
          `${volumeGrowth.toFixed(
            1
          )}% volume change`,
        tone:
          "blue",
      });
    }

    items.push({
      title:
        "Liquidity remains measurable against cash-out pressure",
      body:
        "Stored wallet balance is compared with withdrawal activity to keep liquidity conditions explainable.",
      impact:
        `${money(
          current.walletBalance
        )} wallet liquidity`,
      tone:
        "blue",
    });

    if (
      current.kycCompletion <
      90
    ) {
      items.push({
        title:
          "KYC conversion still has headroom",
        body:
          "Verification completion is strong but a portion of eligible users remain outside the verified segment.",
        impact:
          `${(
            100 -
            current.kycCompletion
          ).toFixed(
            1
          )}% not verified`,
        tone:
          "amber",
      });
    } else {
      items.push({
        title:
          "KYC coverage is strong",
        body:
          "Most eligible customer accounts are already inside the verified customer base.",
        impact:
          `${current.kycCompletion.toFixed(
            1
          )}% verified`,
        tone:
          "emerald",
      });
    }

    items.push({
      title:
        current.highRiskExposure >
        0
          ? "Risk exposure is concentrated in a smaller segment"
          : "No high-risk financial exposure recorded",
      body:
        current.highRiskExposure >
        0
          ? "The risk view separates low, monitored and high-risk activity without classifying users solely by transaction size."
          : "No transaction in the selected window is currently classified as high risk by the transaction risk field.",
      impact:
        current.highRiskExposure >
        0
          ? `${money(
              current.highRiskExposure
            )} high-risk exposure`
          : `${userGrowth.toFixed(
              1
            )}% active-user change`,
      tone:
        current.highRiskExposure >
        0
          ? "rose"
          : "emerald",
    });

    return items.slice(
      0,
      4
    );
  };
