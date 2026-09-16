import mongoose from "mongoose";
import { AnalystReport, type AnalystReportFormat } from "../models/AnalystReport.js";
import { getAnalystOverview } from "./analystOverviewService.js";
import type { AnalystDateFilters, AnalystMode, AnalystOverviewData, AnalystRange } from "../types/analystTypes.js";

const REPORT_TTL_DAYS = 7;
const RANGE_MS: Record<AnalystRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

function filters(range: AnalystRange, mode: AnalystMode, currency: string): AnalystDateFilters {
  const to = new Date();
  const from = new Date(to.getTime() - RANGE_MS[range]);
  const previousTo = new Date(from);
  const previousFrom = new Date(previousTo.getTime() - RANGE_MS[range]);
  return { range, mode, currency, bucket: range === "24h" ? "hour" : "day", from, to, previousFrom, previousTo };
}

function snapshot(format: AnalystReportFormat, overview: AnalystOverviewData): Record<string, unknown> {
  if (format === "payments") {
    return {
      generatedAt: overview.generatedAt,
      filters: overview.filters,
      status: overview.status,
      metrics: {
        paymentVolumeMinor: overview.metrics.paymentVolumeMinor,
        netPaymentVolumeMinor: overview.metrics.netPaymentVolumeMinor,
        paymentCount: overview.metrics.paymentCount,
        completedPaymentCount: overview.metrics.completedPaymentCount,
        successRate: overview.metrics.successRate,
        paymentFeeRevenueMinor: overview.metrics.paymentFeeRevenueMinor,
      },
      operations: { failedPaymentCount: overview.operations.failedPaymentCount },
      paymentStatus: overview.paymentStatus,
      providers: overview.providers,
      insights: overview.insights.filter(i => i.category === "payments"),
    };
  }
  if (format === "risk") {
    return {
      generatedAt: overview.generatedAt,
      filters: overview.filters,
      status: overview.status,
      metrics: { openDisputeExposureMinor: overview.metrics.openDisputeExposureMinor, refundAmountMinor: overview.metrics.refundAmountMinor },
      operations: {
        openDisputeCount: overview.operations.openDisputeCount,
        highRiskTransactionCount: overview.operations.highRiskTransactionCount,
        failedTransactionCount: overview.operations.failedTransactionCount,
        failedPaymentCount: overview.operations.failedPaymentCount,
      },
      transactionRisk: overview.transactionRisk,
      insights: overview.insights.filter(i => ["risk", "disputes", "refunds"].includes(i.category)),
    };
  }
  if (format === "revenue") {
    return {
      generatedAt: overview.generatedAt,
      filters: overview.filters,
      metrics: { paymentFeeRevenueMinor: overview.metrics.paymentFeeRevenueMinor, refundAmountMinor: overview.metrics.refundAmountMinor, paymentVolumeMinor: overview.metrics.paymentVolumeMinor },
      revenueLedger: overview.revenueLedger,
      insights: overview.insights.filter(i => ["revenue", "refunds", "growth"].includes(i.category)),
    };
  }
  return overview as unknown as Record<string, unknown>;
}

function csvCell(v: unknown) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
function flatten(value: unknown, path: string, rows: Array<[string, string]>): void {
  if (value == null) { rows.push([path, ""]); return; }
  if (typeof value !== "object") { rows.push([path, String(value)]); return; }
  if (Array.isArray(value)) { if (!value.length) rows.push([path, "[]"]); value.forEach((item, index) => flatten(item, `${path}[${index}]`, rows)); return; }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) flatten(item, path ? `${path}.${key}` : key, rows);
}
export function analystReportToCsv(data: Record<string, unknown>) {
  const rows: Array<[string, string]> = [];
  flatten(data, "", rows);
  return [["Field", "Value"].map(csvCell).join(","), ...rows.map(row => row.map(csvCell).join(","))].join("\n");
}

export async function createAnalystReport(input: { userId: string; range: AnalystRange; mode: AnalystMode; currency: string; format: AnalystReportFormat }) {
  const report = await AnalystReport.create({
    requestedById: input.userId,
    range: input.range,
    mode: input.mode,
    currency: input.currency,
    format: input.format,
    status: "processing",
    expiresAt: new Date(Date.now() + REPORT_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  try {
    const overview = await getAnalystOverview(filters(input.range, input.mode, input.currency));
    report.snapshot = snapshot(input.format, overview);
    report.status = "ready";
    report.completedAt = new Date();
    report.errorMessage = undefined;
    await report.save();
    return report;
  } catch (error) {
    report.status = "failed";
    report.errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Analyst report generation failed.";
    report.completedAt = new Date();
    await report.save();
    throw error;
  }
}

export async function listAnalystReports(input: { userId: string; status?: "processing" | "ready" | "failed"; limit?: number }) {
  const query: Record<string, unknown> = { requestedById: input.userId, expiresAt: { $gt: new Date() } };
  if (input.status) query.status = input.status;
  return AnalystReport.find(query).sort({ createdAt: -1 }).limit(Math.min(Math.max(input.limit ?? 50, 1), 100)).select("-snapshot").lean();
}

export async function getAnalystReport(input: { reportId: string; userId: string }) {
  if (!mongoose.Types.ObjectId.isValid(input.reportId)) return null;
  return AnalystReport.findOne({ _id: input.reportId, requestedById: input.userId, expiresAt: { $gt: new Date() } }).lean();
}

export async function getAnalystReportCsv(input: { reportId: string; userId: string }) {
  const report = await getAnalystReport(input);
  if (!report || report.status !== "ready" || !report.snapshot) return null;
  return analystReportToCsv(report.snapshot as Record<string, unknown>);
}
