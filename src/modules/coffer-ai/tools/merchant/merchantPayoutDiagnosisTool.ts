import {
  getMerchantPayout,
} from "../../../../services/merchantPayoutService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type {
  AiDiagnosisCause,
  AiToolResult,
} from "../../types/cofferAi.types.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export const merchantPayoutDiagnosisTool: AiToolDefinition = {
  id: "merchant.payout.diagnosis",

  async execute({ actor, payload }): Promise<AiToolResult> {
    if (
      actor.actorType !== "merchant" ||
      !actor.userId ||
      !actor.merchantId
    ) {
      throw new CofferAiError({
        code: "AI_MERCHANT_SCOPE_REQUIRED",
        message: "A merchant account context is required.",
        statusCode: 403,
      });
    }

    const payoutId = text(payload.resourceId);

    if (!payoutId) {
      throw new CofferAiError({
        code: "AI_PAYOUT_ID_REQUIRED",
        message: "Please provide the payout ID you want me to diagnose.",
        statusCode: 400,
      });
    }

    let result: Awaited<ReturnType<typeof getMerchantPayout>>;

    try {
      result = await getMerchantPayout(actor.userId, payoutId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new CofferAiError({
        code: /not found/i.test(message)
          ? "AI_PAYOUT_NOT_FOUND"
          : "AI_PAYOUT_LOOKUP_FAILED",
        message: /not found/i.test(message)
          ? "That payout was not found in this merchant account."
          : "The payout could not be verified from the merchant backend.",
        statusCode: /not found/i.test(message) ? 404 : 422,
      });
    }

    if (String(result.merchant.id) !== actor.merchantId) {
      throw new CofferAiError({
        code: "AI_RESOURCE_SCOPE_MISMATCH",
        message: "That payout is outside this merchant account.",
        statusCode: 403,
      });
    }

    const payout = result.payout as Record<string, unknown>;
    const status = text(payout.status) || "unknown";
    const failureReason = text(payout.failureReason);

    let exactCause: AiDiagnosisCause | undefined;

    if (status === "failed" && failureReason) {
      exactCause = {
        code: "recorded_payout_failure",
        label: failureReason,
        evidenceRefs: ["payout.status", "payout.failureReason"],
      };
    }

    const causeVerified = Boolean(exactCause);
    const stateIsNonFailure =
      status === "pending" ||
      status === "processing" ||
      status === "completed" ||
      status === "cancelled";

    const summary =
      status === "failed"
        ? causeVerified
          ? `Verified state: Payout ${payoutId} is failed.\nVerified cause: ${exactCause!.label}`
          : `Verified state: Payout ${payoutId} is failed.\nDiagnosis: The exact failure reason is not recorded and cannot be verified.`
        : status === "processing"
          ? `Verified state: Payout ${payoutId} is processing.\nDiagnosis: No failure is recorded; the payout is still being processed.`
          : status === "pending"
            ? `Verified state: Payout ${payoutId} is pending.\nDiagnosis: No failure is recorded for this payout yet.`
            : status === "completed"
              ? `Verified state: Payout ${payoutId} completed successfully.\nDiagnosis: No current payout failure is recorded.`
              : status === "cancelled"
                ? `Verified state: Payout ${payoutId} is cancelled.\nDiagnosis: The record confirms cancellation, but no separate failure reason is recorded.`
                : `Verified state: Payout ${payoutId} is ${status}.\nDiagnosis: The exact cause cannot be verified from the recorded fields.`;

    return {
      toolId: "merchant.payout.diagnosis",
      title: "Merchant payout diagnosis",
      summary,
      verification:
        causeVerified || stateIsNonFailure ? "verified" : "partial",
      confidence:
        causeVerified || stateIsNonFailure ? "high" : "medium",
      facts: [
        { label: "Payout ID", value: payout.payoutId ? String(payout.payoutId) : payoutId },
        { label: "Status", value: status },
        { label: "Amount", value: typeof payout.amount === "number" ? payout.amount : String(payout.amount ?? "") },
        { label: "Net amount", value: typeof payout.netAmount === "number" ? payout.netAmount : String(payout.netAmount ?? "") },
        { label: "Currency", value: text(payout.currency) || null },
        { label: "Payout method", value: text(payout.payoutMethod) || null },
        {
          label: "Failure reason recorded",
          value: Boolean(failureReason),
        },
        { label: "Requested at", value: iso(payout.requestedAt) },
        { label: "Processing at", value: iso(payout.processingAt) },
        { label: "Completed at", value: iso(payout.completedAt) },
        { label: "Failed at", value: iso(payout.failedAt) },
        { label: "Updated at", value: iso(payout.updatedAt) },
      ],
      sources: [
        {
          type: "merchant_payout",
          label: "Owned merchant payout record",
          reference: payoutId,
        },
      ],
      suggestedActions: [
        {
          label: "Open payout details",
          href: `/dashboard/merchant/payouts/${encodeURIComponent(payoutId)}`,
        },
        {
          label: "Open merchant payouts",
          href: "/dashboard/merchant/payouts",
        },
      ],
      diagnosis: {
        subjectType: "payout",
        subjectId: payoutId,
        state: status,
        exactCause,
        possibleCauses: [],
        nextSteps: [
          {
            label: causeVerified
              ? "Review the recorded payout failure before taking any manual action"
              : "Review the payout detail and wait for a recorded state change when it is pending or processing",
            href: `/dashboard/merchant/payouts/${encodeURIComponent(payoutId)}`,
          },
        ],
        verified: causeVerified || stateIsNonFailure,
      },
      data: {
        kind: "merchant_payout_diagnosis",
        payout: {
          payoutId,
          status,
          amount: payout.amount ?? null,
          netAmount: payout.netAmount ?? null,
          currency: payout.currency ?? null,
          payoutMethod: payout.payoutMethod ?? null,
          hasRecordedFailureReason: Boolean(failureReason),
          requestedAt: iso(payout.requestedAt),
          processingAt: iso(payout.processingAt),
          completedAt: iso(payout.completedAt),
          failedAt: iso(payout.failedAt),
          updatedAt: iso(payout.updatedAt),
        },
      },
    };
  },
};
