/* =========================================================
   ANALYST SHARED TYPES
========================================================= */

export type AnalystRange =
  | "24h"
  | "7d"
  | "30d"
  | "90d";

export type AnalystMode =
  | "all"
  | "test"
  | "live";

export type AnalystBucket =
  | "hour"
  | "day";

export type AnalystInsightSeverity =
  | "critical"
  | "high"
  | "medium"
  | "info"
  | "positive";

export type AnalystSystemStatus =
  | "critical"
  | "attention"
  | "healthy";

export type AnalystInsightCategory =
  | "payments"
  | "revenue"
  | "refunds"
  | "disputes"
  | "risk"
  | "growth"
  | "data_quality";

/* =========================================================
   DATE FILTERS
========================================================= */

export interface AnalystDateFilters {
  range: AnalystRange;
  mode: AnalystMode;
  currency: string;
  bucket: AnalystBucket;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
}

/* =========================================================
   METRIC
========================================================= */

export interface AnalystMetric {
  value: number;
  previousValue: number;
  changePercent: number | null;
}

/* =========================================================
   TREND
========================================================= */

export interface AnalystTrendPoint {
  bucket: string;
  paymentCount: number;
  completedCount: number;
  failedCount: number;
  volumeMinor: number;
  feeRevenueMinor: number;
  successRate: number;
}

/* =========================================================
   BREAKDOWN
========================================================= */

export interface AnalystBreakdownItem {
  key: string;
  label: string;
  count: number;
  percentage: number;
  volumeMinor?: number;
}

/* =========================================================
   INSIGHT
========================================================= */

export interface AnalystInsight {
  id: string;
  severity: AnalystInsightSeverity;
  category: AnalystInsightCategory;
  title: string;
  description: string;
  evidence: string;
  recommendedAction: string;
}

/* =========================================================
   INSIGHT ENGINE INPUT
========================================================= */

export interface AnalystInsightInput {
  paymentCount: number;
  failedPaymentCount: number;
  successRate: number;
  previousSuccessRate: number;
  paymentVolumeMinor: number;
  previousPaymentVolumeMinor: number;
  feeRevenueMinor: number;
  previousFeeRevenueMinor: number;
  refundAmountMinor: number;
  disputeExposureMinor: number;
  openDisputeCount: number;
  transactionCount: number;
  failedTransactionCount: number;
  highRiskTransactionCount: number;
  trend: AnalystTrendPoint[];
  revenueUnclassifiedEventCount: number;
}

/* =========================================================
   ANALYST OVERVIEW
========================================================= */

export interface AnalystOverviewData {
  generatedAt: string;

  intelligenceEngine: {
    type: "deterministic_rules";
    paidProviderUsed: false;
    version: string;
  };

  filters: {
    range: AnalystRange;
    mode: AnalystMode;
    currency: string;
    bucket: AnalystBucket;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };

  freshness: {
    liveCollectionsReadAt: string;
    latestDailyFactGeneratedAt: string | null;
    dailyFactDaysCovered: number;
  };

  status: AnalystSystemStatus;

  metrics: {
    paymentVolumeMinor: AnalystMetric;
    netPaymentVolumeMinor: AnalystMetric;
    paymentCount: AnalystMetric;
    completedPaymentCount: AnalystMetric;
    successRate: AnalystMetric;
    paymentFeeRevenueMinor: AnalystMetric;
    refundAmountMinor: AnalystMetric;
    openDisputeExposureMinor: AnalystMetric;
    walletTransactionCount: AnalystMetric;
  };

  accounts: {
    activeUsers: number;
    newUsers: number;
    kycVerifiedUsers: number;
    totalMerchants: number;
    activeMerchants: number;
    verifiedMerchants: number;
    liveEnabledMerchants: number;
  };

  operations: {
    failedPaymentCount: number;
    pendingPaymentCount: number;
    refundCount: number;
    openDisputeCount: number;
    failedTransactionCount: number;
    highRiskTransactionCount: number;
    walletTransactionVolumeMinor: number;
  };

  executive: {
    paymentFailureRate: number;
    pendingPaymentCount: number;
    refundRate: number;
    disputeExposureRate: number;
    highRiskTransactionRate: number;
    walletTransactionFailureRate: number;
    merchantActivationRate: number;
    merchantVerificationRate: number;
    merchantLiveReadinessRate: number;
  };

  merchantHealth: {
    totalMerchants: number;
    activeMerchants: number;
    verifiedMerchants: number;
    liveEnabledMerchants: number;
    activationRate: number;
    verificationRate: number;
    liveReadinessRate: number;
  };

  riskSummary: {
    highRiskTransactionCount: number;
    highRiskTransactionRate: number;
    failedPaymentCount: number;
    paymentFailureRate: number;
    refundAmountMinor: number;
    refundRate: number;
    openDisputeCount: number;
    openDisputeExposureMinor: number;
    disputeExposureRate: number;
  };

  revenueLedger: {
    classifiedNetRevenueMinor: number;
    classifiedEventCount: number;
    unclassifiedEventCount: number;
    note: string;
  };

  trend: AnalystTrendPoint[];
  paymentStatus: AnalystBreakdownItem[];
  providers: AnalystBreakdownItem[];
  transactionRisk: AnalystBreakdownItem[];
  insights: AnalystInsight[];
}

/* =========================================================
   INTELLIGENCE FILTERS
========================================================= */

export type AnalystIntelligenceSeverityFilter =
  | "all"
  | AnalystInsightSeverity;

export type AnalystIntelligenceCategoryFilter =
  | "all"
  | AnalystInsightCategory;

export interface AnalystIntelligenceFilters {
  severity: AnalystIntelligenceSeverityFilter;
  category: AnalystIntelligenceCategoryFilter;
}

/* =========================================================
   INTELLIGENCE TIMELINE
========================================================= */

export interface AnalystIntelligenceTimelinePoint {
  bucket: string;
  paymentCount: number;
  failedCount: number;
  volumeMinor: number;
  successRate: number;
  failureRate: number;
  volumeChangePercent: number | null;
  pressureScore: number;
  status: AnalystSystemStatus;
}

/* =========================================================
   INTELLIGENCE CATEGORY BREAKDOWN
========================================================= */

export interface AnalystIntelligenceCategoryBreakdown {
  category: AnalystInsightCategory;
  count: number;
  percentage: number;
  highestSeverity: AnalystInsightSeverity | null;
}

/* =========================================================
   INTELLIGENCE RESPONSE
========================================================= */

export interface AnalystIntelligenceData {
  generatedAt: string;
  source: "analyst_overview_aggregation";

  engine: {
    type: "deterministic_rules";
    version: string;
    paidProviderUsed: false;
    localModelUsed: false;
    explanation: string;
  };

  filters: {
    range: AnalystRange;
    mode: AnalystMode;
    currency: string;
    bucket: AnalystBucket;
    from: string;
    to: string;
    severity: AnalystIntelligenceSeverityFilter;
    category: AnalystIntelligenceCategoryFilter;
  };

  status: AnalystSystemStatus;

  summary: {
    factsEvaluated: number;
    totalSignals: number;
    matchedSignals: number;
    criticalSignals: number;
    attentionSignals: number;
    positiveSignals: number;
    dataQualitySignals: number;
  };

  baseline: {
    paymentCount: number;
    walletTransactionCount: number;
    paymentVolumeMinor: number;
    feeRevenueMinor: number;
    refundAmountMinor: number;
    openDisputeExposureMinor: number;
    highRiskTransactionCount: number;
    failedPaymentCount: number;
    successRate: number;
  };

  categories: AnalystIntelligenceCategoryBreakdown[];
  timeline: AnalystIntelligenceTimelinePoint[];
  insights: AnalystInsight[];
  anomalies: AnalystInsight[];
}
                  