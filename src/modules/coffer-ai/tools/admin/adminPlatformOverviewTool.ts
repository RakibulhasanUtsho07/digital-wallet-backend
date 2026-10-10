import { getAdminOverview } from "../../../../services/adminOverviewService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const adminPlatformOverviewTool: AiToolDefinition = {
  id: "admin.platform.overview",
  async execute({ actor }) {
    if (actor.actorType !== "admin" && actor.actorType !== "super_admin") {
      throw new CofferAiError({
        code: "AI_ADMIN_SCOPE_REQUIRED",
        message: "An administrator role is required.",
        statusCode: 403,
      });
    }

    const overview = await getAdminOverview("30d");
    const integrityItem = overview.attentionQueue.find(
      (item) => item.id === "transaction-integrity"
    );
    const unreadableCount = integrityItem?.count ?? 0;
    const isPartial = unreadableCount > 0;

    return {
      toolId: "admin.platform.overview" as const,
      title: "Platform overview",
      summary: isPartial
        ? `The 30-day platform snapshot contains ${overview.kpis.totalUsers.value} users, ${overview.kpis.activeWallets.value} active wallets, and ${overview.kpis.riskAlerts.value} risk alerts. Transaction amount totals are partial because ${unreadableCount} stored transaction amount${unreadableCount === 1 ? "" : "s"} could not be decrypted.`
        : `The 30-day platform snapshot contains ${overview.kpis.totalUsers.value} users, ${overview.kpis.activeWallets.value} active wallets, and ${overview.kpis.riskAlerts.value} risk alerts.`,
      verification: isPartial ? "partial" as const : "verified" as const,
      confidence: isPartial ? "medium" as const : "high" as const,
      facts: [
        { label: "Total users", value: overview.kpis.totalUsers.value },
        { label: "Active wallets", value: overview.kpis.activeWallets.value },
        {
          label: isPartial ? "Readable transaction volume" : "Transaction volume",
          value: overview.kpis.transactionVolume.value,
        },
        { label: "Platform revenue", value: overview.kpis.platformRevenue.value },
        { label: "Pending KYC", value: overview.kpis.pendingKyc.value },
        { label: "Risk alerts", value: overview.kpis.riskAlerts.value },
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
        { label: "Open admin dashboard", href: "/dashboard" },
        ...(isPartial
          ? [{ label: "Review transactions", href: "/dashboard/all-transactions" }]
          : []),
      ],
      diagnosis: null,
      data: {
        generatedAt: overview.generatedAt,
        currency: overview.currency,
        kpis: overview.kpis,
        serviceHealth: overview.serviceHealth,
        unreadableTransactionAmounts: unreadableCount,
      },
    };
  },
};
