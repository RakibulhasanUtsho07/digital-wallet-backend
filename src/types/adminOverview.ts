export type OverviewRange = "7d" | "30d" | "90d" | "1y";

export interface OverviewMetric {
  value: number;
  previousValue: number;
  changePercent: number;
}

export interface OverviewSeriesPoint {
  date: string;
  volume: number;
  transactions: number;
  revenue: number;
}

export interface TransactionStatusBreakdown {
  status: "completed" | "pending" | "failed" | "reversed";
  count: number;
  percentage: number;
}

export interface OverviewTransaction {
  id: string;
  reference: string;
  senderName: string;
  receiverName: string;
  amount: number;
  currency: string;
  status: TransactionStatusBreakdown["status"];
  createdAt: string;
}

export interface AttentionQueueItem {
  id: string;
  type: "kyc" | "risk" | "support" | "transaction";
  title: string;
  description: string;
  count: number;
  href: string;
  severity: "low" | "medium" | "high";
}

export interface ServiceHealthItem {
  id: string;
  name: string;
  status: "operational" | "degraded" | "down";
  uptimePercent: number;
  latencyMs: number;
}

export interface AdminOverviewResponse {
  generatedAt: string;
  currency: string;
  kpis: {
    totalUsers: OverviewMetric;
    activeWallets: OverviewMetric;
    transactionVolume: OverviewMetric;
    platformRevenue: OverviewMetric;
    pendingKyc: OverviewMetric;
    riskAlerts: OverviewMetric;
  };
  series: OverviewSeriesPoint[];
  transactionStatuses: TransactionStatusBreakdown[];
  recentTransactions: OverviewTransaction[];
  attentionQueue: AttentionQueueItem[];
  serviceHealth: ServiceHealthItem[];
}

