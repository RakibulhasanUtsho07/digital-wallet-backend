import { LedgerEntry } from "../models/LedgerEntry.js";
import { Merchant } from "../models/Merchant.js";
import { Payout, type PayoutStatus } from "../models/Payout.js";
import type { AnalystDateFilters, AnalystMetric } from "../types/analystTypes.js";

export type AnalystPayoutStatus = "all" | PayoutStatus;

export interface AnalystPayoutInsight {
  id: string;
  severity: "critical" | "high" | "medium" | "info" | "positive";
  category: "reliability" | "latency" | "ledger" | "merchant" | "data_quality";
  title: string;
  description: string;
  evidence: string;
  recommendedReview: string;
}

export interface AnalystPayoutAnalyticsData {
  generatedAt: string;
  source: { payouts: "mongodb_payout_collection"; ledger: "mongodb_ledger_entry_collection" };
  scopeNote: string;
  filters: {
    range: AnalystDateFilters["range"];
    currency: string;
    status: AnalystPayoutStatus;
    bucket: AnalystDateFilters["bucket"];
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  metrics: {
    payoutCount: AnalystMetric;
    totalAmountMinor: AnalystMetric;
    completedNetAmountMinor: AnalystMetric;
    pendingAmountMinor: AnalystMetric;
    completionRate: AnalystMetric;
    failureRate: AnalystMetric;
    averageCompletionSeconds: AnalystMetric;
    ledgerCoverageRate: AnalystMetric;
  };
  operations: { pendingCount: number; processingCount: number; completedCount: number; failedCount: number; cancelledCount: number };
  ledger: { completedPayoutCount: number; withLedgerGroupCount: number; missingLedgerGroupCount: number; balancedLedgerGroupCount: number; unbalancedLedgerGroupCount: number; coverageRate: number };
  trend: Array<{ bucket: string; payoutCount: number; completedCount: number; failedCount: number; pendingCount: number; processingCount: number; netAmountMinor: number }>;
  statuses: Array<{ status: string; count: number; percentage: number; netAmountMinor: number }>;
  methods: Array<{ method: string; count: number; percentage: number; netAmountMinor: number; completionRate: number }>;
  failureReasons: Array<{ reason: string; count: number; percentage: number }>;
  merchants: Array<{ merchantId: string; businessName: string; payoutCount: number; completedCount: number; failedCount: number; netAmountMinor: number; netShare: number; completionRate: number }>;
  insights: AnalystPayoutInsight[];
}

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const i = (v: unknown) => Math.max(0, Math.round(n(v)));
const r = (v: number) => Number(v.toFixed(2));
const pct = (a: number, b: number) => b > 0 ? r((a / b) * 100) : 0;
const change = (a: number, b: number): number | null => b === 0 ? (a === 0 ? 0 : null) : r(((a - b) / Math.abs(b)) * 100);
const metric = (a: number, b: number): AnalystMetric => ({ value: r(a), previousValue: r(b), changePercent: change(a, b) });
const text = (v: unknown, fallback = "unknown") => typeof v === "string" && v.trim() ? v.trim() : (v == null ? fallback : String(v));

const decimalToMinor = (field: string) => ({
  $convert: {
    input: { $round: [{ $multiply: [{ $convert: { input: field, to: "double", onError: 0, onNull: 0 } }, 100] }, 0] },
    to: "long", onError: 0, onNull: 0,
  },
});

function match(filters: AnalystDateFilters, status: AnalystPayoutStatus, from: Date, to: Date): Record<string, unknown> {
  const result: Record<string, unknown> = { createdAt: { $gte: from, $lt: to }, currency: filters.currency };
  if (status !== "all") result.status = status;
  return result;
}

async function summary(m: Record<string, unknown>) {
  const [row] = await Payout.aggregate([
    { $match: m },
    { $addFields: {
      amountMinorValue: decimalToMinor("$amount"),
      netMinorValue: decimalToMinor("$netAmount"),
      completionSeconds: { $cond: [
        { $and: [{ $eq: ["$status", "completed"] }, { $ne: [{ $ifNull: ["$completedAt", null] }, null] }] },
        { $divide: [{ $subtract: ["$completedAt", "$requestedAt"] }, 1000] }, null,
      ] },
    } },
    { $group: {
      _id: null,
      payoutCount: { $sum: 1 },
      pendingCount: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
      processingCount: { $sum: { $cond: [{ $eq: ["$status", "processing"] }, 1, 0] } },
      completedCount: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
      failedCount: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
      cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
      totalAmountMinor: { $sum: "$amountMinorValue" },
      completedNetAmountMinor: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$netMinorValue", 0] } },
      pendingAmountMinor: { $sum: { $cond: [{ $in: ["$status", ["pending", "processing"]] }, "$netMinorValue", 0] } },
      averageCompletionSeconds: { $avg: "$completionSeconds" },
    } },
  ]);
  return {
    payoutCount: i(row?.payoutCount), pendingCount: i(row?.pendingCount), processingCount: i(row?.processingCount),
    completedCount: i(row?.completedCount), failedCount: i(row?.failedCount), cancelledCount: i(row?.cancelledCount),
    totalAmountMinor: i(row?.totalAmountMinor), completedNetAmountMinor: i(row?.completedNetAmountMinor), pendingAmountMinor: i(row?.pendingAmountMinor),
    averageCompletionSeconds: r(n(row?.averageCompletionSeconds)),
  };
}

function bucketCount(range: AnalystDateFilters["range"]) { return range === "24h" ? 24 : range === "7d" ? 7 : range === "30d" ? 30 : 90; }
function bucketKeys(filters: AnalystDateFilters) {
  const count = bucketCount(filters.range);
  const end = new Date(filters.to);
  if (filters.bucket === "hour") end.setUTCMinutes(0, 0, 0); else end.setUTCHours(0, 0, 0, 0);
  const step = filters.bucket === "hour" ? 3600000 : 86400000;
  return Array.from({ length: count }, (_, idx) => new Date(end.getTime() - (count - 1 - idx) * step).toISOString());
}

async function trend(m: Record<string, unknown>, filters: AnalystDateFilters) {
  const rows = await Payout.aggregate([
    { $match: m },
    { $addFields: { netMinorValue: decimalToMinor("$netAmount") } },
    { $group: {
      _id: { $dateTrunc: { date: "$createdAt", unit: filters.bucket, timezone: "UTC" } },
      payoutCount: { $sum: 1 },
      completedCount: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
      failedCount: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
      pendingCount: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
      processingCount: { $sum: { $cond: [{ $eq: ["$status", "processing"] }, 1, 0] } },
      netAmountMinor: { $sum: "$netMinorValue" },
    } }, { $sort: { _id: 1 } },
  ]);
  const map = new Map<string, any>();
  for (const row of rows) { const d = new Date(String(row._id)); if (!Number.isNaN(d.getTime())) map.set(d.toISOString(), row); }
  return bucketKeys(filters).map(bucket => {
    const row = map.get(bucket);
    return { bucket, payoutCount: i(row?.payoutCount), completedCount: i(row?.completedCount), failedCount: i(row?.failedCount), pendingCount: i(row?.pendingCount), processingCount: i(row?.processingCount), netAmountMinor: i(row?.netAmountMinor) };
  });
}

async function breakdown(m: Record<string, unknown>, field: "status" | "payoutMethod") {
  const rows = await Payout.aggregate([
    { $match: m }, { $addFields: { netMinorValue: decimalToMinor("$netAmount") } },
    { $group: { _id: `$${field}`, count: { $sum: 1 }, completedCount: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }, netAmountMinor: { $sum: "$netMinorValue" } } },
    { $sort: { count: -1 } },
  ]);
  const total = rows.reduce((s, row) => s + i(row.count), 0);
  return rows.map(row => ({ key: text(row._id), count: i(row.count), completedCount: i(row.completedCount), netAmountMinor: i(row.netAmountMinor), percentage: pct(i(row.count), total) }));
}

async function failures(m: Record<string, unknown>) {
  const rows = await Payout.aggregate([
    { $match: { ...m, status: "failed" } },
    { $group: { _id: { $cond: [{ $and: [{ $ne: ["$failureReason", null] }, { $ne: ["$failureReason", ""] }] }, "$failureReason", "unspecified"] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } }, { $limit: 10 },
  ]);
  const total = rows.reduce((s, row) => s + i(row.count), 0);
  return rows.map(row => ({ reason: text(row._id), count: i(row.count), percentage: pct(i(row.count), total) }));
}

async function merchants(m: Record<string, unknown>, totalNetMinor: number) {
  const rows = await Payout.aggregate([
    { $match: m }, { $addFields: { netMinorValue: decimalToMinor("$netAmount") } },
    { $group: { _id: "$merchantId", payoutCount: { $sum: 1 }, completedCount: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }, failedCount: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } }, netAmountMinor: { $sum: "$netMinorValue" } } },
    { $lookup: { from: Merchant.collection.name, localField: "_id", foreignField: "_id", as: "merchant" } },
    { $unwind: { path: "$merchant", preserveNullAndEmptyArrays: true } },
    { $project: { businessName: { $ifNull: ["$merchant.businessDisplayName", { $ifNull: ["$merchant.businessName", "Unknown merchant"] }] }, payoutCount: 1, completedCount: 1, failedCount: 1, netAmountMinor: 1 } },
    { $sort: { netAmountMinor: -1 } }, { $limit: 12 },
  ]);
  return rows.map(row => ({
    merchantId: text(row._id, ""), businessName: text(row.businessName, "Unknown merchant"), payoutCount: i(row.payoutCount), completedCount: i(row.completedCount), failedCount: i(row.failedCount), netAmountMinor: i(row.netAmountMinor),
    netShare: pct(i(row.netAmountMinor), totalNetMinor), completionRate: pct(i(row.completedCount), i(row.payoutCount)),
  }));
}

async function ledgerAudit(m: Record<string, unknown>, currency: string) {
  const payouts = await Payout.find({ ...m, status: "completed" }).select("ledgerEntryGroupId").lean();
  const groupIds = payouts.map(p => p.ledgerEntryGroupId).filter((v): v is string => typeof v === "string" && v.length > 0);
  if (!groupIds.length) return { completedPayoutCount: payouts.length, withLedgerGroupCount: 0, missingLedgerGroupCount: payouts.length, balancedLedgerGroupCount: 0, unbalancedLedgerGroupCount: 0, coverageRate: 0 };
  const rows = await LedgerEntry.aggregate([
    { $match: { entryGroupId: { $in: groupIds }, currency, status: "posted" } },
    { $addFields: { amountMinorValue: decimalToMinor("$amount") } },
    { $group: { _id: "$entryGroupId", debitMinor: { $sum: { $cond: [{ $eq: ["$direction", "debit"] }, "$amountMinorValue", 0] } }, creditMinor: { $sum: { $cond: [{ $eq: ["$direction", "credit"] }, "$amountMinorValue", 0] } }, lineCount: { $sum: 1 } } },
  ]);
  const map = new Map(rows.map(row => [String(row._id), row]));
  let balanced = 0; let unbalanced = 0;
  for (const id of groupIds) { const row = map.get(id); if (row && i(row.lineCount) >= 2 && Math.abs(i(row.debitMinor) - i(row.creditMinor)) <= 1) balanced += 1; else unbalanced += 1; }
  return { completedPayoutCount: payouts.length, withLedgerGroupCount: groupIds.length, missingLedgerGroupCount: Math.max(0, payouts.length - groupIds.length), balancedLedgerGroupCount: balanced, unbalancedLedgerGroupCount: unbalanced, coverageRate: pct(balanced, payouts.length) };
}

function insights(current: Awaited<ReturnType<typeof summary>>, merchantRows: AnalystPayoutAnalyticsData["merchants"], ledger: AnalystPayoutAnalyticsData["ledger"]): AnalystPayoutInsight[] {
  if (!current.payoutCount) return [{ id: "payout-no-activity", severity: "info", category: "data_quality", title: "No payout activity", description: "No payout records matched the selected filters.", evidence: "0 matching payouts.", recommendedReview: "Adjust the period, currency, or payout status." }];
  const out: AnalystPayoutInsight[] = [];
  const failureRate = pct(current.failedCount, current.payoutCount);
  const completionRate = pct(current.completedCount, current.payoutCount);
  if (failureRate >= 10 && current.payoutCount >= 5) out.push({ id: "payout-failure-rate", severity: failureRate >= 25 ? "high" : "medium", category: "reliability", title: "Payout failures are elevated", description: "A meaningful share of payouts ended in failed status.", evidence: `${current.failedCount} of ${current.payoutCount} payouts failed (${failureRate.toFixed(2)}%).`, recommendedReview: "Review failure reasons and payout methods before operational retry." });
  if (current.averageCompletionSeconds > 3600 && current.completedCount >= 3) out.push({ id: "payout-latency", severity: current.averageCompletionSeconds > 86400 ? "high" : "medium", category: "latency", title: "Payout completion latency is elevated", description: "Completed payouts are taking longer than the monitoring threshold.", evidence: `Average completion time is ${(current.averageCompletionSeconds / 3600).toFixed(1)} hours.`, recommendedReview: "Compare payout methods and downstream processing state." });
  if (ledger.completedPayoutCount > 0 && ledger.coverageRate < 100) out.push({ id: "payout-ledger-coverage", severity: ledger.coverageRate < 90 ? "high" : "medium", category: "ledger", title: "Completed payout ledger coverage is incomplete", description: "Some completed payouts do not have a balanced posted ledger group.", evidence: `${ledger.coverageRate.toFixed(2)}% ledger coverage.`, recommendedReview: "Review missing or unbalanced ledger groups before reconciliation." });
  const top = merchantRows[0];
  if (top && top.netShare >= 50) out.push({ id: "payout-merchant-concentration", severity: top.netShare >= 70 ? "high" : "medium", category: "merchant", title: "Payout value is merchant-concentrated", description: "One merchant contributes a large share of payout net value.", evidence: `${top.businessName} represents ${top.netShare.toFixed(2)}% of payout net value.`, recommendedReview: "Compare concentration with merchant payment and settlement volume." });
  if (completionRate >= 95 && failureRate < 3 && ledger.coverageRate >= 99) out.push({ id: "payout-healthy", severity: "positive", category: "reliability", title: "Payout processing is healthy", description: "Completion is high while failures and ledger gaps are controlled.", evidence: `${completionRate.toFixed(2)}% completion and ${ledger.coverageRate.toFixed(2)}% ledger coverage.`, recommendedReview: "Continue monitoring payout latency and concentration." });
  return out.length ? out : [{ id: "payout-stable", severity: "info", category: "data_quality", title: "Payout indicators are within current thresholds", description: "No material deterministic payout signal was triggered.", evidence: `${current.payoutCount} payouts evaluated.`, recommendedReview: "Continue monitoring payout performance." }];
}

export async function getAnalystPayoutAnalytics(input: { filters: AnalystDateFilters; status: AnalystPayoutStatus }): Promise<AnalystPayoutAnalyticsData> {
  const { filters, status } = input;
  const currentMatch = match(filters, status, filters.from, filters.to);
  const previousMatch = match(filters, status, filters.previousFrom, filters.previousTo);
  const [current, previous, trendRows, statusRows, methodRows, failureReasons] = await Promise.all([
    summary(currentMatch), summary(previousMatch), trend(currentMatch, filters), breakdown(currentMatch, "status"), breakdown(currentMatch, "payoutMethod"), failures(currentMatch),
  ]);
  const [merchantRows, ledger, previousLedger] = await Promise.all([merchants(currentMatch, current.totalAmountMinor), ledgerAudit(currentMatch, filters.currency), ledgerAudit(previousMatch, filters.currency)]);
  const completionRate = pct(current.completedCount, current.payoutCount); const previousCompletionRate = pct(previous.completedCount, previous.payoutCount);
  const failureRate = pct(current.failedCount, current.payoutCount); const previousFailureRate = pct(previous.failedCount, previous.payoutCount);
  return {
    generatedAt: new Date().toISOString(), source: { payouts: "mongodb_payout_collection", ledger: "mongodb_ledger_entry_collection" },
    scopeNote: "Payout records do not contain a Test/Live environment dimension; analytics is filtered by payout creation time, currency and status.",
    filters: { range: filters.range, currency: filters.currency, status, bucket: filters.bucket, from: filters.from.toISOString(), to: filters.to.toISOString(), previousFrom: filters.previousFrom.toISOString(), previousTo: filters.previousTo.toISOString() },
    metrics: {
      payoutCount: metric(current.payoutCount, previous.payoutCount), totalAmountMinor: metric(current.totalAmountMinor, previous.totalAmountMinor), completedNetAmountMinor: metric(current.completedNetAmountMinor, previous.completedNetAmountMinor), pendingAmountMinor: metric(current.pendingAmountMinor, previous.pendingAmountMinor), completionRate: metric(completionRate, previousCompletionRate), failureRate: metric(failureRate, previousFailureRate), averageCompletionSeconds: metric(current.averageCompletionSeconds, previous.averageCompletionSeconds), ledgerCoverageRate: metric(ledger.coverageRate, previousLedger.coverageRate),
    },
    operations: { pendingCount: current.pendingCount, processingCount: current.processingCount, completedCount: current.completedCount, failedCount: current.failedCount, cancelledCount: current.cancelledCount },
    ledger, trend: trendRows,
    statuses: statusRows.map(row => ({ status: row.key, count: row.count, percentage: row.percentage, netAmountMinor: row.netAmountMinor })),
    methods: methodRows.map(row => ({ method: row.key, count: row.count, percentage: row.percentage, netAmountMinor: row.netAmountMinor, completionRate: pct(row.completedCount, row.count) })),
    failureReasons, merchants: merchantRows, insights: insights(current, merchantRows, ledger),
  };
}
