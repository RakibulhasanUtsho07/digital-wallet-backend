import { createHash, randomUUID } from "node:crypto";
import type { Redis } from "ioredis";

const TOKEN_TTL_SECONDS = 15 * 60;
const FRONT_TERMS = [
  /national\s+id/i,
  /identity\s+card/i,
  /government\s+of\s+(the\s+)?people'?s\s+republic\s+of\s+bangladesh/i,
  /জাতীয়\s*পরিচয়পত্র/u,
  /গণপ্রজাতন্ত্রী\s*বাংলাদেশ/u,
  /\bname\b/i,
  /\bdate\s+of\s+birth\b/i,
  /\b(?:\d{10}|\d{13}|\d{17})\b/,
];
const BACK_TERMS = [
  /\baddress\b/i,
  /\bblood\s+group\b/i,
  /\bissue\s+date\b/i,
  /\bsignature\b/i,
  /ঠিকানা/u,
  /রক্তের\s*গ্রুপ/u,
  /প্রদানকারী\s*কর্তৃপক্ষ/u,
  /government/i,
];

export interface NIDPreflightFiles {
  front: Express.Multer.File;
  back: Express.Multer.File;
}

interface StoredDocumentValidation {
  userId: string;
  frontHash: string;
  backHash: string;
  validatedAt: string;
}

export class NIDDocumentValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = "NIDDocumentValidationError";
  }
}

function hash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function detectType(buffer: Buffer): "jpeg" | "png" | "webp" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "webp";
  return null;
}

function assertImage(file: Express.Multer.File, label: string): void {
  const expected: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const actual = file?.buffer ? detectType(file.buffer) : null;
  if (!actual || expected[file.mimetype] !== actual) {
    throw new NIDDocumentValidationError(
      `${label} does not contain a valid JPG, PNG, or WEBP image.`,
      "DOCUMENT_FILE_INVALID"
    );
  }
  if (file.size < 25_000 || file.size > 2 * 1024 * 1024) {
    throw new NIDDocumentValidationError(
      `${label} must be a clear image between 25 KB and 2 MB.`,
      "DOCUMENT_IMAGE_QUALITY_LOW"
    );
  }
}

async function visionText(file: Express.Multer.File): Promise<string> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production" && process.env.EKYC_ALLOW_DOCUMENT_HEURISTIC === "true") {
      return "development heuristic national id name date of birth address government";
    }
    throw new NIDDocumentValidationError(
      "NID OCR validation is temporarily unavailable.",
      "DOCUMENT_VALIDATION_UNAVAILABLE",
      503
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { content: file.buffer.toString("base64") },
            features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
          }],
        }),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new NIDDocumentValidationError(
        "NID OCR provider could not validate the document.",
        "DOCUMENT_VALIDATION_UNAVAILABLE",
        503
      );
    }
    const payload = await response.json() as {
      responses?: Array<{ fullTextAnnotation?: { text?: string }; error?: { message?: string } }>;
    };
    const result = payload.responses?.[0];
    if (result?.error) {
      throw new NIDDocumentValidationError(
        "NID OCR provider could not validate the document.",
        "DOCUMENT_VALIDATION_UNAVAILABLE",
        503
      );
    }
    return result?.fullTextAnnotation?.text?.normalize("NFKC") || "";
  } catch (error) {
    if (error instanceof NIDDocumentValidationError) throw error;
    throw new NIDDocumentValidationError(
      "NID OCR validation timed out. Please try again.",
      "DOCUMENT_VALIDATION_UNAVAILABLE",
      503
    );
  } finally {
    clearTimeout(timeout);
  }
}

function matchCount(text: string, terms: RegExp[]): number {
  return terms.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function tokenKey(id: string): string {
  return `ekyc:document-validation:${id}`;
}

export class NIDDocumentValidationService {
  constructor(private readonly redis: Redis) {}

  async validateAndIssue(userId: string, files: NIDPreflightFiles): Promise<{
    validationId: string;
    expiresAt: string;
    frontSignals: number;
    backSignals: number;
  }> {
    assertImage(files.front, "NID front image");
    assertImage(files.back, "NID back image");

    const [frontText, backText] = await Promise.all([
      visionText(files.front),
      visionText(files.back),
    ]);
    const frontSignals = matchCount(frontText, FRONT_TERMS);
    const backSignals = matchCount(backText, BACK_TERMS);
    if (frontText.length < 20 || frontSignals < 3 || backText.length < 10 || backSignals < 1) {
      throw new NIDDocumentValidationError(
        "The uploaded files do not appear to be the front and back of a Bangladesh NID.",
        "DOCUMENT_NOT_RECOGNIZED"
      );
    }

    const validationId = randomUUID();
    const record: StoredDocumentValidation = {
      userId,
      frontHash: hash(files.front.buffer),
      backHash: hash(files.back.buffer),
      validatedAt: new Date().toISOString(),
    };
    await this.redis.set(tokenKey(validationId), JSON.stringify(record), "EX", TOKEN_TTL_SECONDS);
    return {
      validationId,
      expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
      frontSignals,
      backSignals,
    };
  }

  async consume(
    validationId: string,
    userId: string,
    files: NIDPreflightFiles
  ): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(validationId)) {
      throw new NIDDocumentValidationError(
        "Validate the NID images before submitting.",
        "DOCUMENT_VALIDATION_REQUIRED"
      );
    }
    const raw = await this.redis.getdel(tokenKey(validationId));
    if (!raw) {
      throw new NIDDocumentValidationError(
        "Document validation expired. Validate the NID images again.",
        "DOCUMENT_VALIDATION_EXPIRED"
      );
    }
    const record = JSON.parse(raw) as StoredDocumentValidation;
    if (
      record.userId !== userId ||
      record.frontHash !== hash(files.front.buffer) ||
      record.backHash !== hash(files.back.buffer)
    ) {
      throw new NIDDocumentValidationError(
        "The submitted NID images differ from the validated images.",
        "DOCUMENT_VALIDATION_MISMATCH"
      );
    }
  }
}
