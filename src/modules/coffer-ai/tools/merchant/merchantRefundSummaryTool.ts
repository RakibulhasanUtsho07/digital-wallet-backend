import { listMerchantDashboardRefunds } from "../../../../services/merchantRefundService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

const STATUSES = ["pending", "completed", "failed", "cancelled"] as const;

export const merchantRefundSummaryTool: AiToolDefinition = {
  id: "merchant.refunds.summary",

  async execute({ actor }) {
    const ownerId = actor.userId;
    if (actor.actorType !== "merchant" || !ownerId || !actor.merchantId) {
      throw new CofferAiError({
        code: "AI_MERCHANT_SCOPE_REQUIRED",
        message: "A merchant account context is required.",
        statusCode: 403,
      });
    }

    const [all, ...byStatus] = await Promise.all([
      listMerchantDashboardRefunds({ ownerId, page: 1, limit: 1 }),
      ...STATUSES.map((status) =>
        listMerchantDashboardRefunds({
          ownerId,
          status,
          page: 1,
          limit: 1,
        }),
      ),
    ]);

    const counts = Object.fromEntries(
      STATUSES.map((status, index) => [
        status,
        byStatus[index]?.pagination.total ?? 0,
      ]),
    ) as Record<(typeof STATUSES)[number], number>;

    const recentCompleted = await listMerchantDashboardRefunds({
      ownerId,
      status: "completed",
      page: 1,
      limit: 100,
    });

    const sampledCompletedMinor = recentCompleted.refunds.reduce(
      (sum, refund) =>
        sum +
        (Number.isFinite(refund.amountMinor) ? refund.amountMinor : 0),
      0,
    );

    const currency =
      recentCompleted.refunds[0]?.currency?.trim().toUpperCase() || null;

    const total = all.pagination.total;

    return {
      toolId: "merchant.refunds.summary" as const,
      title: "Merchant refund summary",
      summary:
        `${total} refund record${total === 1 ? "" : "s"} are recorded for this merchant. ` +
        `${counts.completed} completed, ${counts.pending} pending, ${counts.failed} failed, and ${counts.cancelled} cancelled.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Total refunds", value: total },
        { label: "Completed refunds", value: counts.completed },
        { label: "Pending refunds", value: counts.pending },
        { label: "Failed refunds", value: counts.failed },
        { label: "Cancelled refunds", value: counts.cancelled },
        {
          label: "Recent completed refund amount",
          value: sampledCompletedMinor / 100,
        },
        { label: "Recent completed sample size", value: recentCompleted.refunds.length },
        { label: "Currency", value: currency },
      ],
      sources: [
        {
          type: "merchant_refund_aggregate",
          label: "Owned merchant refund records",
          reference: actor.merchantId,
        },
      ],
      suggestedActions: [
        { label: "Open merchant refunds", href: "/dashboard/merchant/refunds" },
      ],
      diagnosis: null,
      data: {
        kind: "merchant_refund_summary",
        total,
        counts,
        recentCompletedAmountMinor: sampledCompletedMinor,
        recentCompletedSampleSize: recentCompleted.refunds.length,
        currency,
      },
    };
  },
};
