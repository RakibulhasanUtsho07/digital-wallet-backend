import { getMerchantOverview } from "../../../../services/merchantOverviewService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const merchantOverviewTool: AiToolDefinition = {
  id: "merchant.overview",

  async execute({ actor }) {
    if (
      actor.actorType !== "merchant" ||
      !actor.userId ||
      !actor.merchantId
    ) {
      throw new CofferAiError({
        code: "AI_MERCHANT_SCOPE_REQUIRED",
        message: "A verified merchant account context is required.",
        statusCode: 403,
      });
    }

    const overview = await getMerchantOverview({
      userId: actor.userId,
      period: "30d",
    });

    if (String(overview.merchant.id) !== actor.merchantId) {
      throw new CofferAiError({
        code: "AI_RESOURCE_SCOPE_MISMATCH",
        message: "The merchant overview is outside this merchant account.",
        statusCode: 403,
      });
    }

    const summary = overview.summary;
    const currency =
      typeof overview.merchant.defaultCurrency === "string" &&
      overview.merchant.defaultCurrency.trim()
        ? overview.merchant.defaultCurrency.trim().toUpperCase()
        : "BDT";

    const accountStatus = String(
      overview.merchant.status ?? "unknown",
    );
    const verificationStatus = String(
      overview.merchant.verificationStatus ?? "unknown",
    );

    const suggestedActions = [
      {
        label: "Open merchant payments",
        href: "/dashboard/merchant/payments",
      },
      {
        label: "Open merchant analytics",
        href: "/dashboard/merchant/analytics",
      },
      ...(verificationStatus === "verified"
        ? []
        : [
            {
              label: "Review merchant verification",
              href: "/dashboard/merchant/verification",
            },
          ]),
    ];

    return {
      toolId: "merchant.overview" as const,
      title: "Merchant business overview",
      summary:
        `For the last 30 days, ${summary.totalPayments} payments were recorded ` +
        `with a ${summary.successRate.toFixed(1)}% success rate. ` +
        `${summary.failedPayments} failed and ${summary.pendingPayments} are pending.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Merchant status", value: accountStatus },
        { label: "Verification", value: verificationStatus },
        { label: "Test mode", value: Boolean(overview.merchant.testEnabled) },
        { label: "Live mode", value: Boolean(overview.merchant.liveEnabled) },
        { label: "Total payments", value: summary.totalPayments },
        { label: "Successful", value: summary.successfulPayments },
        { label: "Failed", value: summary.failedPayments },
        { label: "Pending", value: summary.pendingPayments },
        { label: "Processing", value: summary.processingPayments },
        {
          label: "Success rate",
          value: Number(summary.successRate.toFixed(2)),
        },
        {
          label: "Gross volume",
          value: Number(summary.grossVolume.toFixed(2)),
        },
        {
          label: "Net revenue",
          value: Number(summary.netRevenue.toFixed(2)),
        },
        { label: "Unique customers", value: summary.uniqueCustomers },
        { label: "Currency", value: currency },
      ],
      sources: [
        {
          type: "merchant_overview",
          label: "Owned merchant payment aggregate",
          reference: actor.merchantId,
        },
      ],
      suggestedActions,
      diagnosis: null,
      data: {
        kind: "merchant_overview",
        period: overview.period,
        merchant: {
          id: actor.merchantId,
          status: accountStatus,
          verificationStatus,
          defaultCurrency: currency,
          testEnabled: Boolean(overview.merchant.testEnabled),
          liveEnabled: Boolean(overview.merchant.liveEnabled),
        },
        summary: {
          totalPayments: summary.totalPayments,
          successfulPayments: summary.successfulPayments,
          failedPayments: summary.failedPayments,
          pendingPayments: summary.pendingPayments,
          processingPayments: summary.processingPayments,
          successRate: Number(summary.successRate.toFixed(2)),
          grossVolume: Number(summary.grossVolume.toFixed(2)),
          netRevenue: Number(summary.netRevenue.toFixed(2)),
          uniqueCustomers: summary.uniqueCustomers,
          currency,
        },
      },
    };
  },
};
