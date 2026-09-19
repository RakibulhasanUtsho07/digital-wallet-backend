import sharp from "sharp";
import {
  createScheduler,
  createWorker,
  type RecognizeResult,
} from "tesseract.js";
import type { OCRResult } from "../types.js";

const OCR_WORKER_COUNT = positiveIntegerEnv(
  "EKYC_LOCAL_OCR_WORKERS",
  2
);

const OCR_TIMEOUT_MS = positiveIntegerEnv(
  "EKYC_LOCAL_OCR_TIMEOUT_MS",
  60_000
);

const FETCH_TIMEOUT_MS = positiveIntegerEnv(
  "EKYC_LOCAL_OCR_FETCH_TIMEOUT_MS",
  15_000
);

const MAX_REMOTE_IMAGE_BYTES = positiveIntegerEnv(
  "EKYC_LOCAL_OCR_MAX_IMAGE_BYTES",
  5 * 1024 * 1024
);

const OCR_TARGET_WIDTH = positiveIntegerEnv(
  "EKYC_LOCAL_OCR_TARGET_WIDTH",
  2200
);

const OCR_TARGET_HEIGHT = positiveIntegerEnv(
  "EKYC_LOCAL_OCR_TARGET_HEIGHT",
  1500
);

type OCRScheduler = ReturnType<typeof createScheduler>;

type OCRStrategy =
  | "color"
  | "normalized"
  | "threshold";

export interface LocalOCRRecognition {
  text: string;
  confidence: number;

  /**
   * Optional debugging metadata. Existing callers that only use
   * text/confidence remain fully compatible.
   */
  strategy?: OCRStrategy;
  attempts?: number;
}

interface OCRAttempt extends LocalOCRRecognition {
  strategy: OCRStrategy;
  score: number;
}

let schedulerPromise: Promise<OCRScheduler> | null = null;

function positiveIntegerEnv(
  key: string,
  fallback: number
): number {
  const value = Number(
    process.env[key]
  );

  return Number.isInteger(
    value
  ) &&
    value > 0
    ? value
    : fallback;
}

function normalizeBanglaDigits(
  value: string
): string {
  const digits =
    "০১২৩৪৫৬৭৮৯";

  return value.replace(
    /[০-৯]/g,
    (
      digit
    ) =>
      String(
        digits.indexOf(
          digit
        )
      )
  );
}

export function normalizeOCRText(
  value: string
): string {
  return normalizeBanglaDigits(
    value.normalize(
      "NFKC"
    )
  )
    .replace(
      /\r/g,
      "\n"
    )
    .replace(
      /[ \t]+/g,
      " "
    )
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

/* =========================================================
   IMAGE PREPROCESSING
========================================================= */

function baseSharp(
  buffer: Buffer
) {
  return sharp(
    buffer,
    {
      failOn: "error",
    }
  )
    .rotate()
    .flatten({
      background:
        "#ffffff",
    })
    .resize({
      width:
        OCR_TARGET_WIDTH,
      height:
        OCR_TARGET_HEIGHT,
      fit:
        "inside",
      withoutEnlargement:
        false,
      kernel:
        sharp.kernel.lanczos3,
    });
}

/**
 * Bangladesh NID fronts can contain a portrait, hologram, colored background,
 * small English/Bangla text and uneven lighting. A single grayscale pipeline
 * can destroy useful contrast, so OCR is tried with multiple preparations.
 */
async function preprocessImage(
  buffer: Buffer,
  strategy: OCRStrategy
): Promise<Buffer> {
  if (
    strategy ===
    "color"
  ) {
    return baseSharp(
      buffer
    )
      .sharpen({
        sigma: 0.8,
      })
      .png({
        compressionLevel:
          6,
      })
      .toBuffer();
  }

  if (
    strategy ===
    "normalized"
  ) {
    return baseSharp(
      buffer
    )
      .grayscale()
      .normalize()
      .sharpen({
        sigma: 1.1,
      })
      .png({
        compressionLevel:
          6,
      })
      .toBuffer();
  }

  return baseSharp(
    buffer
  )
    .grayscale()
    .normalize()
    .threshold(
      168,
      {
        grayscale:
          true,
      }
    )
    .sharpen({
      sigma: 0.7,
    })
    .png({
      compressionLevel:
        6,
    })
    .toBuffer();
}

/* =========================================================
   TESSERACT WORKERS
========================================================= */

async function createLocalScheduler(): Promise<OCRScheduler> {
  const scheduler =
    createScheduler();

  const debug =
    process.env
      .EKYC_OCR_DEBUG ===
    "true";

  const langPath =
    process.env
      .EKYC_TESSERACT_LANG_PATH
      ?.trim();

  for (
    let index = 0;
    index <
    OCR_WORKER_COUNT;
    index += 1
  ) {
    const worker =
      await createWorker(
        [
          "eng",
          "ben",
        ],
        undefined,
        {
          ...(langPath
            ? {
                langPath,
              }
            : {}),

          /*
           * IMPORTANT:
           * Do not pass logger: undefined.
           * Tesseract.js may call the property directly.
           */
          ...(debug
            ? {
                logger:
                  (
                    message
                  ) => {
                    if (
                      message.status ===
                      "recognizing text"
                    ) {
                      console.info(
                        "NID OCR progress",
                        {
                          worker:
                            index +
                            1,
                          progress:
                            Math.round(
                              message.progress *
                                100
                            ),
                        }
                      );
                    }
                  },
              }
            : {}),

          errorHandler:
            (
              error
            ) => {
              console.error(
                "NID OCR worker error:",
                {
                  worker:
                    index +
                    1,
                  message:
                    error instanceof
                    Error
                      ? error.message
                      : String(
                          error
                        ),
                }
              );
            },
        }
      );

    scheduler.addWorker(
      worker
    );
  }

  return scheduler;
}

async function getScheduler(): Promise<OCRScheduler> {
  if (
    !schedulerPromise
  ) {
    schedulerPromise =
      createLocalScheduler().catch(
        (
          error:
            unknown
        ) => {
          schedulerPromise =
            null;

          throw error;
        }
      );
  }

  return schedulerPromise;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>(
    (
      resolve,
      reject
    ) => {
      const timer =
        setTimeout(
          () =>
            reject(
              new Error(
                `Local OCR timed out after ${timeoutMs}ms.`
              )
            ),
          timeoutMs
        );

      promise.then(
        (
          value
        ) => {
          clearTimeout(
            timer
          );

          resolve(
            value
          );
        },
        (
          error
        ) => {
          clearTimeout(
            timer
          );

          reject(
            error
          );
        }
      );
    }
  );
}

/* =========================================================
   OCR QUALITY / SELECTION
========================================================= */

function containsNIDNumber(
  text: string
): boolean {
  const normalized =
    normalizeBanglaDigits(
      text
    );

  return (
    /\b\d{10}\b/.test(
      normalized
    ) ||
    /\b\d{13}\b/.test(
      normalized
    ) ||
    /\b\d{17}\b/.test(
      normalized
    ) ||
    /(?:\d[\s-]*){10,17}/.test(
      normalized
    )
  );
}

function identityCueCount(
  text: string
): number {
  const patterns =
    [
      /national\s+id/i,
      /identity\s+card/i,
      /\bnid\b/i,
      /\bname\b/i,
      /নাম/u,
      /date\s+of\s+birth/i,
      /\bdob\b/i,
      /জন্ম\s*তারিখ/u,
      /জাতীয়\s*পরিচয়পত্র/u,
      /জাতীয়\s*পরিচয়পত্র/u,
      /গণপ্রজাতন্ত্রী\s*বাংলাদেশ/u,
      /government\s+of\s+(?:the\s+)?people'?s\s+republic\s+of\s+bangladesh/i,
    ];

  return patterns.reduce(
    (
      total,
      pattern
    ) =>
      total +
      (pattern.test(
        text
      )
        ? 1
        : 0),
    0
  );
}

function recognitionScore(
  recognition: Pick<
    LocalOCRRecognition,
    | "text"
    | "confidence"
  >
): number {
  const textLength =
    recognition.text.length;

  const cues =
    identityCueCount(
      recognition.text
    );

  const hasNID =
    containsNIDNumber(
      recognition.text
    );

  const banglaCharacters =
    (
      recognition.text.match(
        /[\u0980-\u09FF]/gu
      ) ?? []
    ).length;

  return (
    recognition.confidence *
      1.7 +
    Math.min(
      textLength,
      320
    ) *
      0.08 +
    cues * 8 +
    (hasNID
      ? 18
      : 0) +
    Math.min(
      banglaCharacters,
      40
    ) *
      0.2
  );
}

function isStrongRecognition(
  recognition: LocalOCRRecognition
): boolean {
  const cues =
    identityCueCount(
      recognition.text
    );

  const hasNID =
    containsNIDNumber(
      recognition.text
    );

  return (
    (
      recognition.confidence >=
        72 &&
      recognition.text.length >=
        45
    ) ||
    (
      recognition.confidence >=
        58 &&
      hasNID &&
      recognition.text.length >=
        25
    ) ||
    (
      recognition.confidence >=
        52 &&
      cues >= 2 &&
      recognition.text.length >=
        30
    )
  );
}

async function recognizePrepared(
  prepared: Buffer,
  strategy: OCRStrategy
): Promise<OCRAttempt> {
  const scheduler =
    await getScheduler();

  const result =
    (await withTimeout(
      scheduler.addJob(
        "recognize",
        prepared
      ),
      OCR_TIMEOUT_MS
    )) as RecognizeResult;

  const text =
    normalizeOCRText(
      result.data
        .text ||
        ""
    );

  const confidence =
    Number.isFinite(
      result.data
        .confidence
    )
      ? Math.max(
          0,
          Math.min(
            100,
            result.data
              .confidence
          )
        )
      : 0;

  return {
    text,
    confidence,
    strategy,
    score:
      recognitionScore({
        text,
        confidence,
      }),
  };
}

async function runOCRStrategy(
  buffer: Buffer,
  strategy: OCRStrategy
): Promise<OCRAttempt> {
  const prepared =
    await preprocessImage(
      buffer,
      strategy
    );

  return recognizePrepared(
    prepared,
    strategy
  );
}

/**
 * Smart progressive OCR:
 *
 * 1. Try color-preserving preparation first.
 * 2. If already strong, stop immediately.
 * 3. Otherwise run normalized grayscale + high-contrast threshold fallbacks.
 * 4. Choose the best result by confidence, text coverage and identity cues.
 *
 * This keeps good back-side OCR fast while giving difficult NID fronts
 * multiple chances to become readable.
 */
export async function recognizeNIDBuffer(
  buffer: Buffer
): Promise<LocalOCRRecognition> {
  const debug =
    process.env
      .EKYC_OCR_DEBUG ===
    "true";

  const first =
    await runOCRStrategy(
      buffer,
      "color"
    );

  if (
    debug
  ) {
    console.info(
      "NID OCR attempt",
      {
        strategy:
          first.strategy,
        confidence:
          Math.round(
            first.confidence *
              100
          ) /
          100,
        textLength:
          first.text.length,
        score:
          Math.round(
            first.score *
              100
          ) /
          100,
      }
    );
  }

  if (
    isStrongRecognition(
      first
    )
  ) {
    return {
      text:
        first.text,
      confidence:
        first.confidence,
      strategy:
        first.strategy,
      attempts:
        1,
    };
  }

  const [
    normalized,
    threshold,
  ] =
    await Promise.all([
      runOCRStrategy(
        buffer,
        "normalized"
      ),
      runOCRStrategy(
        buffer,
        "threshold"
      ),
    ]);

  const attempts =
    [
      first,
      normalized,
      threshold,
    ];

  if (
    debug
  ) {
    for (
      const attempt
      of attempts.slice(
        1
      )
    ) {
      console.info(
        "NID OCR attempt",
        {
          strategy:
            attempt.strategy,
          confidence:
            Math.round(
              attempt.confidence *
                100
            ) /
            100,
          textLength:
            attempt.text.length,
          score:
            Math.round(
              attempt.score *
                100
            ) /
            100,
        }
      );
    }
  }

  const best =
    [...attempts].sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
    )[0]!;

  if (
    debug
  ) {
    console.info(
      "NID OCR selected",
      {
        strategy:
          best.strategy,
        confidence:
          Math.round(
            best.confidence *
              100
          ) /
          100,
        textLength:
          best.text.length,
        attempts:
          attempts.length,
      }
    );
  }

  return {
    text:
      best.text,
    confidence:
      best.confidence,
    strategy:
      best.strategy,
    attempts:
      attempts.length,
  };
}

/* =========================================================
   REMOTE IMAGE FETCH
========================================================= */

async function fetchImageBuffer(
  url: string
): Promise<Buffer> {
  const parsed =
    new URL(
      url
    );

  if (
    parsed.protocol !==
      "https:" &&
    parsed.protocol !==
      "http:"
  ) {
    throw new Error(
      "OCR media URL must use HTTP or HTTPS."
    );
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      FETCH_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        parsed,
        {
          method:
            "GET",
          redirect:
            "error",
          signal:
            controller.signal,
          headers: {
            accept:
              "image/jpeg,image/png,image/webp,image/*;q=0.8",
          },
        }
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `Unable to fetch OCR image (${response.status}).`
      );
    }

    const contentType =
      response.headers
        .get(
          "content-type"
        )
        ?.toLowerCase() ||
      "";

    if (
      !contentType.startsWith(
        "image/"
      )
    ) {
      throw new Error(
        "OCR media URL did not return an image."
      );
    }

    const declaredLength =
      Number(
        response.headers.get(
          "content-length"
        ) ||
          0
      );

    if (
      declaredLength >
      MAX_REMOTE_IMAGE_BYTES
    ) {
      throw new Error(
        "OCR image exceeds the configured size limit."
      );
    }

    const bytes =
      Buffer.from(
        await response.arrayBuffer()
      );

    if (
      bytes.length ===
        0 ||
      bytes.length >
        MAX_REMOTE_IMAGE_BYTES
    ) {
      throw new Error(
        "OCR image is empty or exceeds the configured size limit."
      );
    }

    return bytes;
  } finally {
    clearTimeout(
      timer
    );
  }
}

export async function recognizeNIDUrl(
  url: string
): Promise<LocalOCRRecognition> {
  return recognizeNIDBuffer(
    await fetchImageBuffer(
      url
    )
  );
}

/* =========================================================
   STRUCTURED NID PARSING
========================================================= */

function cleanCandidate(
  value:
    string |
    undefined
): string | undefined {
  const result =
    value
      ?.replace(
        /[|]/g,
        "I"
      )
      .replace(
        /\s{2,}/g,
        " "
      )
      .replace(
        /^[\s:：\-–—]+|[\s:：\-–—]+$/g,
        ""
      )
      .trim();

  return (
    result ||
    undefined
  );
}

function extractNID(
  text: string
): string | undefined {
  const normalized =
    normalizeBanglaDigits(
      text
    );

  const labelled =
    normalized.match(
      /(?:nid|national\s+id|id\s*no(?:\.|number)?|identity\s*(?:no|number))\s*[:#\-]?\s*([0-9][0-9\s-]{8,20}[0-9])/i
    )?.[1] ||
    "";

  const labelledDigits =
    labelled.replace(
      /\D/g,
      ""
    );

  if (
    [
      10,
      13,
      17,
    ].includes(
      labelledDigits.length
    )
  ) {
    return labelledDigits;
  }

  const candidates =
    normalized.match(
      /\b(?:\d[\s-]*){10,17}\b/g
    ) ||
    [];

  for (
    const candidate
    of candidates
  ) {
    const digits =
      candidate.replace(
        /\D/g,
        ""
      );

    if (
      [
        10,
        13,
        17,
      ].includes(
        digits.length
      )
    ) {
      return digits;
    }
  }

  return undefined;
}

const MONTHS:
  Record<
    string,
    string
  > = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
  };

function validIsoDate(
  year: string,
  month: string,
  day: string
): string | undefined {
  const iso =
    `${year}-${month.padStart(
      2,
      "0"
    )}-${day.padStart(
      2,
      "0"
    )}`;

  const date =
    new Date(
      `${iso}T00:00:00.000Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    ) ||
    date.getUTCFullYear() !==
      Number(
        year
      ) ||
    date.getUTCMonth() +
      1 !==
      Number(
        month
      ) ||
    date.getUTCDate() !==
      Number(
        day
      )
  ) {
    return undefined;
  }

  return iso;
}

function extractDateOfBirth(
  text: string
): string | undefined {
  const normalized =
    normalizeBanglaDigits(
      text
    );

  const ymd =
    normalized.match(
      /(?:date\s+of\s+birth|dob|জন্ম\s*তারিখ)?\s*[:：\-]?\s*((?:19|20)\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/iu
    );

  if (
    ymd
  ) {
    return validIsoDate(
      ymd[1]!,
      ymd[2]!,
      ymd[3]!
    );
  }

  const dmy =
    normalized.match(
      /(?:date\s+of\s+birth|dob|জন্ম\s*তারিখ)?\s*[:：\-]?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-]((?:19|20)\d{2})/iu
    );

  if (
    dmy
  ) {
    return validIsoDate(
      dmy[3]!,
      dmy[2]!,
      dmy[1]!
    );
  }

  const named =
    normalized.match(
      /(?:date\s+of\s+birth|dob)?\s*[:：\-]?\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+((?:19|20)\d{2})/i
    );

  if (
    named
  ) {
    const month =
      MONTHS[
        named[2]!.toLowerCase()
      ];

    if (
      month
    ) {
      return validIsoDate(
        named[3]!,
        month,
        named[1]!
      );
    }
  }

  return undefined;
}

function extractEnglishName(
  text: string
): string | undefined {
  const lines =
    text
      .split(
        /\n+/
      )
      .map(
        (
          line
        ) =>
          line.trim()
      )
      .filter(
        Boolean
      );

  for (
    const line
    of lines
  ) {
    const match =
      line.match(
        /^(?:name|name\s*\(english\))\s*[:：\-]\s*(.+)$/i
      );

    const candidate =
      cleanCandidate(
        match?.[1]
      );

    if (
      candidate &&
      /[A-Za-z]/.test(
        candidate
      ) &&
      !/\b(?:father|mother|husband|wife)\b/i.test(
        candidate
      )
    ) {
      return candidate;
    }
  }

  return undefined;
}

function extractBanglaName(
  text: string
): string | undefined {
  const lines =
    text
      .split(
        /\n+/
      )
      .map(
        (
          line
        ) =>
          line.trim()
      )
      .filter(
        Boolean
      );

  for (
    const line
    of lines
  ) {
    const match =
      line.match(
        /^(?:নাম)\s*[:：\-]\s*(.+)$/u
      );

    const candidate =
      cleanCandidate(
        match?.[1]
      );

    if (
      candidate &&
      /[\u0980-\u09FF]/u.test(
        candidate
      )
    ) {
      return candidate;
    }
  }

  return undefined;
}

export function parseBangladeshNIDText(
  front:
    LocalOCRRecognition,
  back:
    LocalOCRRecognition
): OCRResult {
  const combined =
    `${front.text}\n${back.text}`;

  const nid =
    extractNID(
      front.text
    ) ||
    extractNID(
      combined
    );

  const dateOfBirth =
    extractDateOfBirth(
      front.text
    ) ||
    extractDateOfBirth(
      combined
    );

  const nameEnglish =
    extractEnglishName(
      front.text
    ) ||
    extractEnglishName(
      combined
    );

  const nameBangla =
    extractBanglaName(
      front.text
    ) ||
    extractBanglaName(
      combined
    );

  /*
   * Identity fields are expected primarily from the front side.
   * Keep a conservative combined confidence so a very weak front
   * cannot be completely hidden by an excellent back image.
   */
  const frontWeight =
    0.7;

  const backWeight =
    0.3;

  const confidence =
    front.confidence *
      frontWeight +
    back.confidence *
      backWeight;

  return {
    ...(nid
      ? {
          nid,
        }
      : {}),

    ...(dateOfBirth
      ? {
          dateOfBirth,
        }
      : {}),

    ...(nameEnglish
      ? {
          nameEnglish,
        }
      : {}),

    ...(nameBangla
      ? {
          nameBangla,
        }
      : {}),

    confidence:
      Math.round(
        confidence *
          100
      ) /
      100,
  };
}

export async function parseBangladeshNIDFromUrls(
  frontUrl: string,
  backUrl: string
): Promise<OCRResult> {
  const [
    front,
    back,
  ] =
    await Promise.all([
      recognizeNIDUrl(
        frontUrl
      ),
      recognizeNIDUrl(
        backUrl
      ),
    ]);

  return parseBangladeshNIDText(
    front,
    back
  );
}
