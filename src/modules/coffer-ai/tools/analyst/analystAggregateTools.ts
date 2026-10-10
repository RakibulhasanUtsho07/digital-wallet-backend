import { getAnalystPaymentAnalytics } from "../../../../services/analystPaymentService.js";
import { getAnalystRiskAnalytics } from "../../../../services/analystRiskService.js";
import { getAnalystRevenueAnalytics } from "../../../../services/analystRevenueService.js";
import type { AnalystDateFilters } from "../../../../types/analystTypes.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

function requireAnalyst(role: string): void {
  if (role !== "analyst") {
    throw new CofferAiError({
      code: "AI_ANALYST_SCOPE_REQUIRED",
      message: "An Analyst role is required.",
      statusCode: 403,
    });
  }
}

// Deliberately fixed to a server-generated window. Client text cannot supply
// arbitrary filters or a different tenant/scope to the aggregate readers.
function last30Days(): AnalystDateFilters {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  return {
    range: "30d", mode: "all", currency: "BDT", bucket: "day",
    from, to,
    previousFrom: new Date(from.getTime() - 30 * 86_400_000),
    previousTo: from,
  };
}

export const analystPaymentSnapshotTool: AiToolDefinition = {
  id: "analyst.payment.snapshot",
  async execute({ actor }) {
    requireAnalyst(actor.actorType);
    const report = await getAnalystPaymentAnalytics({
      range: "30d", mode: "all", currency: "BDT", provider: "",
      status: "all", source: "all",
    });
    return {
      toolId: "analyst.payment.snapshot",
      title: "Payment performance · 30 days",
      summary: `The last 30 days contain ${report.metrics.attemptCount.value} payment attempts, ${report.metrics.completedCount.value} completed payments and ${report.metrics.failedCount.value} failed payments. The recorded success rate is ${report.metrics.successRate.value}%.`,
      verification: "verified", confidence: "high",
      facts: [
        { label: "Attempts", value: report.metrics.attemptCount.value },
        { label: "Completed", value: report.metrics.completedCount.value },
        { label: "Failed", value: report.metrics.failedCount.value },
        { label: "Success rate (%)", value: report.metrics.successRate.value },
        { label: "Pending", value: report.operations.pendingCount },
        { label: "Payment volume (minor units)", value: report.metrics.paymentVolumeMinor.value },
      ],
      sources: [{ type: "analyst_payment_analytics", label: "Live payment aggregates", reference: "30d:BDT:all" }],
      suggestedActions: [{ label: "Review payment analytics", href: "/dashboard/analyst/payments" }],
      diagnosis: null,
      data: { generatedAt: report.generatedAt, metrics: report.metrics, operations: report.operations, failureReasons: report.failureReasons.slice(0, 5) },
    };
  },
};

export const analystRiskSnapshotTool: AiToolDefinition = {
  id: "analyst.risk.snapshot",
  async execute({ actor }) {
    requireAnalyst(actor.actorType);
    const report = await getAnalystRiskAnalytics({
      filters: last30Days(), provider: "", source: "all",
    });
    return {
      toolId: "analyst.risk.snapshot",
      title: "Risk signals · 30 days",
      summary: `The recorded risk status is ${report.status}. In the last 30 days there were ${report.metrics.riskSignalCount.value} risk signals, ${report.metrics.riskBlockedPayments.value} blocked payments and ${report.metrics.highRiskTransactions.value} high-risk transactions. These are aggregate signals, not a diagnosis of an individual account.`,
      verification: "verified", confidence: "high",
      facts: [
        { label: "Risk signals", value: report.metrics.riskSignalCount.value },
        { label: "Blocked payments", value: report.metrics.riskBlockedPayments.value },
        { label: "High-risk transactions", value: report.metrics.highRiskTransactions.value },
        { label: "Failed payments", value: report.metrics.failedPayments.value },
        { label: "Failed transactions", value: report.metrics.failedTransactions.value },
      ],
      sources: [{ type: "analyst_risk_analytics", label: "Live risk aggregates", reference: "30d:BDT:all" }],
      suggestedActions: [{ label: "Review risk analytics", href: "/dashboard/analyst/risk" }],
      diagnosis: null,
      data: { generatedAt: report.generatedAt, status: report.status, metrics: report.metrics, operations: report.operations },
    };
  },
};

export const analystRevenueSnapshotTool: AiToolDefinition = {
  id: "analyst.revenue.snapshot",
  async execute({ actor }) {
    requireAnalyst(actor.actorType);
    const report = await getAnalystRevenueAnalytics({
      filters: last30Days(), kind: "all",
    });
    return {
      toolId: "analyst.revenue.snapshot",
      title: "Revenue ledger · 30 days",
      summary: `The 30-day revenue ledger records ${report.metrics.grossRevenueMinor.value} minor units gross, ${report.metrics.leakageMinor.value} minor units of leakage, and ${report.metrics.netRevenueMinor.value} minor units net.`,
      verification: "verified", confidence: "high",
      facts: [
        { label: "Gross revenue (minor units)", value: report.metrics.grossRevenueMinor.value },
        { label: "Leakage (minor units)", value: report.metrics.leakageMinor.value },
        { label: "Net revenue (minor units)", value: report.metrics.netRevenueMinor.value },
        { label: "Ledger events", value: report.metrics.eventCount.value },
        { label: "Unclassified events", value: report.quality.unclassifiedEventCount },
      ],
      sources: [{ type: "analyst_revenue_analytics", label: "Live revenue ledger", reference: "30d:BDT:all" }],
      suggestedActions: [{ label: "Review revenue analytics", href: "/dashboard/analyst/revenue" }],
      diagnosis: null,
      data: { generatedAt: report.generatedAt, metrics: report.metrics, quality: report.quality },
    };
  },
};
