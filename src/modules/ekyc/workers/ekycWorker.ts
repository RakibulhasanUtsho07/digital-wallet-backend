import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { Worker, type Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { IComplianceScreeningProvider } from "../compliance/screening.js";
import type { DynamicEKYCConfig } from "../config/ekycConfig.js";
import { evaluateLiveness } from "../liveness/livenessPolicy.js";
import type { IPrivateMediaStore } from "../media/CloudinaryPrivateMediaStore.js";
import {
  EKYCVerification,
  type IEKYCVerification,
} from "../models/EKYCVerification.js";
import type { EKYCProviderFactory } from "../providers/EKYCProviderFactory.js";
import { ECProviderError } from "../providers/ECProviderError.js";
import {
  EKYC_QUEUE_NAME,
  type EKYCJobData,
} from "../queue/ekycQueue.js";
import {
  decryptField,
  encryptField,
} from "../security/fieldEncryption.js";
import { appendAuditEvent } from "../services/auditService.js";
import { decideEKYC } from "../services/decisionEngine.js";
import type { EKYCStatusProjector } from "../services/statusProjectionService.js";
import type {
  DecisionResult,
  ActiveLivenessEvidence,
  EKYCReasonCode,
  EKYCStatus,
  PrivateMediaRefs,
} from "../types.js";
import {
  enqueueStatusWebhook,
  type EKYCWebhookJobData,
} from "../webhooks/webhookService.js";
import type {
  FaceDuplicateMatch,
  IFaceVectorStore,
} from "../vector/QdrantFaceVectorStore.js";

interface WorkerDependencies {
  redis: Redis;
  dynamicConfig: DynamicEKYCConfig;
  providerFactory: EKYCProviderFactory;
  vectorStore: IFaceVectorStore;
  mediaStore: IPrivateMediaStore;
  webhookQueue: Queue<EKYCWebhookJobData>;
  screeningProvider: IComplianceScreeningProvider;
  projectStatus: EKYCStatusProjector;
}

function normalizeDigits(value: string): string {
  const banglaDigits = "০১২৩৪৫৬৭৮৯";

  return value
    .normalize("NFKC")
    .replace(
      /[০-৯]/g,
      (digit) => String(banglaDigits.indexOf(digit))
    )
    .replace(/\D/g, "");
}

function normalizeOCRNID(
  value: string,
  dateOfBirth: string
): string {
  const digits = normalizeDigits(value);

  return digits.length === 13
    ? `${dateOfBirth.slice(0, 4)}${digits}`
    : digits;
}

function normalizeSubmittedNID(value: string): string {
  return normalizeDigits(value);
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();

  const ymd = trimmed.match(
    /^((?:19|20)\d{2})[/.](\d{1,2})[/.](\d{1,2})$/
  );

  if (ymd) {
    return `${ymd[1]}-${ymd[2]!.padStart(2, "0")}-${ymd[3]!.padStart(2, "0")}`;
  }

  const dmy = trimmed.match(
    /^(\d{1,2})[/.](\d{1,2})[/.]((?:19|20)\d{2})$/
  );

  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }

  return trimmed;
}

function verificationIdOf(
  verification: Pick<IEKYCVerification, "_id">
): string {
  const rawId = verification._id;
  const verificationId =
    rawId instanceof mongoose.Types.ObjectId
      ? rawId.toHexString()
      : String(rawId);

  if (!mongoose.Types.ObjectId.isValid(verificationId)) {
    throw new Error(
      "The e-KYC verification contains an invalid ID."
    );
  }

  return verificationId;
}

function eventIdFor(
  verificationId: string,
  attemptId: string,
  status: EKYCStatus
): string {
  return createHash("sha256")
    .update(
      `ekyc-status:${verificationId}:${attemptId}:${status}`
    )
    .digest("hex");
}

async function publishDecision(
  verification: Pick<
    IEKYCVerification,
    | "_id"
    | "userId"
    | "correlationId"
    | "attemptId"
    | "status"
    | "reasonCodes"
    | "decidedAt"
  >,
  deps: WorkerDependencies,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const verificationId =
    verificationIdOf(verification);
  const userId =
    verification.userId.toString();

  await deps.projectStatus(
    userId,
    verification.status
  );

  await appendAuditEvent({
    verificationId,
    eventType: "VERIFICATION_DECIDED",
    actorType: "SYSTEM",
    correlationId:
      verification.correlationId,
    idempotencyKey:
      `decision:${verification.attemptId}:${verification.status}`,
    metadata: {
      status: verification.status,
      reasons: verification.reasonCodes,
      ...metadata,
    },
  });

  await enqueueStatusWebhook(
    deps.webhookQueue,
    {
      verificationId,
      userId,
      status: verification.status,
      reasonCodes:
        verification.reasonCodes,
      occurredAt:
        verification.decidedAt?.toISOString() ||
        new Date().toISOString(),
      eventId: eventIdFor(
        verificationId,
        verification.attemptId,
        verification.status
      ),
    }
  );
}

async function finalize(
  verification: IEKYCVerification,
  status: EKYCStatus,
  reasonCodes: EKYCReasonCode[],
  deps: WorkerDependencies,
  extra: Record<string, unknown> = {},
  auditMetadata: Record<string, unknown> = {}
): Promise<void> {
  const updated =
    await EKYCVerification.findOneAndUpdate(
      {
        _id: verification._id,
        status: {
          $in: [
            "QUEUED",
            "PROCESSING",
          ],
        },
      },
      {
        $set: {
          status,
          activeAttempt:
            status ===
            "PENDING_MANUAL_REVIEW",
          reasonCodes: [
            ...new Set(reasonCodes),
          ],
          decidedAt: new Date(),
          ...extra,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

  if (!updated) {
    const existing =
      await EKYCVerification.findById(
        verification._id
      );

    if (
      existing &&
      ![
        "QUEUED",
        "PROCESSING",
      ].includes(existing.status)
    ) {
      await publishDecision(
        existing,
        deps,
        auditMetadata
      );
    }

    return;
  }

  await publishDecision(
    updated,
    deps,
    auditMetadata
  );
}

function providerReason(
  error: ECProviderError
): EKYCReasonCode {
  if (error.code === "TIMEOUT") {
    return "PROVIDER_TIMEOUT";
  }

  if (
    error.code ===
    "INVALID_RESPONSE"
  ) {
    return "PROVIDER_RESPONSE_INVALID";
  }

  if (
    error.code ===
    "REQUEST_REJECTED"
  ) {
    return "PROVIDER_REQUEST_REJECTED";
  }

  return "PROVIDER_UNAVAILABLE";
}

export function createEKYCWorker(
  deps: WorkerDependencies
): Worker<EKYCJobData> {
  const worker =
    new Worker<EKYCJobData>(
      EKYC_QUEUE_NAME,
      async (job) => {
        const verification =
          await EKYCVerification.findById(
            job.data.verificationId
          ).select(
            "+nidEncrypted +dateOfBirthEncrypted +claimedNameEncrypted +mediaRefsEncrypted " +
              "+livenessEvidenceEncrypted +nidLookupHash"
          );

        if (
          !verification ||
          verification.attemptId !==
            job.data.attemptId
        ) {
          return;
        }

        const verificationId =
          verificationIdOf(
            verification
          );

        if (
          ![
            "QUEUED",
            "PROCESSING",
          ].includes(
            verification.status
          )
        ) {
          await publishDecision(
            verification,
            deps
          );

          return;
        }

        if (
          verification.status ===
          "QUEUED"
        ) {
          verification.status =
            "PROCESSING";
          verification.processingStartedAt =
            new Date();

          await verification.save();

          await deps.projectStatus(
            verification.userId.toString(),
            "PROCESSING"
          );
        }

        const config =
          await deps.dynamicConfig.get();
        const provider =
          await deps.providerFactory.create();

        const nid = decryptField(
          verification.nidEncrypted
        );
        const dateOfBirth =
          decryptField(
            verification.dateOfBirthEncrypted
          );
        const claimedName =
          decryptField(
            verification.claimedNameEncrypted
          );

        const refs = JSON.parse(
          decryptField(
            verification.mediaRefsEncrypted
          )
        ) as PrivateMediaRefs;

        const livenessEvidence =
          JSON.parse(
            decryptField(
              verification.livenessEvidenceEncrypted
            )
          ) as ActiveLivenessEvidence;

        deps.mediaStore.assertOwnedBy(
          refs,
          verification.userId.toString()
        );

        const media =
          await deps.mediaStore.createReadUrls(
            refs,
            60
          );

        const request = {
          nid,
          dateOfBirth,
          claimedName,
          media,
          liveness:
            livenessEvidence,
          correlationId:
            verification.correlationId,
        };

        let ocr;

        try {
          ocr =
            await provider.parseOCR(
              request
            );
        } catch (error: unknown) {
          if (
            error instanceof
            ECProviderError
          ) {
            await finalize(
              verification,
              "PENDING_MANUAL_REVIEW",
              [providerReason(error)],
              deps
            );

            return;
          }

          throw error;
        }

        /*
         * Never allow missing OCR identity fields to silently pass.
         *
         * Local OCR must extract both NID and DOB before the typed values
         * can be trusted against the uploaded document.
         */
        if (
          !ocr.nid?.trim() ||
          !ocr.dateOfBirth?.trim()
        ) {
          await finalize(
            verification,
            "PENDING_MANUAL_REVIEW",
            ["DOCUMENT_NOT_RECOGNIZED"],
            deps
          );

          return;
        }

        if (ocr.confidence < 70) {
          await finalize(
            verification,
            "PENDING_MANUAL_REVIEW",
            ["OCR_CONFIDENCE_LOW"],
            deps
          );

          return;
        }

        const submittedNID =
          normalizeSubmittedNID(nid);
        const extractedNID =
          normalizeOCRNID(
            ocr.nid,
            dateOfBirth
          );

        if (
          extractedNID !==
          submittedNID
        ) {
          await finalize(
            verification,
            "PENDING_MANUAL_REVIEW",
            ["OCR_NID_MISMATCH"],
            deps
          );

          return;
        }

        if (
          normalizeDate(
            ocr.dateOfBirth
          ) !==
          normalizeDate(dateOfBirth)
        ) {
          await finalize(
            verification,
            "PENDING_MANUAL_REVIEW",
            ["OCR_DOB_MISMATCH"],
            deps
          );

          return;
        }

        let liveness;

        try {
          liveness =
            await provider.checkLiveness(
              request
            );
        } catch (error: unknown) {
          if (
            error instanceof
            ECProviderError
          ) {
            await finalize(
              verification,
              "PENDING_MANUAL_REVIEW",
              [providerReason(error)],
              deps
            );

            return;
          }

          throw error;
        }

        const livenessPolicy =
          await evaluateLiveness(
            liveness,
            config,
            deps.redis,
            verificationId
          );

        liveness.passed =
          livenessPolicy.passed;
        liveness.conclusive =
          liveness.conclusive &&
          livenessPolicy.conclusive;

        if (
          !liveness.conclusive ||
          !liveness.passed
        ) {
          await finalize(
            verification,
            "PENDING_MANUAL_REVIEW",
            [
              liveness.conclusive
                ? "LIVENESS_FAILED"
                : "LIVENESS_INCONCLUSIVE",
            ],
            deps,
            {
              livenessPassed:
                false,
            },
            {
              livenessPolicyReasons:
                livenessPolicy.reasons,
            }
          );

          return;
        }

        let identity;

        try {
          identity =
            await provider.verifyIdentity(
              request
            );
        } catch (error: unknown) {
          if (
            error instanceof
            ECProviderError
          ) {
            await finalize(
              verification,
              "PENDING_MANUAL_REVIEW",
              [providerReason(error)],
              deps
            );

            return;
          }

          throw error;
        }

        let duplicate:
          FaceDuplicateMatch | null =
          null;

        if (
          identity.faceEmbedding
        ) {
          try {
            duplicate =
              await deps.vectorStore.findDuplicate(
                identity.faceEmbedding,
                config.thresholds
                  .biometricDuplicate
              );
          } catch {
            await finalize(
              verification,
              "PENDING_MANUAL_REVIEW",
              [
                "VECTOR_STORE_UNAVAILABLE",
              ],
              deps,
              {
                providerName:
                  provider.name,
                livenessPassed:
                  true,
              }
            );

            return;
          }
        }

        let decision:
          DecisionResult =
          decideEKYC(
            {
              identity,
              ocr,
              liveness,
              claimedName,
              possibleBiometricDuplicate:
                Boolean(duplicate),
            },
            config
          );

        let screeningReference:
          string | undefined;

        if (
          decision.reasons.includes(
            "AUTOMATED_CHECKS_COMPLETED"
          )
        ) {
          if (
            !identity.faceEmbedding
          ) {
            decision = {
              ...decision,
              status:
                "PENDING_MANUAL_REVIEW",
              reasons: [
                "VECTOR_STORE_UNAVAILABLE",
              ],
            };
          } else {
            try {
              const screening =
                await deps.screeningProvider.screen(
                  {
                    name: claimedName,
                    dateOfBirth,
                    correlationId:
                      verification.correlationId,
                  }
                );

              screeningReference =
                screening.screeningReference;

              if (
                screening.sanctionsPotentialMatch ||
                screening.pepOrIpPotentialMatch ||
                screening.adverseMediaPotentialMatch
              ) {
                decision = {
                  ...decision,
                  status:
                    "PENDING_MANUAL_REVIEW",
                  reasons: [
                    "COMPLIANCE_SCREENING_REVIEW",
                  ],
                };
              }
            } catch {
              decision = {
                ...decision,
                status:
                  "PENDING_MANUAL_REVIEW",
                reasons: [
                  "SCREENING_UNAVAILABLE",
                ],
              };
            }
          }
        }

        /*
         * Existing project behavior is intentionally preserved here:
         * after automated checks, the attempt is sent to manual review.
         *
         * Do not change this to decision.status unless your product policy
         * explicitly allows fully automated VERIFIED/REJECTED decisions.
         */
        const manualReviewReasons:
          EKYCReasonCode[] =
          decision.reasons;

        await finalize(
          verification,
          "PENDING_MANUAL_REVIEW",
          manualReviewReasons,
          deps,
          {
            providerName:
              provider.name,
            providerReferenceEncrypted:
              encryptField(
                identity.providerReference
              ),
            ...(screeningReference
              ? {
                  screeningReferenceEncrypted:
                    encryptField(
                      screeningReference
                    ),
                }
              : {}),
            ...(identity.faceEmbedding
              ? {
                  faceEmbeddingEncrypted:
                    encryptField(
                      JSON.stringify(
                        identity.faceEmbedding
                      )
                    ),
                }
              : {}),
            faceScore:
              decision.faceScore,
            faceQualityScore:
              decision.faceQualityScore,
            faceSharpnessScore:
              identity.faceQuality
                .sharpnessScore,
            faceBrightnessScore:
              identity.faceQuality
                .brightnessScore,
            faceCoverage:
              identity.faceQuality
                .faceCoverage,
            facePoseValid:
              identity.faceQuality
                .poseValid,
            faceOcclusionDetected:
              identity.faceQuality
                .occlusionDetected,
            nameScore:
              decision.nameScore,
            livenessPassed: true,
            possibleDuplicateVectorId:
              duplicate?.pointId,
            possibleDuplicateScore:
              duplicate?.score,
          },
          {
            faceScore:
              decision.faceScore,
            faceQualityScore:
              decision.faceQualityScore,
            faceSharpnessScore:
              identity.faceQuality
                .sharpnessScore,
            faceBrightnessScore:
              identity.faceQuality
                .brightnessScore,
            faceCoverage:
              identity.faceQuality
                .faceCoverage,
            facePoseValid:
              identity.faceQuality
                .poseValid,
            faceOcclusionDetected:
              identity.faceQuality
                .occlusionDetected,
            nameScore:
              decision.nameScore,
            duplicateScore:
              duplicate?.score ?? null,
          }
        );
      },
      {
        connection: deps.redis,
        concurrency: 8,
        lockDuration: 30_000,
      }
    );

  worker.on(
    "error",
    (error) => {
      console.error(
        "EKYC WORKER ERROR:",
        error.message
      );
    }
  );

  worker.on(
    "failed",
    (job, error) => {
      console.error(
        "EKYC JOB FAILED:",
        {
          jobId: job?.id,
          attemptsMade:
            job?.attemptsMade,
          message: error.message,
        }
      );
    }
  );

  return worker;
}

export default createEKYCWorker;
