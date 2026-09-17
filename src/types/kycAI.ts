export type KYCAIRecommendation =
  | "likely_clear"
  | "manual_review"
  | "likely_reject";

export type KYCAIRiskLevel =
  | "Low"
  | "Medium"
  | "High"
  | "Critical";

export type KYCAIReviewStatus =
  | "processing"
  | "completed"
  | "failed";

export type KYCAITriggeredBy =
  | "automatic_submission"
  | "admin_rerun";

export interface KYCAISanitizedSignals {
  documentType:
    string;

  provider:
    string;

  status:
    string;

  hasFrontImage:
    boolean;

  hasBackImage:
    boolean;

  hasSelfieImage:
    boolean;

  submittedAt:
    string |
    null;

  priorRiskLevel:
    string |
    null;

  priorRiskScore:
    number |
    null;
}

export interface KYCAIModelOutput {
  recommendation:
    KYCAIRecommendation;

  confidence:
    number;

  riskLevel:
    KYCAIRiskLevel;

  summary:
    string;

  reasons:
    string[];

  missingSignals:
    string[];
}
