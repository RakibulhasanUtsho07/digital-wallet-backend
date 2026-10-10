import {
  getMerchantSettlement,
} from "../../../../services/merchantSettlementService.js";
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

export const merchantSettlementDiagnosisTool: AiToolDefinition = {
  id: "merchant.settlement.diagnosis",

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

    const settlementId = text(payload.resourceId);

    if (!settlementId) {
      throw new CofferAiError({
        code: "AI_SETTLEMENT_ID_REQUIRED",
        message: "Please provide the settlement ID you want me to diagnose.",
        statusCode: 400,
      });
    }

    let result: Awaited<ReturnType<typeof getMerchantSettlement>>;

    try {
      result = await getMerchantSettlement(actor.userId, settlementId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new CofferAiError({
        code: /not found/i.test(message)
          ? "AI_SETTLEMENT_NOT_FOUND"
          : "AI_SETTLEMENT_LOOKUP_FAILED",
        message: /not found/i.test(message)
          ? "That settlement was not found in this merchant account."
          : "The settlement could not be verified from the merchant backend.",
        statusCode: /not found/i.test(message) ? 404 : 422,
      });
    }

    if (String(result.merchant.id) !== actor.merchantId) {
      throw new CofferAiError({
        code: "AI_RESOURCE_SCOPE_MISMATCH",
        message: "That settlement is outside this merchant account.",
        statusCode: 403,
      });
    }

    const settlement = result.settlement as Record<string, unknown>;
    const status = text(settlement.status) || "unknown";
    const failureReason = text(settlement.failureReason);

    let exactCause: AiDiagnosisCause | undefined;

    if (status === "failed" && failureReason) {
      exactCause = {
        code: "recorded_settlement_failure",
        label: failureReason,
        evidenceRefs: ["settlement.status", "settlement.failureReason"],
      };
    }

    const causeVerified = Boolean(exactCause);
    const stateIsNonFailure =
      status === "pending" ||
      status === "processing" ||
      status === "settled" ||
      status === "completed" ||
      status === "cancelled";

    const summary =
      status === "failed"
        ? causeVerified
          ? `Verified state: Settlement ${settlementId} is failed.\nVerified cause: ${exactCause!.label}`
          : `Verified state: Settlement ${settlementId} is failed.\nDiagnosis: The exact reconciliation failure is not recorded and cannot be verified.`
        : status === "processing"
          ? `Verified state: Settlement ${settlementId} is processing.\nDiagnosis: No failure is recorded; reconciliation is still processing.`
          : status === "pending"
            ? `Verified state: Settlement ${settlementId} is pending.\nDiagnosis: No failure is recorded for this settlement yet.`
            : status === "settled" || status === "completed"
              ? `Verified state: Settlement ${settlementId} is ${status}.\nDiagnosis: No current settlement failure is recorded.`
              : status === "cancelled"
                ? `Verified state: Settlement ${settlementId} is cancelled.\nDiagnosis: The record confirms cancellation, but no separate failure cause is recorded.`
                : `Verified state: Settlement ${settlementId} is ${status}.\nDiagnosis: The exact cause cannot be verified from the recorded fields.`;

    return {
      toolId: "merchant.settlement.diagnosis",
      title: "Merchant settlement diagnosis",
      summary,
      verification:
        causeVerified || stateIsNonFailure ? "verified" : "partial",
      confidence:
        causeVerified || stateIsNonFailure ? "high" : "medium",
      facts: [
        { label: "Settlement ID", value: settlementId },
        { label: "Status", value: status },
        { label: "Payment count", value: Number(settlement.paymentCount ?? 0) },
        { label: "Gross amount", value: Number(settlement.grossAmount ?? 0) },
        { label: "Fee amount", value: Number(settlement.feeAmount ?? 0) },
        { label: "Refund amount", value: Number(settlement.refundAmount ?? 0) },
        { label: "Net amount", value: Number(settlement.netAmount ?? 0) },
        { label: "Currency", value: text(settlement.currency) || null },
        { label: "Linked payout ID", value: text(settlement.payoutId) || null },
        {
          label: "Failure reason recorded",
          value: Boolean(failureReason),
        },
        { label: "Period start", value: iso(settlement.periodStart) },
        { label: "Period end", value: iso(settlement.periodEnd) },
        { label: "Settled at", value: iso(settlement.settledAt) },
        { label: "Updated at", value: iso(settlement.updatedAt) },
      ],
      sources: [
        {
          type: "merchant_settlement",
          label: "Owned merchant settlement record",
          reference: settlementId,
        },
      ],
      suggestedActions: [
        {
          label: "Open settlement details",
          href: `/dashboard/merchant/settlement/${encodeURIComponent(settlementId)}`,
        },
        {
          label: "Open settlements",
          href: "/dashboard/merchant/settlement",
        },
      ],
      diagnosis: {
        subjectType: "settlement",
        subjectId: settlementId,
        state: status,
        exactCause,
        possibleCauses: [],
        nextSteps: [
          {
            label: causeVerified
              ? "Review the recorded settlement failure and linked payout"
              : "Review the settlement detail and linked payout before any manual follow-up",
            href: `/dashboard/merchant/settlement/${encodeURIComponent(settlementId)}`,
          },
        ],
        verified: causeVerified || stateIsNonFailure,
      },
      data: {
        kind: "merchant_settlement_diagnosis",
        settlement: {
          settlementId,
          status,
          paymentCount: Number(settlement.paymentCount ?? 0),
          grossAmount: Number(settlement.grossAmount ?? 0),
          feeAmount: Number(settlement.feeAmount ?? 0),
          refundAmount: Number(settlement.refundAmount ?? 0),
          netAmount: Number(settlement.netAmount ?? 0),
          currency: settlement.currency ?? null,
          payoutId: settlement.payoutId ?? null,
          hasRecordedFailureReason: Boolean(failureReason),
          settledAt: iso(settlement.settledAt),
          updatedAt: iso(settlement.updatedAt),
        },
      },
    };
  },
};
