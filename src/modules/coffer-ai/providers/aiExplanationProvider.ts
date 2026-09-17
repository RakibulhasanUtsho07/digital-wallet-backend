import type {
  AiDiagnosis,
  AiExplanationProvider,
} from "../types/cofferAi.types.js";

export function buildCanonicalPaymentExplanation(
  diagnosis: AiDiagnosis,
): string {
  const subject =
    diagnosis.subjectType ===
    "wallet_transaction"
      ? "Transaction"
      : "Payment";

  if (
    diagnosis.exactCause?.code ===
    "PAYMENT_COMPLETED_RECORDED"
  ) {
    return `${subject} ${diagnosis.subjectId} was completed successfully.`;
  }

  const prefix = `${subject} ${diagnosis.subjectId} is recorded as ${diagnosis.state}.`;

  if (diagnosis.exactCause) {
    if (
      diagnosis.exactCause.evidenceRefs.includes(
        "resource.state",
      )
    ) {
      return prefix;
    }

    return `${prefix} ${diagnosis.exactCause.label}`;
  }

  if (diagnosis.possibleCauses.length > 0) {
    return `${prefix} ${diagnosis.possibleCauses[0].label} The exact reason could not be verified from the available evidence.`;
  }

  return `${prefix} The exact reason could not be verified from the available evidence.`;
}

/**
 * Safe V1 provider. It performs no external model call and cannot invent facts.
 * A model provider can be added later behind the same interface, while the
 * claim verifier remains authoritative.
 */
export class TemplateExplanationProvider
  implements AiExplanationProvider
{
  readonly id = "coffer-template-v1";

  async explainPayment(input: {
    diagnosis: AiDiagnosis;
  }): Promise<string> {
    return buildCanonicalPaymentExplanation(input.diagnosis);
  }
}
