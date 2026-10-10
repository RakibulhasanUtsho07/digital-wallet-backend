import { randomUUID } from "node:crypto";

import {
  SmsProviderError,
  type SendSmsInput,
  type SendSmsResult,
  type SmsProvider,
} from "./SmsProvider.js";

/* =========================================================
   TYPES
========================================================= */

type ZendSmsResponse = {
  success?: boolean;
  message?: string;
  code?: number | string;
  error?: string;

  errors?: Record<
    string,
    string[] | string
  >;

  message_id?: number | string;
  id?: number | string;
  status?: string;
  client_ref?: string;

  data?: {
    message_id?: number | string;
    id?: number | string;
    status?: string;
    client_ref?: string;
    message?: string;
    recipient?: string;
    sms_count?: number;
  };
};

/* =========================================================
   CONFIG
========================================================= */

const DEFAULT_API_BASE_URL =
  "https://api.zendsms.com";

const SEND_SMS_PATH =
  "/api/v1/send-sms";

/* =========================================================
   ENV
========================================================= */

function requiredEnv(
  name: string
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new SmsProviderError(
      `${name} is not configured.`,
      "configuration",
      `${name}_MISSING`,
      500
    );
  }

  return value;
}

/* =========================================================
   TIMEOUT
========================================================= */

function requestTimeoutMs(): number {
  const raw = Number(
    process.env
      .SMS_REQUEST_TIMEOUT_MS ??
      "10000"
  );

  if (
    !Number.isFinite(raw) ||
    raw < 1000
  ) {
    return 10000;
  }

  return Math.min(
    raw,
    30000
  );
}

/* =========================================================
   API URL
========================================================= */

function buildApiUrl(): string {
  const configured =
    (
      process.env.SMS_API_URL ??
      DEFAULT_API_BASE_URL
    )
      .trim()
      .replace(
        /\/+$/,
        ""
      );

  if (
    /\/api\/v1\/send-sms$/i.test(
      configured
    )
  ) {
    return configured;
  }

  return `${configured}${SEND_SMS_PATH}`;
}

/* =========================================================
   BANGLADESH PHONE FORMAT

   Internal app:
   +8801XXXXXXXXX

   ZendSMS:
   01XXXXXXXXX
========================================================= */

function toBangladeshLocalNumber(
  phone: string
): string {
  const compact =
    phone
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );

  // 01XXXXXXXXX
  if (
    /^01[3-9]\d{8}$/.test(
      compact
    )
  ) {
    return compact;
  }

  // 8801XXXXXXXXX
  if (
    /^8801[3-9]\d{8}$/.test(
      compact
    )
  ) {
    return `0${compact.slice(
      3
    )}`;
  }

  // +8801XXXXXXXXX
  if (
    /^\+8801[3-9]\d{8}$/.test(
      compact
    )
  ) {
    return `0${compact.slice(
      4
    )}`;
  }

  throw new SmsProviderError(
    "The Bangladesh mobile number is invalid.",
    "invalid_phone",
    "ZENDSMS_PHONE_INVALID",
    400
  );
}

/* =========================================================
   RESPONSE MESSAGE
========================================================= */

function firstApiMessage(
  body:
    | ZendSmsResponse
    | undefined
): string | undefined {
  const directCandidates = [
    body?.message,
    body?.error,
    body?.data?.message,
  ];

  for (
    const candidate
    of directCandidates
  ) {
    if (
      typeof candidate ===
        "string" &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }

  if (
    body?.errors &&
    typeof body.errors ===
      "object"
  ) {
    for (
      const rawValue
      of Object.values(
        body.errors
      )
    ) {
      if (
        typeof rawValue ===
          "string" &&
        rawValue.trim()
      ) {
        return rawValue.trim();
      }

      if (
        Array.isArray(
          rawValue
        )
      ) {
        const value =
          rawValue.find(
            (item) =>
              typeof item ===
                "string" &&
              item.trim()
          );

        if (value) {
          return value.trim();
        }
      }
    }
  }

  return undefined;
}

/* =========================================================
   PROVIDER CODE
========================================================= */

function providerCodeOf(
  httpStatus: number,
  body:
    | ZendSmsResponse
    | undefined
): string {
  const apiCode =
    body?.code === undefined
      ? ""
      : String(
          body.code
        ).trim();

  return apiCode
    ? `ZENDSMS_${apiCode}`
    : `ZENDSMS_HTTP_${httpStatus}`;
}

/* =========================================================
   SAFE LOG MESSAGE

   Never log:
   - API key
   - full phone
   - OTP
========================================================= */

function safeDiagnosticMessage(
  value:
    | string
    | undefined
): string | null {
  if (!value) {
    return null;
  }

  return value
    .replace(
      /\+?8801[3-9]\d{8}/g,
      "[PHONE_REDACTED]"
    )
    .replace(
      /\b01[3-9]\d{8}\b/g,
      "[PHONE_REDACTED]"
    )
    .replace(
      /\b\d{6}\b/g,
      "[OTP_REDACTED]"
    )
    .slice(
      0,
      300
    );
}

/* =========================================================
   ERROR MAPPING
========================================================= */

function mapProviderError(
  httpStatus: number,
  body:
    | ZendSmsResponse
    | undefined
): SmsProviderError {
  const apiCode =
    body?.code === undefined
      ? ""
      : String(
          body.code
        ).trim();

  const providerCode =
    providerCodeOf(
      httpStatus,
      body
    );

  const apiMessage =
    firstApiMessage(
      body
    );

  const lower =
    (
      apiMessage ??
      ""
    ).toLowerCase();

  /* -----------------------------
     Insufficient balance
  ----------------------------- */

  if (
    apiCode === "2201" ||
    httpStatus === 402 ||
    lower.includes(
      "insufficient balance"
    ) ||
    lower.includes(
      "not enough balance"
    )
  ) {
    return new SmsProviderError(
      apiMessage ||
        "ZendSMS balance is insufficient.",
      "insufficient_balance",
      providerCode,
      503
    );
  }

  /* -----------------------------
     Authentication
  ----------------------------- */

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    lower.includes(
      "api key"
    ) ||
    lower.includes(
      "unauthorized"
    ) ||
    lower.includes(
      "authentication"
    ) ||
    lower.includes(
      "permission"
    ) ||
    lower.includes(
      "scope"
    )
  ) {
    return new SmsProviderError(
      apiMessage ||
        "ZendSMS API authentication or API-key permission is invalid.",
      "configuration",
      providerCode,
      500
    );
  }

  /* -----------------------------
     Sender ID
  ----------------------------- */

  if (
    lower.includes(
      "sender"
    ) &&
    (
      lower.includes(
        "invalid"
      ) ||
      lower.includes(
        "approved"
      ) ||
      lower.includes(
        "active"
      ) ||
      lower.includes(
        "allowed"
      )
    )
  ) {
    return new SmsProviderError(
      apiMessage ||
        "ZendSMS rejected the configured sender ID.",
      "configuration",
      providerCode,
      500
    );
  }

  /* -----------------------------
     Rate limit
  ----------------------------- */

  if (
    httpStatus === 429 ||
    lower.includes(
      "rate limit"
    ) ||
    lower.includes(
      "too many"
    )
  ) {
    return new SmsProviderError(
      apiMessage ||
        "ZendSMS temporarily rate-limited the request.",
      "rate_limited",
      providerCode,
      429
    );
  }

  /* -----------------------------
     Invalid recipient

     ZendSMS code 2101 =
     Invalid recipient
  ----------------------------- */

  if (
    apiCode === "2101" ||
    lower.includes(
      "invalid recipient"
    )
  ) {
    return new SmsProviderError(
      apiMessage ||
        "ZendSMS rejected the recipient.",
      "invalid_phone",
      providerCode,
      400
    );
  }

  /* -----------------------------
     Validation
  ----------------------------- */

  if (
    httpStatus === 422
  ) {
    const looksLikePhoneError =
      lower.includes(
        "phone"
      ) ||
      lower.includes(
        "mobile"
      ) ||
      lower.includes(
        "recipient"
      ) ||
      lower.includes(
        "number"
      );

    return new SmsProviderError(
      apiMessage ||
        "ZendSMS rejected the SMS request.",
      looksLikePhoneError
        ? "invalid_phone"
        : "rejected",
      providerCode,
      looksLikePhoneError
        ? 400
        : 503
    );
  }

  /* -----------------------------
     Other client errors
  ----------------------------- */

  if (
    httpStatus >= 400 &&
    httpStatus < 500
  ) {
    return new SmsProviderError(
      apiMessage ||
        "ZendSMS rejected the SMS request.",
      "rejected",
      providerCode,
      503
    );
  }

  /* -----------------------------
     Provider unavailable
  ----------------------------- */

  return new SmsProviderError(
    apiMessage ||
      "ZendSMS is temporarily unavailable.",
    "unavailable",
    providerCode,
    503
  );
}

/* =========================================================
   PROVIDER STATUS
========================================================= */

function normalizedProviderStatus(
  body:
    | ZendSmsResponse
    | undefined
): string | undefined {
  const status =
    body?.data?.status ??
    body?.status;

  return (
    typeof status ===
      "string" &&
    status.trim()
  )
    ? status
        .trim()
        .toUpperCase()
    : undefined;
}

/* =========================================================
   ACCEPTED STATUSES
========================================================= */

function acceptedStatus(
  status:
    | string
    | undefined
): boolean {
  if (!status) {
    return true;
  }

  return [
    "QUEUED",
    "ACCEPTED",
    "PENDING",
    "SENT",
    "PROCESSING",
    "SUBMITTED",
    "SUCCESS",
  ].includes(
    status
  );
}

/* =========================================================
   REQUEST ID
========================================================= */

function extractRequestId(
  body:
    | ZendSmsResponse
    | undefined,
  fallback: string
): string {
  const value =
    body?.data?.message_id ??
    body?.data?.id ??
    body?.message_id ??
    body?.id ??
    body?.data?.client_ref ??
    body?.client_ref ??
    fallback;

  return String(
    value
  );
}

/* =========================================================
   ZEND SMS PROVIDER
========================================================= */

export class ZendSmsProvider
  implements SmsProvider
{
  readonly name =
    "zendsms";

  private readonly apiUrl:
    string;

  private readonly apiKey:
    string;

  private readonly senderId:
    string;

  constructor() {
    this.apiUrl =
      buildApiUrl();

    this.apiKey =
      requiredEnv(
        "SMS_API_KEY"
      );

    this.senderId =
      requiredEnv(
        "SMS_SENDER_ID"
      );
  }

  async send(
    input: SendSmsInput
  ): Promise<SendSmsResult> {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        requestTimeoutMs()
      );

    const clientRef =
      `ekyc-${randomUUID()}`;

    const recipient =
      toBangladeshLocalNumber(
        input.to
      );

    /*
     * IMPORTANT
     *
     * App internal field:
     *   input.to
     *
     * ZendSMS API field:
     *   recipient
     */

    if (
      process.env
        .NODE_ENV !==
      "production"
    ) {
      console.log(
        "[ZendSMS request]",
        {
          endpoint:
            this.apiUrl,

          payloadField:
            "recipient",

          senderIdConfigured:
            Boolean(
              this.senderId
            ),

          recipientFormat:
            recipient.startsWith(
              "01"
            )
              ? "BD_LOCAL"
              : "UNKNOWN",

          messageTemplate:
            "Your Coffer verification code is [OTP_REDACTED]. This code is valid for 5 minutes. Do not share this code.",

          clientRef,
        }
      );
    }

    try {
      const response =
        await fetch(
          this.apiUrl,
          {
            method:
              "POST",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${this.apiKey}`,
            },

            /*
             * ZendSMS support confirmed:
             *
             * recipient ✅
             * to        ❌
             */
            body:
              JSON.stringify(
                {
                  recipient,

                  sender_id:
                    this.senderId,

                  message:
                    input.message,

                  client_ref:
                    clientRef,
                }
              ),

            signal:
              controller.signal,
          }
        );

      const rawText =
        await response.text();

      let body:
        | ZendSmsResponse
        | undefined;

      if (
        rawText.trim()
      ) {
        try {
          body =
            JSON.parse(
              rawText
            ) as ZendSmsResponse;
        } catch {
          body =
            undefined;
        }
      }

      /* =====================================================
         DEVELOPMENT DIAGNOSTICS
      ===================================================== */

      if (
        process.env
          .NODE_ENV !==
        "production"
      ) {
        console.log(
          "[ZendSMS response]",
          {
            httpStatus:
              response.status,

            httpOk:
              response.ok,

            success:
              body?.success,

            code:
              body?.code ??
              null,

            providerMessage:
              safeDiagnosticMessage(
                firstApiMessage(
                  body
                ) ??
                  (
                    body
                      ? undefined
                      : rawText
                  )
              ),

            providerStatus:
              normalizedProviderStatus(
                body
              ) ??
              null,

            hasMessageId:
              Boolean(
                body?.data
                  ?.message_id ??
                  body?.data?.id ??
                  body?.message_id ??
                  body?.id
              ),
          }
        );
      }

      /* =====================================================
         HTTP ERROR
      ===================================================== */

      if (
        !response.ok
      ) {
        throw mapProviderError(
          response.status,
          body
        );
      }

      /* =====================================================
         API LEVEL ERROR
      ===================================================== */

      if (
        body?.success ===
        false
      ) {
        throw mapProviderError(
          response.status,
          body
        );
      }

      /* =====================================================
         STATUS CHECK
      ===================================================== */

      const providerStatus =
        normalizedProviderStatus(
          body
        );

      if (
        !acceptedStatus(
          providerStatus
        )
      ) {
        throw new SmsProviderError(
          firstApiMessage(
            body
          ) ||
            `ZendSMS returned status ${providerStatus}.`,
          "rejected",
          `ZENDSMS_STATUS_${providerStatus}`,
          503
        );
      }

      /* =====================================================
         SUCCESS
      ===================================================== */

      return {
        provider:
          this.name,

        requestId:
          extractRequestId(
            body,
            clientRef
          ),
      };
    } catch (
      error: unknown
    ) {
      /* =====================================================
         KNOWN SMS ERROR
      ===================================================== */

      if (
        error instanceof
        SmsProviderError
      ) {
        if (
          process.env
            .NODE_ENV !==
          "production"
        ) {
          console.error(
            "[ZendSMS error]",
            {
              reason:
                error.reason,

              providerCode:
                error.providerCode,

              statusCode:
                error.statusCode,

              message:
                safeDiagnosticMessage(
                  error.message
                ),
            }
          );
        }

        throw error;
      }

      /* =====================================================
         TIMEOUT
      ===================================================== */

      if (
        error instanceof
          Error &&
        error.name ===
          "AbortError"
      ) {
        throw new SmsProviderError(
          "ZendSMS request timed out.",
          "unavailable",
          "ZENDSMS_TIMEOUT",
          503
        );
      }

      /* =====================================================
         UNKNOWN ERROR
      ===================================================== */

      if (
        process.env
          .NODE_ENV !==
        "production"
      ) {
        console.error(
          "[ZendSMS] unexpected request failure",
          error instanceof
            Error
            ? {
                name:
                  error.name,

                message:
                  safeDiagnosticMessage(
                    error.message
                  ),
              }
            : {
                name:
                  "UnknownError",
              }
        );
      }

      throw new SmsProviderError(
        "Unable to contact ZendSMS.",
        "unavailable",
        "ZENDSMS_REQUEST_FAILED",
        503
      );
    } finally {
      clearTimeout(
        timeout
      );
    }
  }
}

export default ZendSmsProvider;