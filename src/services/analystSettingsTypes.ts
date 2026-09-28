export type AnalystSettingsSection =
  | "general"
  | "dataScope"
  | "providerMonitoring"
  | "alerts"
  | "risk"
  | "anomalies"
  | "reports"
  | "aiInsights"
  | "export"
  | "appearance";

export type AnalystSettingsRange = "24h" | "7d" | "30d" | "90d";
export type AnalystSettingsMode = "all" | "test" | "live";
export type AnalystSettingsRiskSource = "all" | "wallet" | "card" | "paypal" | "local_psp";
export type AnalystSettingsReportFormat = "executive" | "payments" | "risk" | "revenue";
export type AnalystSettingsInsightSeverity = "critical" | "high" | "medium" | "info" | "positive";

export interface AnalystSettingsPayload {
  general: {
    defaultRange: AnalystSettingsRange;
    defaultMode: AnalystSettingsMode;
    currency: string;
    timezone: string;
    autoRefreshSeconds: number;
  };
  dataScope: {
    provider: string;
    riskSource: AnalystSettingsRiskSource;
  };
  providerMonitoring: {
    warningSuccessRate: number;
    criticalSuccessRate: number;
    maxAverageCompletionSeconds: number;
  };
  alerts: {
    enabled: boolean;
    critical: boolean;
    high: boolean;
    medium: boolean;
    info: boolean;
    positive: boolean;
  };
  risk: {
    highRiskRateWarning: number;
    paymentFailureRateWarning: number;
    disputeExposureRateWarning: number;
  };
  anomalies: {
    enabled: boolean;
    sensitivity: "low" | "medium" | "high";
    baselineDays: number;
    minimumSampleSize: number;
  };
  reports: {
    defaultFormat: AnalystSettingsReportFormat;
    defaultRange: AnalystSettingsRange;
    defaultMode: AnalystSettingsMode;
  };
  aiInsights: {
    enabled: boolean;
    minimumSeverity: AnalystSettingsInsightSeverity;
    showRecommendedActions: boolean;
  };
  export: {
    defaultFormat: "csv";
    fileNamePrefix: string;
  };
  appearance: {
    density: "comfortable" | "compact";
    animations: boolean;
    chartMotion: boolean;
  };
}
