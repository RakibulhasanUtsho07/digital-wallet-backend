import { CofferAiError } from "../../errors/cofferAiError.js";
import { diagnosePayment } from "../../diagnostics/paymentDiagnosticService.js";
import { buildCanonicalPaymentExplanation } from "../../providers/aiExplanationProvider.js";
import type { MerchantOwnedPaymentReader } from "../../types/cofferAi.types.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export function createGetOwnMerchantPaymentTimelineTool(
  reader: MerchantOwnedPaymentReader,
): AiToolDefinition {
  return {
    id: "merchant.payment.timeline",

    async execute({ actor, payload }) {
      if (actor.actorType !== "merchant" || !actor.merchantId) {
        throw new CofferAiError({
          code: "AI_MERCHANT_SCOPE_REQUIRED",
          message: "A merchant account context is required.",
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
          message: "A merchant payment reference is required.",
          statusCode: 400,
        });
      }

      const evidence = await reader.findOwnedMerchantPaymentTimeline({
        paymentId,
        merchantId: actor.merchantId,
      });

      if (!evidence) {
        throw new CofferAiError({
          code: "AI_PAYMENT_NOT_FOUND",
          message: "The payment was not found in this merchant account.",
          statusCode: 404,
        });
      }

      const diagnosis = diagnosePayment(evidence);
      const suggestedActions = [
        {
          label: "Open payment details",
          href: `/dashboard/merchant/payments/${encodeURIComponent(
            evidence.paymentId,
          )}`,
        },
        ...diagnosis.nextSteps.map((action) =>
          action.href === "/dashboard/transactions"
            ? { ...action, href: "/dashboard/merchant/payments" }
            : action,
        ),
      ];

      return {
        toolId: "merchant.payment.timeline" as const,
        title: "Merchant payment diagnosis",
        summary: buildCanonicalPaymentExplanation(diagnosis),
        verification: diagnosis.verified
          ? ("verified" as const)
          : diagnosis.possibleCauses.length
            ? ("partial" as const)
            : ("unknown" as const),
        confidence: diagnosis.verified
          ? ("high" as const)
          : (diagnosis.possibleCauses[0]?.confidence ?? ("low" as const)),
        facts: [
          { label: "Reference", value: evidence.paymentId },
          { label: "State", value: evidence.state },
          { label: "Failure code", value: evidence.failureCode },
          { label: "Failure category", value: evidence.failureCategory },
          { label: "Currency", value: evidence.currency },
          { label: "Created", value: evidence.createdAt },
          { label: "Updated", value: evidence.updatedAt },
        ],
        sources: [
          {
            type: "merchant_payment_timeline",
            label: "Owned merchant payment timeline",
            reference: evidence.paymentId,
          },
        ],
        suggestedActions,
        diagnosis: {
          ...diagnosis,
          nextSteps: suggestedActions,
        },
        data: {
          kind: "merchant_payment_diagnosis",
          evidence,
        },
      };
    },
  };
}
