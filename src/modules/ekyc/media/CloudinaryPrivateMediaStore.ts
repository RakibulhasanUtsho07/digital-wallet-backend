import { randomUUID } from "node:crypto";
import type { UploadApiResponse } from "cloudinary";
import cloudinary from "../../../config/cloudinary/cloudinary.js";
import { decryptField, encryptField, keyedLookupHash } from "../security/fieldEncryption.js";
import type { EncryptedField, PrivateMediaRefs, SignedMediaUrls } from "../types.js";

type EvidenceSlot = "nid-front" | "nid-back" | "selfie" | "liveness-video";
type CloudinaryResourceType = "image" | "video";

interface EncodedObjectReference {
  ownerUserId: string;
  publicId: string;
  format: string;
  resourceType: CloudinaryResourceType;
  slot: EvidenceSlot;
  createdAt: string;
}

export interface EKYCEvidenceFiles {
  nidFront: Express.Multer.File;
  nidBack: Express.Multer.File;
  selfie: Express.Multer.File;
  livenessVideo: Express.Multer.File;
}

export interface IPrivateMediaStore {
  uploadAttempt(userId: string, files: EKYCEvidenceFiles): Promise<PrivateMediaRefs>;
  assertOwnedBy(refs: PrivateMediaRefs, userId: string): void;
  createReadUrls(refs: PrivateMediaRefs, expiresInSeconds: number): Promise<SignedMediaUrls>;
  deleteEvidence(refs: PrivateMediaRefs): Promise<void>;
}

export class EKYCMediaValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "EKYCMediaValidationError";
  }
}

function detectImageType(buffer: Buffer): "jpeg" | "png" | "webp" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(png)) return "png";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function detectVideoType(buffer: Buffer): "webm" | "mp4" | null {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "webm";
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return "mp4";
  }
  return null;
}

function validateImage(file: Express.Multer.File): void {
  if (!file?.buffer?.length) {
    throw new EKYCMediaValidationError("A required e-KYC image is empty.");
  }
  if (file.size > 1024 * 1024) {
    throw new EKYCMediaValidationError("Every e-KYC image must be 1 MB or smaller.");
  }

  const detected = detectImageType(file.buffer);
  const expected: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!detected || expected[file.mimetype] !== detected) {
    throw new EKYCMediaValidationError(
      "An uploaded file does not match its declared JPG, PNG, or WEBP type."
    );
  }
}

function validateLivenessVideo(file: Express.Multer.File): void {
  if (!file?.buffer?.length) {
    throw new EKYCMediaValidationError("The active-liveness recording is empty.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new EKYCMediaValidationError("The active-liveness recording must be 8 MB or smaller.");
  }

  const detected = detectVideoType(file.buffer);
  const expected: Record<string, string> = {
    "video/webm": "webm",
    "video/mp4": "mp4",
  };
  if (!detected || expected[file.mimetype] !== detected) {
    throw new EKYCMediaValidationError(
      "The active-liveness recording must be a valid WEBM or MP4 file."
    );
  }
}

function encodeReference(value: EncodedObjectReference): string {
  const encrypted = encryptField(JSON.stringify(value));
  return `ekyc1.${Buffer.from(JSON.stringify(encrypted), "utf8").toString("base64url")}`;
}

function decodeReference(value: string): EncodedObjectReference {
  if (!value.startsWith("ekyc1.") || value.length > 4_096) {
    throw new Error("Invalid private e-KYC object reference.");
  }

  try {
    const raw = Buffer.from(value.slice(6), "base64url").toString("utf8");
    const encrypted = JSON.parse(raw) as EncryptedField;
    const decoded = JSON.parse(decryptField(encrypted)) as Partial<EncodedObjectReference>;
    if (
      typeof decoded.ownerUserId !== "string" ||
      typeof decoded.publicId !== "string" ||
      typeof decoded.format !== "string" ||
      !["image", "video"].includes(String(decoded.resourceType)) ||
      !["nid-front", "nid-back", "selfie", "liveness-video"].includes(String(decoded.slot))
    ) {
      throw new Error("Malformed reference payload.");
    }
    return decoded as EncodedObjectReference;
  } catch {
    throw new Error("Invalid private e-KYC object reference.");
  }
}

async function uploadPrivateEvidence(
  file: Express.Multer.File,
  folder: string,
  slot: EvidenceSlot,
  resourceType: CloudinaryResourceType
): Promise<UploadApiResponse> {
  if (resourceType === "image") validateImage(file);
  else validateLivenessVideo(file);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: slot,
        resource_type: resourceType,
        type: "private",
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(new Error("Private e-KYC evidence upload failed."));
          return;
        }
        if (!result?.public_id || !result.format) {
          reject(new Error("Cloudinary returned an incomplete e-KYC upload response."));
          return;
        }
        resolve(result);
      }
    );
    stream.end(file.buffer);
  });
}

export class CloudinaryPrivateMediaStore implements IPrivateMediaStore {
  async uploadAttempt(userId: string, files: EKYCEvidenceFiles): Promise<PrivateMediaRefs> {
    const ownerRef = keyedLookupHash(userId, "media-owner").slice(0, 32);
    const attemptRef = randomUUID();
    const folder = `digital-payment/ekyc/${ownerRef}/${attemptRef}`;
    const completed: EncodedObjectReference[] = [];

    try {
      const upload = async (
        slot: EvidenceSlot,
        file: Express.Multer.File,
        resourceType: CloudinaryResourceType
      ) => {
        const result = await uploadPrivateEvidence(file, folder, slot, resourceType);
        const reference: EncodedObjectReference = {
          ownerUserId: userId,
          publicId: result.public_id,
          format: result.format,
          resourceType,
          slot,
          createdAt: new Date().toISOString(),
        };
        completed.push(reference);
        return encodeReference(reference);
      };

      const nidFrontObjectRef = await upload("nid-front", files.nidFront, "image");
      const nidBackObjectRef = await upload("nid-back", files.nidBack, "image");
      const selfieObjectRef = await upload("selfie", files.selfie, "image");
      const livenessVideoObjectRef = await upload(
        "liveness-video",
        files.livenessVideo,
        "video"
      );

      return {
        nidFrontObjectRef,
        nidBackObjectRef,
        selfieObjectRef,
        livenessVideoObjectRef,
      };
    } catch (error) {
      await Promise.allSettled(
        completed.map((item) =>
          cloudinary.uploader.destroy(item.publicId, {
            resource_type: item.resourceType,
            type: "private",
            invalidate: true,
          })
        )
      );
      throw error;
    }
  }

  assertOwnedBy(refs: PrivateMediaRefs, userId: string): void {
    const decoded = [
      decodeReference(refs.nidFrontObjectRef),
      decodeReference(refs.nidBackObjectRef),
      decodeReference(refs.selfieObjectRef),
      decodeReference(refs.livenessVideoObjectRef),
    ];
    if (decoded.some((item) => item.ownerUserId !== userId)) {
      throw new Error("The e-KYC evidence does not belong to the authenticated user.");
    }
    const slots = new Set(decoded.map((item) => item.slot));
    if (
      !slots.has("nid-front") ||
      !slots.has("nid-back") ||
      !slots.has("selfie") ||
      !slots.has("liveness-video")
    ) {
      throw new Error("The e-KYC evidence set is incomplete.");
    }
  }

  async createReadUrls(refs: PrivateMediaRefs, expiresInSeconds: number): Promise<SignedMediaUrls> {
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 30 || expiresInSeconds > 600) {
      throw new Error("Private e-KYC URL lifetime must be between 30 and 600 seconds.");
    }

    const front = decodeReference(refs.nidFrontObjectRef);
    const back = decodeReference(refs.nidBackObjectRef);
    const selfie = decodeReference(refs.selfieObjectRef);
    const livenessVideo = decodeReference(refs.livenessVideoObjectRef);
    this.assertOwnedBy(refs, front.ownerUserId);
    const expiresAt = Math.floor(Date.now() / 1_000) + expiresInSeconds;
    const sign = (item: EncodedObjectReference) =>
      cloudinary.utils.private_download_url(item.publicId, item.format, {
        resource_type: item.resourceType,
        type: "private",
        attachment: false,
        expires_at: expiresAt,
      });

    return {
      nidFrontUrl: sign(front),
      nidBackUrl: sign(back),
      selfieUrl: sign(selfie),
      livenessVideoUrl: sign(livenessVideo),
    };
  }

  async deleteEvidence(refs: PrivateMediaRefs): Promise<void> {
    const items = [
      decodeReference(refs.nidFrontObjectRef),
      decodeReference(refs.nidBackObjectRef),
      decodeReference(refs.selfieObjectRef),
      decodeReference(refs.livenessVideoObjectRef),
    ];
    await Promise.allSettled(
      items.map((item) =>
        cloudinary.uploader.destroy(item.publicId, {
          resource_type: item.resourceType,
          type: "private",
          invalidate: true,
        })
      )
    );
  }
}

export default CloudinaryPrivateMediaStore;
