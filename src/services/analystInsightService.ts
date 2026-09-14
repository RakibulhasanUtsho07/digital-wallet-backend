import type {
  AnalystInsight,
  AnalystInsightInput,
  AnalystInsightSeverity,
  AnalystSystemStatus,
} from "../types/analystTypes.js";

const severityWeight: Record<
  AnalystInsightSeverity,
  number
> = {
  critical: 5,
  high: 4,
  medium: 3,
  info: 2,
  positive: 1,
};

function percent(
  numerator: number,
  denominator: number
): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number(
    (
      (numerator /
        denominator) *
      100
    ).toFixed(2)
  );
}

function changePercent(
  current: number,
  previous: number
): number | null {
  if (previous === 0) {
    return current === 0
      ? 0
      : null;
  }

  return Number(
    (
      ((current - previous) /
        Math.abs(previous)) *
      100
    ).toFixed(2)
  );
}

function latestZScore(
  values: number[]
): number | null {
  if (values.length < 4) {
    return null;
  }

  const latest =
    values[values.length - 1];

  const baseline =
    values.slice(0, -1);

  const mean =
    baseline.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / baseline.length;

  const variance =
    baseline.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - mean,
          2
        ),
      0
    ) / baseline.length;

  const standardDeviation =
    Math.sqrt(variance);

  if (
    standardDeviation === 0
  ) {
    return null;
  }

  return (
    latest - mean
  ) / standardDeviation;
}

export function buildAnalystInsights(
  input: AnalystInsightInput
): AnalystInsight[] {
  const insights:
    AnalystInsight[] = [];

  const failureRate =
    percent(
      input.failedPaymentCount,
      input.paymentCount
    );

  const refundRate =
    percent(
      input.refundAmountMinor,
      input.paymentVolumeMinor
    );

  const disputeExposureRate =
    percent(
      input.disputeExposureMinor,
      input.paymentVolumeMinor
    );

  const highRiskRate =
    percent(
      input.highRiskTransactionCount,
      input.transactionCount
    );

  const transactionFailureRate =
    percent(
      input.failedTransactionCount,
      input.transactionCount
    );

  const successRateDelta =
    Number(
      (
        input.successRate -
        input.previousSuccessRate
      ).toFixed(2)
    );

  const volumeChange =
    changePercent(
      input.paymentVolumeMinor,
      input.previousPaymentVolumeMinor
    );

  const revenueChange =
    changePercent(
      input.feeRevenueMinor,
      input.previousFeeRevenueMinor
    );

  if (
    input.paymentCount > 0 &&
    input.successRate < 85
  ) {
    insights.push({
      id:
        "payment-success-critical",
      severity:
        "critical",
      category:
        "payments",
      title:
        "Payment success rate is critically low",
      description:
        "A significant share of initiated payments is not reaching completed status.",
      evidence:
        `Success rate is ${input.successRate.toFixed(2)}% and failure rate is ${failureRate.toFixed(2)}%.`,
      recommendedAction:
        "Review provider errors, risk blocks, and checkout failures before changing any payment configuration.",
    });
  } else if (
    input.paymentCount > 0 &&
    input.successRate < 93
  ) {
    insights.push({
      id:
        "payment-success-warning",
      severity:
        "high",
      category:
        "payments",
      title:
        "Payment conversion needs attention",
      description:
        "Completed payments are below the platform's healthy operational threshold.",
      evidence:
        `Current success rate is ${input.successRate.toFixed(2)}%.`,
      recommendedAction:
        "Compare providers and failure codes to identify the largest conversion loss.",
    });
  }

  if (
    highRiskRate >= 5 &&
    input.transactionCount >= 10
  ) {
    insights.push({
      id:
        "high-risk-transaction-share",
      severity:
        highRiskRate >= 10
          ? "critical"
          : "high",
      category:
        "risk",
      title:
        "High-risk transaction share increased",
      description:
        "The proportion of transactions classified as high risk is above the monitoring threshold.",
      evidence:
        `${input.highRiskTransactionCount} of ${input.transactionCount} transactions are high risk (${highRiskRate.toFixed(2)}%).`,
      recommendedAction:
        "Open the risk dashboard and review aggregate patterns; analysts must not approve or block transactions directly.",
    });
  }

  if (
    transactionFailureRate >= 5 &&
    input.transactionCount >= 10
  ) {
    insights.push({
      id:
        "wallet-transaction-failures",
      severity:
        transactionFailureRate >= 15
          ? "high"
          : "medium",
      category:
        "payments",
      title:
        "Wallet transaction failures are elevated",
      description:
        "Failed transfers, deposits, or withdrawals exceed the monitoring threshold.",
      evidence:
        `${input.failedTransactionCount} of ${input.transactionCount} wallet transactions failed (${transactionFailureRate.toFixed(2)}%).`,
      recommendedAction:
        "Compare transaction type and operational error patterns without decrypting stored amounts or references.",
    });
  }

  if (
    input.paymentCount > 0 &&
    successRateDelta <= -8
  ) {
    insights.push({
      id:
        "payment-success-rate-drop",
      severity:
        successRateDelta <= -15
          ? "high"
          : "medium",
      category:
        "payments",
      title:
        "Payment success rate dropped",
      description:
        "Conversion declined materially against the previous equivalent period.",
      evidence:
        `Success rate changed by ${successRateDelta.toFixed(2)} percentage points.`,
      recommendedAction:
        "Review provider and failure-code movement between the two periods.",
    });
  }

  if (
    refundRate >= 5 &&
    input.paymentVolumeMinor > 0
  ) {
    insights.push({
      id:
        "refund-rate-elevated",
      severity:
        refundRate >= 10
          ? "high"
          : "medium",
      category:
        "refunds",
      title:
        "Refund value is elevated",
      description:
        "Completed refund value is high compared with completed payment volume in the selected period.",
      evidence:
        `Refund value equals ${refundRate.toFixed(2)}% of completed payment volume.`,
      recommendedAction:
        "Segment refunds by merchant and reason before escalating the pattern to operations.",
    });
  }

  if (
    input.openDisputeCount > 0 &&
    disputeExposureRate >= 2
  ) {
    insights.push({
      id:
        "dispute-exposure-elevated",
      severity:
        disputeExposureRate >= 5
          ? "high"
          : "medium",
      category:
        "disputes",
      title:
        "Open dispute exposure is elevated",
      description:
        "Unresolved disputes represent a material share of processed payment value.",
      evidence:
        `${input.openDisputeCount} open disputes represent ${disputeExposureRate.toFixed(2)}% of payment volume.`,
      recommendedAction:
        "Review dispute age, merchant concentration, and reason distribution with the operations team.",
    });
  }

  if (
    revenueChange !== null &&
    revenueChange <= -20
  ) {
    insights.push({
      id:
        "fee-revenue-decline",
      severity:
        revenueChange <= -40
          ? "high"
          : "medium",
      category:
        "revenue",
      title:
        "Payment fee revenue declined",
      description:
        "Fee revenue from completed merchant payments is lower than the preceding equivalent period.",
      evidence:
        `Revenue changed by ${revenueChange.toFixed(2)}%.`,
      recommendedAction:
        "Check whether the decline comes from lower volume, provider mix, or fee configuration changes.",
    });
  }

  const volumeZScore =
    latestZScore(
      input.trend.map(
        (point) =>
          point.volumeMinor
      )
    );

  if (
    volumeZScore !== null &&
    Math.abs(volumeZScore) >= 2
  ) {
    const isSpike =
      volumeZScore > 0;

    insights.push({
      id:
        isSpike
          ? "volume-spike"
          : "volume-drop",
      severity:
        Math.abs(volumeZScore) >= 3
          ? "high"
          : "medium",
      category:
        "payments",
      title:
        isSpike
          ? "Unusual payment-volume spike detected"
          : "Unusual payment-volume drop detected",
      description:
        "The latest time bucket differs materially from the preceding baseline.",
      evidence:
        `Latest volume z-score is ${volumeZScore.toFixed(2)}.`,
      recommendedAction:
        "Validate the pattern against provider, merchant, and failure breakdowns before escalating it.",
    });
  }

  if (
    input.revenueUnclassifiedEventCount > 0
  ) {
    insights.push({
      id:
        "revenue-metadata-coverage",
      severity:
        "info",
      category:
        "data_quality",
      title:
        "Some revenue events lack reporting dimensions",
      description:
        "Revenue events without currency or environment metadata are excluded from the classified ledger metric.",
      evidence:
        `${input.revenueUnclassifiedEventCount} revenue events are unclassified for the selected filter.`,
      recommendedAction:
        "Ensure revenue event hooks write currency and mode into metadata for future events.",
    });
  }

  if (
    input.paymentCount > 0 &&
    input.successRate >= 97 &&
    highRiskRate < 2
  ) {
    insights.push({
      id:
        "healthy-payment-performance",
      severity:
        "positive",
      category:
        "payments",
      title:
        "Payment performance is healthy",
      description:
        "Conversion is strong while the high-risk transaction share remains controlled.",
      evidence:
        `Success rate is ${input.successRate.toFixed(2)}% and high-risk share is ${highRiskRate.toFixed(2)}%.`,
      recommendedAction:
        "Continue monitoring provider and merchant concentration for changes.",
    });
  }

  if (
    volumeChange !== null &&
    volumeChange >= 20
  ) {
    insights.push({
      id:
        "payment-volume-growth",
      severity:
        "positive",
      category:
        "growth",
      title:
        "Payment volume is growing",
      description:
        "Completed payment volume increased against the previous equivalent period.",
      evidence:
        `Volume changed by ${volumeChange.toFixed(2)}%.`,
      recommendedAction:
        "Review whether growth is diversified across merchants and providers.",
    });
  }

  if (
    insights.length === 0
  ) {
    insights.push({
      id:
        "insufficient-signal",
      severity:
        "info",
      category:
        "data_quality",
      title:
        "No material anomaly detected",
      description:
        "Current deterministic rules did not identify a strong operational signal in the selected period.",
      evidence:
        `${input.paymentCount} payments and ${input.transactionCount} wallet transactions were evaluated.`,
      recommendedAction:
        "Keep monitoring as more real platform activity is recorded.",
    });
  }

  return insights
    .sort(
      (first, second) =>
        severityWeight[
          second.severity
        ] -
        severityWeight[
          first.severity
        ]
    )
    .slice(0, 8);
}

export function getAnalystSystemStatus(
  insights: AnalystInsight[]
): AnalystSystemStatus {
  if (
    insights.some(
      (insight) =>
        insight.severity ===
        "critical"
    )
  ) {
    return "critical";
  }

  if (
    insights.some(
      (insight) =>
        insight.severity ===
          "high" ||
        insight.severity ===
          "medium"
    )
  ) {
    return "attention";
  }

  return "healthy";
}
