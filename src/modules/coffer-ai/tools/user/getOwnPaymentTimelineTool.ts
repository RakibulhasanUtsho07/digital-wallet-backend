import { CofferAiError } from "../../errors/cofferAiError.js";
import { diagnosePayment } from "../../diagnostics/paymentDiagnosticService.js";
import { buildCanonicalPaymentExplanation } from "../../providers/aiExplanationProvider.js";
import type { OwnedPaymentReader } from "../../types/cofferAi.types.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export function createGetOwnPaymentTimelineTool(
  reader: OwnedPaymentReader,
): AiToolDefinition {
  return {
    id: "user.payment.timeline",
    async execute({ actor, payload }) {
      if (actor.actorType !== "user" || !actor.userId) {
        throw new CofferAiError({
          code: "AI_USER_SCOPE_REQUIRED",
          message: "A personal account context is required.",
          statusCode: 403,
        });
      }

      const paymentId =
        typeof payload.paymentId === "string"
          ? payload.paymentId.trim()
          : typeof payload.resourceId === "string"
            ? payload.resourceId.trim()
            : "";

      if (!paymentId) {
        throw new CofferAiError({
          code: "AI_PAYMENT_REFERENCE_REQUIRED",
          message: "A payment or transaction reference is required.",
          statusCode: 400,
        });
      }

      const evidence = await reader.findOwnedPaymentTimeline({
        paymentId,
        userId: actor.userId,
      });

      if (!evidence) {
        throw new CofferAiError({
          code: "AI_PAYMENT_NOT_FOUND",
          message: "The payment was not found in this account.",
          statusCode: 404,
        });
      }

      const diagnosis = diagnosePayment(evidence);

      return {
        toolId: "user.payment.timeline" as const,
        title: "Payment diagnosis",
        summary: buildCanonicalPaymentExplanation(diagnosis),
        verification: diagnosis.verified
          ? "verified" as const
          : diagnosis.possibleCauses.length
            ? "partial" as const
            : "unknown" as const,
        confidence: diagnosis.verified
          ? "high" as const
          : diagnosis.possibleCauses[0]?.confidence ?? "low" as const,
        facts: [
          { label: "Reference", value: evidence.paymentId },
          { label: "State", value: evidence.state },
          { label: "Currency", value: evidence.currency },
          { label: "Failure code", value: evidence.failureCode },
        ],
        sources: [
          {
            type: evidence.subjectType === "wallet_transaction"
              ? "wallet_transaction_timeline"
              : "payment_timeline",
            label: "Owned payment timeline",
            reference: evidence.paymentId,
          },
        ],
        suggestedActions: diagnosis.nextSteps,
        diagnosis,
        data: { evidence },
      };
    },
  };
}
