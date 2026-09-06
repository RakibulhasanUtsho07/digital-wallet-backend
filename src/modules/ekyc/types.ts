/* =========================================================
   STATUS AND REASON TYPES
========================================================= */

export type EKYCStatus =
  | "QUEUED"
  | "PROCESSING"
  | "VERIFIED"
  | "PENDING_MANUAL_REVIEW"
  | "REJECTED";

export type EKYCReasonCode =
  | "AUTO_APPROVED"
  | "AGE_UNDER_18"
  | "INVALID_IDENTITY_INPUT"
  | "NID_MISMATCH"
  | "DOB_MISMATCH"
  | "OCR_NID_MISMATCH"
  | "OCR_DOB_MISMATCH"
  | "OCR_CONFIDENCE_LOW"
  | "NAME_SCORE_BELOW_THRESHOLD"
  | "FACE_SCORE_MANUAL_REVIEW"
  | "FACE_SCORE_REJECTED"
  | "LIVENESS_FAILED"
  | "LIVENESS_INCONCLUSIVE"
  | "POSSIBLE_BIOMETRIC_DUPLICATE"
  | "NID_ALREADY_VERIFIED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_RESPONSE_INVALID"
  | "COMPLIANCE_SCREENING_REVIEW"
  | "SCREENING_UNAVAILABLE"
  | "ADMIN_OVERRIDE";

/* =========================================================
   ENCRYPTED DATA
========================================================= */

export interface EncryptedField {
  encrypted: string;
  iv: string;
  authTag: string;
  keyVersion: string;
}

/* =========================================================
   MEDIA
========================================================= */

export interface PrivateMediaRefs {
  nidFrontObjectRef: string;
  nidBackObjectRef: string;
  selfieObjectRef: string;
}

export interface SignedMediaUrls {
  nidFrontUrl: string;
  nidBackUrl: string;
  selfieUrl: string;
}

/* =========================================================
   SUBMISSION
========================================================= */

export interface EKYCSubmission {
  userId: string;
  nid: string;
  dateOfBirth: string;
  claimedName: string;
  media: PrivateMediaRefs;
  ipAddress: string;
  deviceId: string;
  correlationId: string;
}

/* =========================================================
   PROVIDER REQUEST
========================================================= */

export interface ProviderVerificationRequest {
  nid: string;
  dateOfBirth: string;
  claimedName: string;
  media: SignedMediaUrls;
  correlationId: string;
}

/* =========================================================
   PROVIDER RESULTS
========================================================= */

export interface IdentityVerificationResult {
  nidMatched: boolean;
  dateOfBirthMatched: boolean;
  ecNameEnglish?: string;
  ecNameBangla?: string;
  faceMatchScore: number;
  faceEmbedding?: number[];
  providerReference: string;
}

export interface OCRResult {
  nid?: string;
  dateOfBirth?: string;
  nameEnglish?: string;
  nameBangla?: string;
  confidence: number;
}

export type LivenessAttackSignal =
  | "SCREEN_REPLAY"
  | "PRINT_ATTACK"
  | "MASK"
  | "MULTIPLE_FACES";

export interface LivenessResult {
  passed: boolean;
  conclusive: boolean;
  passiveScore: number;
  activeScore?: number;
  challengePassed?: boolean;
  evidenceId: string;
  capturedAt: string;
  attackSignals: LivenessAttackSignal[];
}

/* =========================================================
   PROVIDER INTERFACE
========================================================= */

export interface IEKYCProvider {
  readonly name:
    | "MOCK_EC"
    | "REAL_EC_PORICHOY";

  verifyIdentity(
    request: ProviderVerificationRequest
  ): Promise<IdentityVerificationResult>;

  parseOCR(
    request: ProviderVerificationRequest
  ): Promise<OCRResult>;

  checkLiveness(
    request: ProviderVerificationRequest
  ): Promise<LivenessResult>;
}

/* =========================================================
   DECISION ENGINE
========================================================= */

export interface DecisionInput {
  identity: IdentityVerificationResult;
  ocr: OCRResult;
  liveness: LivenessResult;
  claimedName: string;
  possibleBiometricDuplicate: boolean;
}

export interface DecisionResult {
  status: Extract<
    EKYCStatus,
    | "VERIFIED"
    | "PENDING_MANUAL_REVIEW"
    | "REJECTED"
  >;

  reasons: EKYCReasonCode[];
  faceScore: number;
  nameScore: number;
}