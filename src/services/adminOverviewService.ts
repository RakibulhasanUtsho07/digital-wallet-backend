import mongoose, { Types } from "mongoose";
import type {
  AdminOverviewResponse,
  AttentionQueueItem,
  OverviewMetric,
  OverviewRange,
  OverviewSeriesPoint,
  OverviewTransaction,
  ServiceHealthItem,
  TransactionStatusBreakdown,
} from "../types/adminOverview.js";

type AnyDoc = Record<string, any>;

const CACHE_TTL_MS = 45_000;
const cache = new Map<OverviewRange, { expiresAt: number; value: AdminOverviewResponse }>();

const RANGE_DAYS: Record<OverviewRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

export async function getAdminOverview(range: OverviewRange): Promise<AdminOverviewResponse> {
  const cached = cache.get(range);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected.");

  const days = RANGE_DAYS[range];
  const end = new Date();
  const start = startOfUtcDay(new Date(end.getTime() - (days - 1) * 86_400_000));
  const previousStart = new Date(start.getTime() - days * 86_400_000);

  const users = db.collection("users");
  const wallets = db.collection("wallets");
  const transactions = db.collection("transactions");
  const kycs = db.collection("kycs");
  const revenueEvents = db.collection("revenueevents");
  const securityEvents = db.collection("securityevents");
  const supportTickets = db.collection("supporttickets");
  const systemLogs = db.collection("systemlogs");

  const [
    totalUsers,
    previousUsers,
    activeWallets,
    previousActiveWallets,
    transactionTotals,
    revenueTotals,
    pendingKyc,
    previousPendingKyc,
    riskAlerts,
    previousRiskAlerts,
    transactionSeries,
    revenueSeries,
    statusRows,
    recentRows,
    openSupport,
    failedTransactions,
    healthRows,
  ] = await Promise.all([
    // In MongoDB `{ deletedAt: null }` matches both null and missing fields.
    // This counts every non-deleted current/legacy user correctly.
    users.countDocuments({
      accountStatus: { $ne: "deleted" },
      deletedAt: null,
    }),
    users.countDocuments({
      createdAt: { $lt: start },
      accountStatus: { $ne: "deleted" },
      deletedAt: null,
    }),
    wallets.countDocuments({ status: { $in: ["active", "ACTIVE"] } }),
    wallets.countDocuments({ createdAt: { $lt: start }, status: { $in: ["active", "ACTIVE"] } }),
    periodMoneyTotals(transactions, start, end, previousStart, ["completed", "success", "SUCCESS"]),
    periodMoneyTotals(revenueEvents, start, end, previousStart, ["completed", "success", "posted", "SUCCESS"]),
    kycs.countDocuments({ status: { $in: ["pending", "under_review", "submitted"] } }),
    kycs.countDocuments({ createdAt: { $lt: start }, status: { $in: ["pending", "under_review", "submitted"] } }),
    securityEvents.countDocuments({ severity: { $in: ["high", "critical", "HIGH", "CRITICAL"] }, $or: [{ resolvedAt: null }, { resolvedAt: { $exists: false } }] }),
    securityEvents.countDocuments({ createdAt: { $lt: start }, severity: { $in: ["high", "critical", "HIGH", "CRITICAL"] }, $or: [{ resolvedAt: null }, { resolvedAt: { $exists: false } }] }),
    dailyMoneySeries(transactions, start, end, true),
    dailyMoneySeries(revenueEvents, start, end, false),
    transactionStatusRows(transactions, start, end),
    transactions.find({ createdAt: { $gte: start, $lte: end } }).sort({ createdAt: -1 }).limit(8).toArray(),
    supportTickets.countDocuments({ status: { $in: ["open", "pending", "in_progress", "overdue"] } }),
    transactions.countDocuments({ createdAt: { $gte: start, $lte: end }, status: { $in: ["failed", "FAILED"] } }),
    systemLogs.find({ createdAt: { $gte: start, $lte: end } }).sort({ createdAt: -1 }).limit(300).toArray(),
  ]);

  const response: AdminOverviewResponse = {
    generatedAt: new Date().toISOString(),
    currency: "BDT",
    kpis: {
      totalUsers: metric(totalUsers, previousUsers),
      activeWallets: metric(activeWallets, previousActiveWallets),
      transactionVolume: metric(transactionTotals.current, transactionTotals.previous),
      platformRevenue: metric(revenueTotals.current, revenueTotals.previous),
      pendingKyc: metric(pendingKyc, previousPendingKyc),
      riskAlerts: metric(riskAlerts, previousRiskAlerts),
    },
    series: mergeDailySeries(start, days, transactionSeries, revenueSeries),
    transactionStatuses: normalizeStatusRows(statusRows),
    recentTransactions: recentRows.map(mapRecentTransaction),
    attentionQueue: buildAttentionQueue({ pendingKyc, riskAlerts, openSupport, failedTransactions }),
    serviceHealth: buildServiceHealth(healthRows),
  };

  cache.set(range, { expiresAt: Date.now() + CACHE_TTL_MS, value: response });
  return response;
}

export function clearAdminOverviewCache(): void {
  cache.clear();
}

export async function recordOverviewExport(actorId: string | undefined, range: OverviewRange): Promise<void> {
  if (!actorId || !mongoose.connection.db) return;
  const actor = Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : actorId;
  await mongoose.connection.db.collection("auditlogs").insertOne({
    actor,
    actorId: actor,
    action: "ADMIN_OVERVIEW_EXPORT",
    after: { range },
    createdAt: new Date(),
  });
}

export function overviewToCsv(data: AdminOverviewResponse): string {
  const rows: Array<Array<unknown>> = [
    ["section", "name", "value", "previousValue", "changePercent"],
    ...Object.entries(data.kpis).map(([name, value]) => [
      "kpi",
      name,
      value.value,
      value.previousValue,
      value.changePercent,
    ]),
    [],
    ["date", "volume", "transactions", "revenue"],
    ...data.series.map((point) => [point.date, point.volume, point.transactions, point.revenue]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

async function periodMoneyTotals(
  collection: any,
  start: Date,
  end: Date,
  previousStart: Date,
  completedStatuses: string[]
) {
  const result = await collection
    .aggregate([
      {
        $match: {
          createdAt: { $gte: previousStart, $lte: end },
          $or: [{ status: { $in: completedStatuses } }, { status: { $exists: false } }],
        },
      },
      {
        $group: {
          _id: null,
          current: {
            $sum: { $cond: [{ $gte: ["$createdAt", start] }, moneyMinorExpression(), 0] },
          },
          previous: {
            $sum: { $cond: [{ $lt: ["$createdAt", start] }, moneyMinorExpression(), 0] },
          },
        },
      },
    ])
    .toArray();
  return {
    current: minorToMajor(result[0]?.current),
    previous: minorToMajor(result[0]?.previous),
  };
}

async function dailyMoneySeries(collection: any, start: Date, end: Date, includeCount: boolean) {
  return collection
    .aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "UTC" } },
          amountMinor: { $sum: moneyMinorExpression() },
          count: { $sum: includeCount ? 1 : 0 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
}

async function transactionStatusRows(collection: any, start: Date, end: Date) {
  return collection
    .aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $toLower: { $ifNull: ["$status", "pending"] } },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();
}

function moneyMinorExpression() {
  return {
    $convert: {
      input: {
        $ifNull: [
          "$amountMinor",
          {
            $ifNull: [
              "$revenueMinor",
              {
                $ifNull: ["$feeMinor", { $multiply: [{ $ifNull: ["$amount", 0] }, 100] }],
              },
            ],
          },
        ],
      },
      to: "double",
      onError: 0,
      onNull: 0,
    },
  };
}

function mergeDailySeries(
  start: Date,
  days: number,
  transactionRows: AnyDoc[],
  revenueRows: AnyDoc[]
): OverviewSeriesPoint[] {
  const transactionMap = new Map(transactionRows.map((row) => [String(row._id), row]));
  const revenueMap = new Map(revenueRows.map((row) => [String(row._id), row]));
  const result: OverviewSeriesPoint[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
    const transaction = transactionMap.get(date);
    const revenue = revenueMap.get(date);
    result.push({
      date,
      volume: minorToMajor(transaction?.amountMinor),
      transactions: numberValue(transaction?.count),
      revenue: minorToMajor(revenue?.amountMinor),
    });
  }
  return result;
}

function normalizeStatusRows(rows: AnyDoc[]): TransactionStatusBreakdown[] {
  const counts: Record<TransactionStatusBreakdown["status"], number> = {
    completed: 0,
    pending: 0,
    failed: 0,
    reversed: 0,
  };
  for (const row of rows) {
    counts[normalizeStatus(row._id)] += numberValue(row.count);
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return (Object.entries(counts) as Array<[TransactionStatusBreakdown["status"], number]>).map(
    ([status, count]) => ({
      status,
      count,
      percentage: total ? round((count / total) * 100) : 0,
    })
  );
}

function mapRecentTransaction(row: AnyDoc): OverviewTransaction {
  return {
    id: stringValue(row._id ?? row.id),
    reference: stringValue(row.reference ?? row.transactionId ?? row._id),
    senderName: stringValue(row.senderName ?? row.sender?.name, "Sender"),
    receiverName: stringValue(row.receiverName ?? row.receiver?.name, "Receiver"),
    amount: minorToMajor(row.amountMinor ?? numberValue(row.amount) * 100),
    currency: stringValue(row.currency, "BDT"),
    status: normalizeStatus(row.status),
    createdAt: dateValue(row.createdAt),
  };
}

function buildAttentionQueue(input: {
  pendingKyc: number;
  riskAlerts: number;
  openSupport: number;
  failedTransactions: number;
}): AttentionQueueItem[] {
  return [
    {
      id: "kyc",
      type: "kyc",
      title: "Pending KYC",
      description: "Identity reviews waiting for a decision",
      count: input.pendingKyc,
      href: "/dashboard/kyc-requests",
      severity: "medium",
    },
    {
      id: "risk",
      type: "risk",
      title: "Risk alerts",
      description: "Unresolved high-risk security events",
      count: input.riskAlerts,
      href: "/dashboard/security",
      severity: "high",
    },
    {
      id: "support",
      type: "support",
      title: "Open support",
      description: "Support tickets requiring attention",
      count: input.openSupport,
      href: "/dashboard/support",
      severity: "medium",
    },
    {
      id: "transaction",
      type: "transaction",
      title: "Failed transactions",
      description: "Failed transactions in the selected range",
      count: input.failedTransactions,
      href: "/dashboard/all-transactions",
      severity: "high",
    },
  ].filter((item) => item.count > 0) as AttentionQueueItem[];
}

function buildServiceHealth(rows: AnyDoc[]): ServiceHealthItem[] {
  const groups = new Map<string, { total: number; errors: number; latency: number }>();
  for (const row of rows) {
    const name = stringValue(row.service ?? row.source ?? row.module, "API");
    const current = groups.get(name) ?? { total: 0, errors: 0, latency: 0 };
    current.total += 1;
    if (["error", "fatal", "critical"].includes(String(row.level ?? row.severity).toLowerCase())) {
      current.errors += 1;
    }
    current.latency += numberValue(row.latencyMs ?? row.durationMs);
    groups.set(name, current);
  }
  return [...groups.entries()].slice(0, 6).map(([name, value]) => {
    const errorRate = value.total ? value.errors / value.total : 0;
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      status: errorRate >= 0.25 ? "down" : errorRate >= 0.05 ? "degraded" : "operational",
      uptimePercent: round((1 - errorRate) * 100),
      latencyMs: value.total ? Math.round(value.latency / value.total) : 0,
    } as ServiceHealthItem;
  });
}

function metric(value: number, previousValue: number): OverviewMetric {
  return { value, previousValue, changePercent: percentChange(value, previousValue) };
}

function percentChange(value: number, previousValue: number): number {
  if (value === 0 && previousValue === 0) return 0;
  if (previousValue === 0) return 100;
  return round(((value - previousValue) / Math.abs(previousValue)) * 100);
}

function normalizeStatus(value: unknown): TransactionStatusBreakdown["status"] {
  const status = String(value ?? "pending").toLowerCase();
  if (["completed", "success", "successful", "paid"].includes(status)) return "completed";
  if (["failed", "cancelled", "canceled", "declined"].includes(status)) return "failed";
  if (["reversed", "refunded"].includes(status)) return "reversed";
  return "pending";
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
function minorToMajor(value: unknown): number {
  return round(numberValue(value) / 100);
}
function numberValue(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}
function stringValue(value: unknown, fallback = ""): string {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}
function dateValue(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
