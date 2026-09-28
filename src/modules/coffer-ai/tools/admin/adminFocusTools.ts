import { getAdminOverview } from "../../../../services/adminOverviewService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

function requireAdmin(role: string): void {
  if (role !== "admin" && role !== "super_admin") {
    throw new CofferAiError({ code: "AI_ADMIN_SCOPE_REQUIRED", message: "An administrator role is required.", statusCode: 403 });
  }
}

export const adminRiskSnapshotTool: AiToolDefinition = {
  id: "admin.risk.snapshot",
  async execute({ actor }) {
    requireAdmin(actor.actorType);
    const report = await getAdminOverview("30d");
    return {
      toolId: "admin.risk.snapshot", title: "Admin attention snapshot · 30 days",
      summary: `The platform overview currently reports ${report.kpis.riskAlerts.value} risk alerts and ${report.kpis.pendingKyc.value} pending KYC reviews. Review the dashboard for case-level evidence before any decision.`,
      verification: "verified", confidence: "high",
      facts: [
        { label: "Risk alerts", value: report.kpis.riskAlerts.value },
        { label: "Pending KYC", value: report.kpis.pendingKyc.value },
      ],
      sources: [{ type: "admin_overview", label: "Live admin overview", reference: "30d" }],
      suggestedActions: [
        { label: "Review KYC queue", href: "/dashboard/kyc-requests" },
        { label: "Open security dashboard", href: "/dashboard/admin/security" },
      ],
      diagnosis: null,
      data: { generatedAt: report.generatedAt, riskAlerts: report.kpis.riskAlerts, pendingKyc: report.kpis.pendingKyc },
    };
  },
};

export const adminFinanceSnapshotTool: AiToolDefinition = {
  id: "admin.finance.snapshot",
  async execute({ actor }) {
    requireAdmin(actor.actorType);

    const report = await getAdminOverview("30d");
    const integrityItem = report.attentionQueue.find(
      (item) => item.id === "transaction-integrity"
    );
    const unreadableCount = integrityItem?.count ?? 0;
    const isPartial = unreadableCount > 0;

    return {
      toolId: "admin.finance.snapshot",
      title: "Platform financial snapshot · 30 days",
      summary: isPartial
        ? `Readable transaction volume is ${report.kpis.transactionVolume.value} ${report.currency} and platform revenue is ${report.kpis.platformRevenue.value} ${report.currency}. Transaction volume is incomplete because ${unreadableCount} stored transaction amount${unreadableCount === 1 ? "" : "s"} could not be decrypted; repair those records or configure the original encryption key before treating the volume as a complete total.`
        : `The platform overview reports transaction volume of ${report.kpis.transactionVolume.value} ${report.currency} and revenue of ${report.kpis.platformRevenue.value} ${report.currency} in the 30-day view.`,
      verification: isPartial ? "partial" : "verified",
      confidence: isPartial ? "medium" : "high",
      facts: [
        {
          label: isPartial
            ? `Readable transaction volume (${report.currency})`
            : `Transaction volume (${report.currency})`,
          value: report.kpis.transactionVolume.value,
        },
        {
          label: `Platform revenue (${report.currency})`,
          value: report.kpis.platformRevenue.value,
        },
        ...(isPartial
          ? [{ label: "Unreadable transaction amounts", value: unreadableCount }]
          : []),
      ],
      sources: [
        {
          type: "admin_overview",
          label: "Live admin overview",
          reference: "30d",
        },
      ],
      suggestedActions: [
        { label: "Open platform revenue", href: "/dashboard/revenue" },
        ...(isPartial
          ? [{ label: "Review transactions", href: "/dashboard/all-transactions" }]
          : []),
      ],
      diagnosis: null,
      data: {
        generatedAt: report.generatedAt,
        currency: report.currency,
        volume: report.kpis.transactionVolume,
        revenue: report.kpis.platformRevenue,
        unreadableTransactionAmounts: unreadableCount,
      },
    };
  },
};
