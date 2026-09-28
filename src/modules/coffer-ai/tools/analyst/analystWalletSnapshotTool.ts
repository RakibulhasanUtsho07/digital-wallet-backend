import { getAnalystWalletAnalytics } from "../../../../services/analystWalletService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const analystWalletSnapshotTool: AiToolDefinition = {
  id: "analyst.wallet.snapshot",
  async execute({ actor }) {
    if (actor.actorType !== "analyst") {
      throw new CofferAiError({
        code: "AI_ANALYST_SCOPE_REQUIRED",
        message: "An Analyst role is required.",
        statusCode: 403,
      });
    }

    const analytics = await getAnalystWalletAnalytics({
      range: "30d",
      currency: "BDT",
    });

    return {
      toolId: "analyst.wallet.snapshot" as const,
      title: "Wallet network snapshot",
      summary: `Wallet network status is ${analytics.status}. ${analytics.population.totalWallets} wallets exist and ${analytics.metrics.engagedWallets.value} were engaged in the current 30-day window.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Network status", value: analytics.status },
        { label: "Total wallets", value: analytics.population.totalWallets },
        { label: "Active wallets", value: analytics.population.activeStatusWallets },
        { label: "Engaged wallets", value: analytics.metrics.engagedWallets.value },
        { label: "Merchant payments", value: analytics.metrics.merchantPaymentCount.value },
        { label: "P2P transfers", value: analytics.metrics.p2pTransferCount.value },
      ],
      sources: [
        {
          type: "analyst_wallet_analytics",
          label: "Live wallet analytics",
          reference: "30d:BDT",
        },
      ],
      suggestedActions: [
        { label: "Open wallet analytics", href: "/dashboard/analyst/wallets" },
      ],
      diagnosis: null,
      data: {
        status: analytics.status,
        population: analytics.population,
        metrics: analytics.metrics,
        engagement: analytics.engagement,
      },
    };
  },
};
