import {
  createHash,
  randomUUID,
} from "node:crypto";
import type { Redis } from "ioredis";
import {
  recognizeNIDBuffer,
  type LocalOCRRecognition,
} from "./localNidOCRService.js";

const TOKEN_TTL_SECONDS = (() => {
  const configured = Number(
    process.env.EKYC_DOCUMENT_VALIDATION_TTL_SECONDS
  );

  if (
    Number.isInteger(configured) &&
    configured >= 300 &&
    configured <= 3600
  ) {
    return configured;
  }

  return 30 * 60;
})();

const FRONT_TERMS = [
  /national\s+id/i,
  /identity\s+card/i,
  /\bnid\b/i,
  /government\s+of\s+(the\s+)?people'?s\s+republic\s+of\s+bangladesh/i,
  /জাতীয়\s*পরিচয়পত্র/u,
  /জাতীয়\s*পরিচয়পত্র/u,
  /গণপ্রজাতন্ত্রী\s*বাংলাদেশ/u,
  /\bname\b/i,
  /নাম/u,
  /\bdate\s+of\s+birth\b/i,
  /\bdob\b/i,
  /জন্ম\s*তারিখ/u,
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
  /ইস্যু\s*তারিখ/u,
  /government/i,
  /বাংলাদেশ/u,
];

const FRONT_PRIMARY_TERMS = [
  /national\s+id/i,
  /identity\s+card/i,
  /\bnid\b/i,
  /জাতীয়\s*পরিচয়পত্র/u,
  /জাতীয়\s*পরিচয়পত্র/u,
  /\bdate\s+of\s+birth\b/i,
  /\bdob\b/i,
  /জন্ম\s*তারিখ/u,
];

export interface NIDPreflightFiles {
  front:
    Express.Multer.File;
  back:
    Express.Multer.File;
}

interface StoredDocumentValidation {
  userId:
    string;
  frontHash:
    string;
  backHash:
    string;
  validatedAt:
    string;
}

interface DocumentEvidence {
  signals:
    number;
  score:
    number;
  hasPrimaryIdentityCue:
    boolean;
  hasNIDNumber:
    boolean;
  hasDateLikeValue:
    boolean;
  banglaCharacterCount:
    number;
}

export class NIDDocumentValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      string,
    readonly statusCode =
      400
  ) {
    super(
      message
    );

    this.name =
      "NIDDocumentValidationError";
  }
}

function hash(
  buffer: Buffer
): string {
  return createHash(
    "sha256"
  )
    .update(
      buffer
    )
    .digest(
      "hex"
    );
}

function detectType(
  buffer: Buffer
):
  | "jpeg"
  | "png"
  | "webp"
  | null {
  if (
    buffer.length >=
      3 &&
    buffer[0] ===
      0xff &&
    buffer[1] ===
      0xd8 &&
    buffer[2] ===
      0xff
  ) {
    return "jpeg";
  }

  if (
    buffer.length >=
      8 &&
    buffer
      .subarray(
        0,
        8
      )
      .equals(
        Buffer.from(
          [
            137,
            80,
            78,
            71,
            13,
            10,
            26,
            10,
          ]
        )
      )
  ) {
    return "png";
  }

  if (
    buffer.length >=
      12 &&
    buffer
      .subarray(
        0,
        4
      )
      .toString(
        "ascii"
      ) ===
      "RIFF" &&
    buffer
      .subarray(
        8,
        12
      )
      .toString(
        "ascii"
      ) ===
      "WEBP"
  ) {
    return "webp";
  }

  return null;
}

function assertImage(
  file:
    Express.Multer.File,
  label:
    string
): void {
  const expected:
    Record<
      string,
      string
    > = {
      "image/jpeg":
        "jpeg",
      "image/png":
        "png",
      "image/webp":
        "webp",
    };

  const actual =
    file?.buffer
      ? detectType(
          file.buffer
        )
      : null;

  if (
    !actual ||
    expected[
      file.mimetype
    ] !==
      actual
  ) {
    throw new NIDDocumentValidationError(
      `${label} does not contain a valid JPG, PNG, or WEBP image.`,
      "DOCUMENT_FILE_INVALID"
    );
  }

  if (
    file.size <
      25_000 ||
    file.size >
      2 *
        1024 *
        1024
  ) {
    throw new NIDDocumentValidationError(
      `${label} must be a clear image between 25 KB and 2 MB.`,
      "DOCUMENT_IMAGE_QUALITY_LOW"
    );
  }
}

async function safeRecognize(
  file:
    Express.Multer.File
): Promise<LocalOCRRecognition> {
  try {
    return await recognizeNIDBuffer(
      file.buffer
    );
  } catch (
    error:
      unknown
  ) {
    console.error(
      "LOCAL NID OCR FAILED:",
      {
        message:
          error instanceof
          Error
            ? error.message
            : String(
                error
              ),
      }
    );

    throw new NIDDocumentValidationError(
      "NID OCR validation is temporarily unavailable.",
      "DOCUMENT_VALIDATION_UNAVAILABLE",
      503
    );
  }
}

function matchCount(
  text:
    string,
  terms:
    RegExp[]
): number {
  return terms.reduce(
    (
      count,
      pattern
    ) =>
      count +
      (pattern.test(
        text
      )
        ? 1
        : 0),
    0
  );
}

function hasNIDNumber(
  text:
    string
): boolean {
  const normalized =
    text.replace(
      /[^\d০-৯\s-]/g,
      " "
    );

  const banglaDigits =
    "০১২৩৪৫৬৭৮৯";

  const ascii =
    normalized.replace(
      /[০-৯]/g,
      (
        digit
      ) =>
        String(
          banglaDigits.indexOf(
            digit
          )
        )
    );

  return (
    /\b\d{10}\b/.test(
      ascii
    ) ||
    /\b\d{13}\b/.test(
      ascii
    ) ||
    /\b\d{17}\b/.test(
      ascii
    ) ||
    /(?:\d[\s-]*){10,17}/.test(
      ascii
    )
  );
}

function hasDateLikeValue(
  text:
    string
): boolean {
  return (
    /\b(?:19|20)\d{2}[\/.\-]\d{1,2}[\/.\-]\d{1,2}\b/.test(
      text
    ) ||
    /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:19|20)\d{2}\b/.test(
      text
    ) ||
    /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2}\b/i.test(
      text
    )
  );
}

function countBanglaCharacters(
  text:
    string
): number {
  return (
    text.match(
      /[\u0980-\u09FF]/gu
    ) ??
    []
  ).length;
}

/**
 * Preflight should be strict enough to reject random uploads but not depend
 * only on exact OCR keywords. OCR often distorts one or two labels on genuine
 * cards, especially on the photo/hologram-heavy front side.
 */
function evaluateFront(
  recognition:
    LocalOCRRecognition
): DocumentEvidence {
  const text =
    recognition.text;

  const signals =
    matchCount(
      text,
      FRONT_TERMS
    );

  const primarySignals =
    matchCount(
      text,
      FRONT_PRIMARY_TERMS
    );

  const nid =
    hasNIDNumber(
      text
    );

  const date =
    hasDateLikeValue(
      text
    );

  const banglaCharacters =
    countBanglaCharacters(
      text
    );

  let score =
    0;

  score +=
    Math.min(
      signals,
      5
    ) *
    1.5;

  score +=
    Math.min(
      primarySignals,
      3
    ) *
    1.5;

  if (
    nid
  ) {
    score +=
      3.5;
  }

  if (
    date
  ) {
    score +=
      2.5;
  }

  if (
    banglaCharacters >=
    6
  ) {
    score +=
      1;
  }

  if (
    text.length >=
    35
  ) {
    score +=
      0.75;
  }

  if (
    text.length >=
    80
  ) {
    score +=
      0.75;
  }

  if (
    recognition.confidence >=
    45
  ) {
    score +=
      1;
  }

  if (
    recognition.confidence >=
    65
  ) {
    score +=
      1;
  }

  return {
    signals,
    score,
    hasPrimaryIdentityCue:
      primarySignals >
        0 ||
      nid ||
      date,
    hasNIDNumber:
      nid,
    hasDateLikeValue:
      date,
    banglaCharacterCount:
      banglaCharacters,
  };
}

function evaluateBack(
  recognition:
    LocalOCRRecognition
): DocumentEvidence {
  const text =
    recognition.text;

  const signals =
    matchCount(
      text,
      BACK_TERMS
    );

  const banglaCharacters =
    countBanglaCharacters(
      text
    );

  let score =
    signals *
    2;

  if (
    text.length >=
    25
  ) {
    score +=
      0.5;
  }

  if (
    text.length >=
    80
  ) {
    score +=
      0.75;
  }

  if (
    banglaCharacters >=
    8
  ) {
    score +=
      1;
  }

  if (
    recognition.confidence >=
    45
  ) {
    score +=
      0.75;
  }

  if (
    recognition.confidence >=
    70
  ) {
    score +=
      0.75;
  }

  return {
    signals,
    score,
    hasPrimaryIdentityCue:
      signals >
      0,
    hasNIDNumber:
      hasNIDNumber(
        text
      ),
    hasDateLikeValue:
      hasDateLikeValue(
        text
      ),
    banglaCharacterCount:
      banglaCharacters,
  };
}

function tokenKey(
  id:
    string
): string {
  return `ekyc:document-validation:${id}`;
}

export class NIDDocumentValidationService {
  constructor(
    private readonly redis:
      Redis
  ) {}

  async validateAndIssue(
    userId:
      string,
    files:
      NIDPreflightFiles
  ): Promise<{
    validationId:
      string;
    expiresAt:
      string;
    frontSignals:
      number;
    backSignals:
      number;
  }> {
    assertImage(
      files.front,
      "NID front image"
    );

    assertImage(
      files.back,
      "NID back image"
    );

    const [
      frontOCR,
      backOCR,
    ] =
      await Promise.all([
        safeRecognize(
          files.front
        ),
        safeRecognize(
          files.back
        ),
      ]);

    const front =
      evaluateFront(
        frontOCR
      );

    const back =
      evaluateBack(
        backOCR
      );

    if (
      process.env
        .EKYC_OCR_DEBUG ===
      "true"
    ) {
      /*
       * Deliberately avoid logging raw OCR text because it can contain
       * NID number, DOB, name and address.
       */
      console.info(
        "NID preflight OCR signals",
        {
          frontTextLength:
            frontOCR.text
              .length,

          backTextLength:
            backOCR.text
              .length,

          frontSignals:
            front.signals,

          backSignals:
            back.signals,

          frontConfidence:
            Math.round(
              frontOCR.confidence *
                100
            ) /
            100,

          backConfidence:
            Math.round(
              backOCR.confidence *
                100
            ) /
            100,

          frontStrategy:
            frontOCR.strategy ??
            "unknown",

          backStrategy:
            backOCR.strategy ??
            "unknown",

          frontAttempts:
            frontOCR.attempts ??
            1,

          backAttempts:
            backOCR.attempts ??
            1,

          frontScore:
            Math.round(
              front.score *
                100
            ) /
            100,

          backScore:
            Math.round(
              back.score *
                100
            ) /
            100,

          frontHasNIDNumber:
            front.hasNIDNumber,

          frontHasDate:
            front.hasDateLikeValue,
        }
      );
    }

    /*
     * Front acceptance:
     * - enough readable content
     * - at least one real identity cue (NID/DOB/NID label)
     * - weighted evidence threshold
     *
     * This avoids the old brittle "frontSignals >= 3" requirement while
     * still refusing a random image that merely contains a few words.
     */
    const frontAccepted =
      frontOCR.text.length >=
        24 &&
      front.hasPrimaryIdentityCue &&
      front.score >=
        4.5;

    /*
     * Back is usually text-heavy, so require either a known back-side term
     * or enough weighted evidence. This remains stricter than accepting
     * arbitrary long text.
     */
    const backAccepted =
      backOCR.text.length >=
        10 &&
      back.signals >=
        1 &&
      back.score >=
        2.5;

    if (
      !frontAccepted ||
      !backAccepted
    ) {
      throw new NIDDocumentValidationError(
        "The uploaded files do not appear to be the front and back of a Bangladesh NID.",
        "DOCUMENT_NOT_RECOGNIZED"
      );
    }

    const validationId =
      randomUUID();

    const record:
      StoredDocumentValidation =
      {
        userId,

        frontHash:
          hash(
            files.front
              .buffer
          ),

        backHash:
          hash(
            files.back
              .buffer
          ),

        validatedAt:
          new Date()
            .toISOString(),
      };

    await this.redis.set(
      tokenKey(
        validationId
      ),
      JSON.stringify(
        record
      ),
      "EX",
      TOKEN_TTL_SECONDS
    );

    return {
      validationId,

      expiresAt:
        new Date(
          Date.now() +
            TOKEN_TTL_SECONDS *
              1000
        ).toISOString(),

      frontSignals:
        front.signals,

      backSignals:
        back.signals,
    };
  }

  private parseValidationRecord(
    raw: string
  ): StoredDocumentValidation {
    try {
      const parsed =
        JSON.parse(
          raw
        ) as Partial<StoredDocumentValidation>;

      if (
        typeof parsed.userId !==
          "string" ||
        typeof parsed.frontHash !==
          "string" ||
        typeof parsed.backHash !==
          "string" ||
        typeof parsed.validatedAt !==
          "string"
      ) {
        throw new Error(
          "Invalid validation record."
        );
      }

      return {
        userId:
          parsed.userId,
        frontHash:
          parsed.frontHash,
        backHash:
          parsed.backHash,
        validatedAt:
          parsed.validatedAt,
      };
    } catch {
      throw new NIDDocumentValidationError(
        "Document validation expired. Validate the NID images again.",
        "DOCUMENT_VALIDATION_EXPIRED"
      );
    }
  }

  private assertRecordMatches(
    record:
      StoredDocumentValidation,
    userId:
      string,
    files:
      NIDPreflightFiles
  ): void {
    if (
      record.userId !==
        userId ||
      record.frontHash !==
        hash(
          files.front
            .buffer
        ) ||
      record.backHash !==
        hash(
          files.back
            .buffer
        )
    ) {
      throw new NIDDocumentValidationError(
        "The submitted NID images differ from the validated images.",
        "DOCUMENT_VALIDATION_MISMATCH"
      );
    }
  }

  /**
   * Verify the preflight token without deleting it.
   *
   * Final e-KYC submission performs several later operations
   * (biometric/liveness/media/orchestration). A destructive GETDEL here would
   * make a retry impossible whenever one of those later operations failed.
   */
  async assertValid(
    validationId:
      string,
    userId:
      string,
    files:
      NIDPreflightFiles
  ): Promise<void> {
    if (
      !/^[0-9a-f-]{36}$/i.test(
        validationId
      )
    ) {
      throw new NIDDocumentValidationError(
        "Validate the NID images before submitting.",
        "DOCUMENT_VALIDATION_REQUIRED"
      );
    }

    const raw =
      await this.redis.get(
        tokenKey(
          validationId
        )
      );

    if (
      !raw
    ) {
      throw new NIDDocumentValidationError(
        "Document validation expired. Validate the NID images again.",
        "DOCUMENT_VALIDATION_EXPIRED"
      );
    }

    const record =
      this.parseValidationRecord(
        raw
      );

    this.assertRecordMatches(
      record,
      userId,
      files
    );
  }

  /**
   * Atomic one-time consume for callers that explicitly need destructive
   * consumption. It verifies ownership and image hashes after GETDEL.
   */
  async consume(
    validationId:
      string,
    userId:
      string,
    files:
      NIDPreflightFiles
  ): Promise<void> {
    if (
      !/^[0-9a-f-]{36}$/i.test(
        validationId
      )
    ) {
      throw new NIDDocumentValidationError(
        "Validate the NID images before submitting.",
        "DOCUMENT_VALIDATION_REQUIRED"
      );
    }

    const raw =
      await this.redis.getdel(
        tokenKey(
          validationId
        )
      );

    if (
      !raw
    ) {
      throw new NIDDocumentValidationError(
        "Document validation expired. Validate the NID images again.",
        "DOCUMENT_VALIDATION_EXPIRED"
      );
    }

    const record =
      this.parseValidationRecord(
        raw
      );

    this.assertRecordMatches(
      record,
      userId,
      files
    );
  }

  /**
   * Remove a token after a successful submission.
   *
   * This intentionally does not throw when the key has already expired:
   * the same request already passed assertValid() before orchestration.
   */
  async invalidate(
    validationId:
      string
  ): Promise<void> {
    if (
      !/^[0-9a-f-]{36}$/i.test(
        validationId
      )
    ) {
      return;
    }

    await this.redis.del(
      tokenKey(
        validationId
      )
    );
  }

}