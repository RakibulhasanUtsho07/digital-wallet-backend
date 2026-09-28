import { listMerchantPayouts } from "../../../../services/merchantPayoutService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const merchantPayoutSummaryTool: AiToolDefinition = {
  id: "merchant.payouts.summary",

  async execute({ actor }) {
    if (actor.actorType !== "merchant" || !actor.userId || !actor.merchantId) {
      throw new CofferAiError({
        code: "AI_MERCHANT_SCOPE_REQUIRED",
        message: "A merchant account context is required.",
        statusCode: 403,
      });
    }

    const result = await listMerchantPayouts({
      ownerId: actor.userId,
      page: 1,
      limit: 5,
    });

    if (String(result.merchant.id) !== actor.merchantId) {
      throw new CofferAiError({
        code: "AI_RESOURCE_SCOPE_MISMATCH",
        message: "The payout summary is outside this merchant account.",
        statusCode: 403,
      });
    }

    const { summary, balance } = result;

    return {
      toolId: "merchant.payouts.summary" as const,
      title: "Merchant payout summary",
      summary:
        `${summary.total} payout${summary.total === 1 ? "" : "s"} are recorded. ` +
        `${summary.completed} completed, ${summary.pending} pending, ${summary.processing} processing, and ${summary.failed} failed.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Total payouts", value: summary.total },
        { label: "Completed payouts", value: summary.completed },
        { label: "Pending payouts", value: summary.pending },
        { label: "Processing payouts", value: summary.processing },
        { label: "Failed payouts", value: summary.failed },
        { label: "Cancelled payouts", value: summary.cancelled },
        { label: "Total payout amount", value: summary.totalAmount },
        { label: "Completed payout amount", value: summary.completedAmount },
        { label: "Pending payout amount", value: summary.pendingAmount },
        { label: "Available payout balance", value: balance.availableBalance },
        { label: "Reserved payout amount", value: balance.reservedAmount },
        { label: "Currency", value: balance.currency },
      ],
      sources: [
        {
          type: "merchant_payout_aggregate",
          label: "Owned merchant payout records",
          reference: actor.merchantId,
        },
      ],
      suggestedActions: [
        { label: "Open merchant payouts", href: "/dashboard/merchant/payouts" },
      ],
      diagnosis: null,
      data: {
        kind: "merchant_payout_summary",
        summary,
        balance,
      },
    };
  },
};
