import { getMerchantAnalytics } from "../../../../services/merchantAnalyticsService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const merchantAnalyticsSummaryTool: AiToolDefinition = {
  id: "merchant.analytics.summary",

  async execute({ actor }) {
    if (actor.actorType !== "merchant" || !actor.userId || !actor.merchantId) {
      throw new CofferAiError({
        code: "AI_MERCHANT_SCOPE_REQUIRED",
        message: "A merchant account context is required.",
        statusCode: 403,
      });
    }

    const analytics = await getMerchantAnalytics({
      ownerId: actor.userId,
      period: "30d",
    });

    if (String(analytics.merchant.id) !== actor.merchantId) {
      throw new CofferAiError({
        code: "AI_RESOURCE_SCOPE_MISMATCH",
        message: "The analytics summary is outside this merchant account.",
        statusCode: 403,
      });
    }

    const overview = analytics.overview;
    const currency = analytics.merchant.defaultCurrency;

    return {
      toolId: "merchant.analytics.summary" as const,
      title: "Merchant analytics summary",
      summary:
        `For the last 30 days, ${overview.totalPayments} payments produced a ` +
        `${Number(overview.successRate).toFixed(1)}% success rate, with ` +
        `${overview.failedPayments} failed payments and ${overview.uniqueCustomers} unique customers.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Period", value: String(analytics.period) },
        { label: "Total payments", value: overview.totalPayments },
        { label: "Completed payments", value: overview.completedPayments },
        { label: "Pending payments", value: overview.pendingPayments },
        { label: "Processing payments", value: overview.processingPayments },
        { label: "Failed payments", value: overview.failedPayments },
        { label: "Cancelled payments", value: overview.cancelledPayments },
        { label: "Expired payments", value: overview.expiredPayments },
        { label: "Success rate", value: overview.successRate },
        { label: "Gross volume", value: overview.grossVolume },
        { label: "Total fees", value: overview.totalFees },
        { label: "Net revenue", value: overview.netRevenue },
        { label: "Average payment value", value: overview.averagePaymentValue },
        { label: "Unique customers", value: overview.uniqueCustomers },
        { label: "Currency", value: currency },
      ],
      sources: [
        {
          type: "merchant_analytics_aggregate",
          label: "Owned merchant payment analytics",
          reference: actor.merchantId,
        },
      ],
      suggestedActions: [
        { label: "Open merchant analytics", href: "/dashboard/merchant/analytics" },
        { label: "Review merchant payments", href: "/dashboard/merchant/payments" },
      ],
      diagnosis: null,
      data: {
        kind: "merchant_analytics_summary",
        period: analytics.period,
        overview,
      },
    };
  },
};
