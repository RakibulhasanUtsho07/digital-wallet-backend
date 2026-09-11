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
  | "FACE_NOT_DETECTED"
  | "MULTIPLE_FACES"
  | "FACE_QUALITY_LOW"
  | "FACE_POSE_INVALID"
  | "FACE_OCCLUDED"
  | "FACE_EMBEDDING_MISSING"
  | "FACE_SCORE_MANUAL_REVIEW"
  | "FACE_SCORE_REJECTED"
  | "LIVENESS_FAILED"
  | "LIVENESS_INCONCLUSIVE"
  | "FINGERPRINT_MISMATCH"
  | "FINGERPRINT_INCONCLUSIVE"
  | "POSSIBLE_BIOMETRIC_DUPLICATE"
  | "NID_ALREADY_VERIFIED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_RESPONSE_INVALID"
  | "PROVIDER_REQUEST_REJECTED"
  | "COMPLIANCE_SCREENING_REVIEW"
  | "SCREENING_UNAVAILABLE"
  | "VECTOR_STORE_UNAVAILABLE"
  | "ADMIN_OVERRIDE";

export interface EncryptedField {
  encrypted: string;
  iv: string;
  authTag: string;
  keyVersion: string;
}

export interface PrivateMediaRefs {
  nidFrontObjectRef: string;
  nidBackObjectRef: string;
  selfieObjectRef: string;
  livenessVideoObjectRef: string;
}

export interface SignedMediaUrls {
  nidFrontUrl: string;
  nidBackUrl: string;
  selfieUrl: string;
  livenessVideoUrl: string;
}

export type ActiveLivenessAction = "BLINK" | "TURN_LEFT" | "TURN_RIGHT";

export interface ActiveLivenessEvidence {
  sessionId: string;
  challenges: ActiveLivenessAction[];
  issuedAt: string;
  expiresAt: string;
  startedAt: string;
  completedAt: string;
}

export interface FingerprintEvidence {
  captureId: string;
  mode: "MOCK" | "PROVIDER";
  templateBase64?: string;
  providerCaptureReference?: string;
  qualityScore: number;
  capturedAt: string;
}

export interface EKYCSubmission {
  userId: string;
  nid: string;
  dateOfBirth: string;
  claimedName: string;
  media: PrivateMediaRefs;
  liveness: ActiveLivenessEvidence;
  fingerprint?: FingerprintEvidence;
  ipAddress: string;
  deviceId: string;
  correlationId: string;
}

export interface ProviderVerificationRequest {
  nid: string;
  dateOfBirth: string;
  claimedName: string;
  media: SignedMediaUrls;
  liveness: ActiveLivenessEvidence;
  fingerprint?: FingerprintEvidence;
  correlationId: string;
}

export interface FaceQualityResult {
  faceDetected: boolean;
  singleFaceDetected: boolean;
  qualityScore: number;
  sharpnessScore: number;
  brightnessScore: number;
  faceCoverage: number;
  poseValid: boolean;
  occlusionDetected: boolean;
}

export interface IdentityVerificationResult {
  nidMatched: boolean;
  dateOfBirthMatched: boolean;
  ecNameEnglish?: string;
  ecNameBangla?: string;
  faceMatchScore: number;
  faceQuality: FaceQualityResult;
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

export interface LivenessResult {
  passed: boolean;
  conclusive: boolean;
  passiveScore: number;
  activeScore?: number;
  challengePassed?: boolean;
  evidenceId: string;
  capturedAt: string;
  attackSignals: Array<"SCREEN_REPLAY" | "PRINT_ATTACK" | "MASK" | "MULTIPLE_FACES">;
}

export interface FingerprintVerificationResult {
  matched: boolean;
  conclusive: boolean;
  score: number;
  providerReference: string;
}

export interface IEKYCProvider {
  readonly name: "MOCK_EC" | "REAL_EC_PORICHOY";
  verifyIdentity(request: ProviderVerificationRequest): Promise<IdentityVerificationResult>;
  parseOCR(request: ProviderVerificationRequest): Promise<OCRResult>;
  checkLiveness(request: ProviderVerificationRequest): Promise<LivenessResult>;
  verifyFingerprint(request: ProviderVerificationRequest): Promise<FingerprintVerificationResult>;
}

export interface DecisionInput {
  identity: IdentityVerificationResult;
  ocr: OCRResult;
  liveness: LivenessResult;
  fingerprint?: FingerprintVerificationResult;
  claimedName: string;
  possibleBiometricDuplicate: boolean;
}

export interface DecisionResult {
  status: Extract<EKYCStatus, "VERIFIED" | "PENDING_MANUAL_REVIEW" | "REJECTED">;
  reasons: EKYCReasonCode[];
  faceScore: number;
  faceQualityScore: number;
  nameScore: number;
}
