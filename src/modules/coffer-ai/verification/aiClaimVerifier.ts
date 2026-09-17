import { buildCanonicalPaymentExplanation } from "../providers/aiExplanationProvider.js";
import type { AiDiagnosis } from "../types/cofferAi.types.js";

export interface AiVerifiedExplanation {
  content: string;
  usedFallback: boolean;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * V1 only releases the deterministic, evidence-derived explanation. A model
 * draft is accepted only when it exactly matches that canonical statement.
 */
export function verifyPaymentExplanation(input: {
  draft: string;
  diagnosis: AiDiagnosis;
}): AiVerifiedExplanation {
  const canonical = buildCanonicalPaymentExplanation(input.diagnosis);
  const accepted = normalize(input.draft) === normalize(canonical);

  return {
    content: canonical,
    usedFallback: !accepted,
  };
}
