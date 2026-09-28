import { listMerchantSettlements } from "../../../../services/merchantSettlementService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const merchantSettlementSummaryTool: AiToolDefinition = {
  id: "merchant.settlements.summary",

  async execute({ actor }) {
    if (actor.actorType !== "merchant" || !actor.userId || !actor.merchantId) {
      throw new CofferAiError({
        code: "AI_MERCHANT_SCOPE_REQUIRED",
        message: "A merchant account context is required.",
        statusCode: 403,
      });
    }

    const result = await listMerchantSettlements({
      ownerId: actor.userId,
      page: 1,
      limit: 5,
    });

    if (String(result.merchant.id) !== actor.merchantId) {
      throw new CofferAiError({
        code: "AI_RESOURCE_SCOPE_MISMATCH",
        message: "The settlement summary is outside this merchant account.",
        statusCode: 403,
      });
    }

    const { summary } = result;
    const currency = result.merchant.defaultCurrency;

    return {
      toolId: "merchant.settlements.summary" as const,
      title: "Merchant settlement summary",
      summary:
        `${summary.total} settlement${summary.total === 1 ? "" : "s"} are recorded. ` +
        `${summary.settled} settled, ${summary.pending} pending, ${summary.processing} processing, and ${summary.failed} failed.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Total settlements", value: summary.total },
        { label: "Settled", value: summary.settled },
        { label: "Pending", value: summary.pending },
        { label: "Processing", value: summary.processing },
        { label: "Failed", value: summary.failed },
        { label: "Cancelled", value: summary.cancelled },
        { label: "Gross amount", value: summary.grossAmount },
        { label: "Fees", value: summary.feeAmount },
        { label: "Refund amount", value: summary.refundAmount },
        { label: "Net amount", value: summary.netAmount },
        { label: "Currency", value: currency },
      ],
      sources: [
        {
          type: "merchant_settlement_aggregate",
          label: "Owned merchant settlement records",
          reference: actor.merchantId,
        },
      ],
      suggestedActions: [
        {
          label: "Open merchant settlements",
          href: "/dashboard/merchant/settlement",
        },
      ],
      diagnosis: null,
      data: {
        kind: "merchant_settlement_summary",
        summary,
        currency,
      },
    };
  },
};
