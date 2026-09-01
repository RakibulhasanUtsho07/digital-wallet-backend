export type AnalyticsRange =
  | "Today"
  | "7D"
  | "30D"
  | "90D"
  | "1Y";

export type AnalyticsTrend =
  | "up"
  | "down"
  | "flat";

export type AnalyticsTone =
  | "blue"
  | "cyan"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "slate";

export interface AnalyticsOverview {
  transactionVolume: number;
  transactionCount: number;
  activeUsers: number;
  walletBalance: number;
  kycCompletion: number;
  platformRevenue: number;
  failedRate: number;
  highRiskExposure: number;
  avgTransactionValue: number;
  merchantShare: number;
  retentionRate: number;
  disputeRate: number;
}

export interface AnalyticsPulseMetric {
  id: string;
  label: string;
  score: number;
  trend: AnalyticsTrend;
}

export interface AnalyticsSeriesPoint {
  label: string;
  volume: number;
  revenue: number;
  failures: number;
}

export interface AnalyticsBreakdownItem {
  label: string;
  value: number;
  helper?: string;
  tone: AnalyticsTone;
}

export interface AnalyticsRiskCell {
  label: string;
  count: number;
  amount: number;
  severity:
    | "Low"
    | "Moderate"
    | "High"
    | "Critical";
}

export interface AnalyticsAlert {
  id: string;
  title: string;
  description: string;
  level:
    | "info"
    | "warning"
    | "critical";
  metric: string;
  action: string;
}

export interface AnalyticsInsight {
  title: string;
  body: string;
  impact: string;
  tone: AnalyticsTone;
}

export interface AnalyticsDashboardData {
  range: AnalyticsRange;
  generatedAt: string;
  overview: AnalyticsOverview;
  pulse: AnalyticsPulseMetric[];
  series: AnalyticsSeriesPoint[];
  channels: AnalyticsBreakdownItem[];
  failureReasons: AnalyticsBreakdownItem[];
  geography: AnalyticsBreakdownItem[];
  riskMatrix: AnalyticsRiskCell[];
  alerts: AnalyticsAlert[];
  insights: AnalyticsInsight[];
}

export type AnalyticsReportFormat =
  | "summary"
  | "executive"
  | "risk";

export type AnalyticsReportStatus =
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export interface AnalyticsDateWindow {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}
