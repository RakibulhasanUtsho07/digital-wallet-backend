import type { EKYCConfig } from "../config/ekycConfig.js";
import { bestNameScore } from "../matching/nameSimilarity.js";
import type { DecisionInput, DecisionResult } from "../types.js";

export function decideEKYC(input: DecisionInput, config: EKYCConfig): DecisionResult {
  const name = bestNameScore(input.claimedName, [
    input.identity.ecNameEnglish,
    input.identity.ecNameBangla,
    input.ocr.nameEnglish,
    input.ocr.nameBangla,
  ]);
  const common = { faceScore: input.identity.faceMatchScore, nameScore: name.score };

  if (!input.identity.nidMatched) return { ...common, status: "REJECTED", reasons: ["NID_MISMATCH"] };
  if (!input.identity.dateOfBirthMatched) return { ...common, status: "REJECTED", reasons: ["DOB_MISMATCH"] };
  if (!input.liveness.conclusive) {
    return { ...common, status: "PENDING_MANUAL_REVIEW", reasons: ["LIVENESS_INCONCLUSIVE"] };
  }
  if (!input.liveness.passed || input.liveness.attackSignals.length) {
    return { ...common, status: "REJECTED", reasons: ["LIVENESS_FAILED"] };
  }
  if (input.identity.faceMatchScore < config.thresholds.faceManualReview) {
    return { ...common, status: "REJECTED", reasons: ["FACE_SCORE_REJECTED"] };
  }
  if (input.possibleBiometricDuplicate) {
    return {
      ...common,
      status: "PENDING_MANUAL_REVIEW",
      reasons: ["POSSIBLE_BIOMETRIC_DUPLICATE"],
    };
  }
  if (input.identity.faceMatchScore < config.thresholds.faceAutoApprove) {
    return {
      ...common,
      status: "PENDING_MANUAL_REVIEW",
      reasons: ["FACE_SCORE_MANUAL_REVIEW"],
    };
  }
  if (name.requiresTransliteration || name.score < config.thresholds.nameMatch) {
    return {
      ...common,
      status: "PENDING_MANUAL_REVIEW",
      reasons: ["NAME_SCORE_BELOW_THRESHOLD"],
    };
  }
  return { ...common, status: "VERIFIED", reasons: ["AUTO_APPROVED"] };
}
