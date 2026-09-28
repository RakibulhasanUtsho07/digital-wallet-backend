import {
  getMerchantDashboardRefund,
} from "../../../../services/merchantRefundService.js";
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

export const merchantRefundDiagnosisTool: AiToolDefinition = {
  id: "merchant.refund.diagnosis",

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

    const refundId = text(payload.resourceId);

    if (!refundId) {
      throw new CofferAiError({
        code: "AI_REFUND_ID_REQUIRED",
        message: "Please provide the refund ID you want me to diagnose.",
        statusCode: 400,
      });
    }

    let refund: Awaited<ReturnType<typeof getMerchantDashboardRefund>>;

    try {
      refund = await getMerchantDashboardRefund({
        ownerId: actor.userId,
        refundId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new CofferAiError({
        code: /not found/i.test(message)
          ? "AI_REFUND_NOT_FOUND"
          : "AI_REFUND_LOOKUP_FAILED",
        message: /not found/i.test(message)
          ? "That refund was not found in this merchant account."
          : "The refund could not be verified from the merchant backend.",
        statusCode: /not found/i.test(message) ? 404 : 422,
      });
    }

    if (String(refund.merchantId) !== actor.merchantId) {
      throw new CofferAiError({
        code: "AI_RESOURCE_SCOPE_MISMATCH",
        message: "That refund is outside this merchant account.",
        statusCode: 403,
      });
    }

    const status = text(refund.status) || "unknown";
    const failureCode = text(refund.failureCode);
    const failureMessage = text(refund.failureMessage);

    let exactCause: AiDiagnosisCause | undefined;

    if (status === "failed" && (failureCode || failureMessage)) {
      exactCause = {
        code: failureCode || "recorded_refund_failure",
        label:
          failureMessage ||
          `The refund failed with recorded code ${failureCode}.`,
        evidenceRefs: ["refund.status", "refund.failure"],
      };
    }

    const causeVerified = Boolean(exactCause);
    const stateIsNonFailure =
      status === "completed" ||
      status === "pending" ||
      status === "cancelled";

    const summary =
      status === "failed"
        ? causeVerified
          ? `Verified state: Refund ${refundId} is failed.\nVerified cause: ${exactCause!.label}`
          : `Verified state: Refund ${refundId} is failed.\nDiagnosis: The exact failure cause is not recorded and cannot be verified.`
        : status === "completed"
          ? `Verified state: Refund ${refundId} completed successfully.\nDiagnosis: No current refund failure is recorded.`
          : status === "pending"
            ? `Verified state: Refund ${refundId} is pending.\nDiagnosis: No failure is recorded for this refund yet.`
            : status === "cancelled"
              ? `Verified state: Refund ${refundId} is cancelled.\nDiagnosis: The record confirms cancellation, but no separate failure cause is recorded.`
              : `Verified state: Refund ${refundId} is ${status}.\nDiagnosis: The exact cause cannot be verified from the recorded fields.`;

    return {
      toolId: "merchant.refund.diagnosis",
      title: "Merchant refund diagnosis",
      summary,
      verification:
        causeVerified || stateIsNonFailure ? "verified" : "partial",
      confidence:
        causeVerified || stateIsNonFailure ? "high" : "medium",
      facts: [
        { label: "Refund ID", value: refund.refundId },
        { label: "Payment ID", value: refund.paymentId },
        { label: "Status", value: status },
        { label: "Amount", value: refund.amount },
        { label: "Currency", value: refund.currency },
        { label: "Mode", value: refund.mode },
        { label: "Failure code", value: failureCode || null },
        {
          label: "Failure reason recorded",
          value: Boolean(failureMessage || failureCode),
        },
        { label: "Completed at", value: iso(refund.completedAt) },
        { label: "Failed at", value: iso(refund.failedAt) },
        { label: "Cancelled at", value: iso(refund.cancelledAt) },
        { label: "Updated at", value: iso(refund.updatedAt) },
      ],
      sources: [
        {
          type: "merchant_refund",
          label: "Owned merchant refund record",
          reference: refund.refundId,
        },
      ],
      suggestedActions: [
        {
          label: "Open refund details",
          href: `/dashboard/merchant/refunds/${encodeURIComponent(refund.refundId)}`,
        },
        {
          label: "Open merchant refunds",
          href: "/dashboard/merchant/refunds",
        },
      ],
      diagnosis: {
        subjectType: "refund",
        subjectId: refund.refundId,
        state: status,
        exactCause,
        possibleCauses: [],
        nextSteps: [
          {
            label: causeVerified
              ? "Review the recorded refund failure and related payment"
              : "Review the refund detail and original payment before retrying any workflow",
            href: `/dashboard/merchant/refunds/${encodeURIComponent(refund.refundId)}`,
          },
        ],
        verified: causeVerified || stateIsNonFailure,
      },
      data: {
        kind: "merchant_refund_diagnosis",
        refund: {
          refundId: refund.refundId,
          paymentId: refund.paymentId,
          status,
          amount: refund.amount,
          currency: refund.currency,
          mode: refund.mode,
          failureCode: failureCode || null,
          hasRecordedFailureMessage: Boolean(failureMessage),
          completedAt: iso(refund.completedAt),
          failedAt: iso(refund.failedAt),
          cancelledAt: iso(refund.cancelledAt),
          updatedAt: iso(refund.updatedAt),
        },
      },
    };
  },
};
