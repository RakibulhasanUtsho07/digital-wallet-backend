import {
  SmsProviderError,
  type SendSmsInput,
  type SendSmsResult,
  type SmsProvider,
} from "./SmsProvider.js";

type SmsBdResponse = {
  error?: number | string;
  msg?: string;

  data?: {
    request_id?:
      | number
      | string;
  };
};

const DEFAULT_API_URL =
  "https://api.sms.net.bd/sendsms";

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

function requestTimeoutMs(): number {
  const raw =
    Number(
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

function toProviderPhone(
  phone: string
): string {
  const normalized =
    phone
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      )
      .replace(
        /^\+/,
        ""
      );

  if (
    !/^8801[3-9]\d{8}$/.test(
      normalized
    )
  ) {
    throw new SmsProviderError(
      "The Bangladesh mobile number is invalid.",
      "invalid_phone",
      "SMSBD_PHONE_INVALID",
      400
    );
  }

  return normalized;
}

function mapProviderFailure(
  code: number
) {
  if (code === 417) {
    return {
      reason:
        "insufficient_balance" as const,
      message:
        "SMS provider balance is insufficient.",
    };
  }

  if (code === 416) {
    return {
      reason:
        "invalid_phone" as const,
      message:
        "The SMS provider rejected the phone number.",
    };
  }

  if (
    code === 410 ||
    code === 411
  ) {
    return {
      reason:
        "configuration" as const,
      message:
        "The SMS provider account is unavailable.",
    };
  }

  if (code === 420) {
    return {
      reason:
        "rejected" as const,
      message:
        "The SMS provider rejected the message content.",
    };
  }

  if (
    code === 400 ||
    code === 403 ||
    code === 405 ||
    code === 413 ||
    code === 414 ||
    code === 415
  ) {
    return {
      reason:
        "rejected" as const,
      message:
        "The SMS provider rejected the request.",
    };
  }

  return {
    reason:
      "unavailable" as const,
    message:
      "The SMS provider could not accept the request.",
  };
}

export class SmsBdProvider implements SmsProvider {
  readonly name =
    "smsbd";

  private readonly apiUrl:
    string;

  private readonly apiKey:
    string;

  private readonly senderId?:
    string;

  constructor() {
    this.apiUrl =
      process.env
        .SMS_API_URL
        ?.trim() ||
      DEFAULT_API_URL;

    this.apiKey =
      requiredEnv(
        "SMS_API_KEY"
      );

    this.senderId =
      process.env
        .SMS_SENDER_ID
        ?.trim() ||
      undefined;
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

    try {
      const payload: Record<
        string,
        string
      > = {
        api_key:
          this.apiKey,

        msg:
          input.message,

        to:
          toProviderPhone(
            input.to
          ),
      };

      if (
        this.senderId
      ) {
        payload.sender_id =
          this.senderId;
      }

      const response =
        await fetch(
          this.apiUrl,
          {
            method: "POST",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                payload
              ),

            signal:
              controller.signal,
          }
        );

      let body:
        | SmsBdResponse
        | undefined;

      try {
        body =
          (await response.json()) as SmsBdResponse;
      } catch {
        body =
          undefined;
      }

      if (!response.ok) {
        throw new SmsProviderError(
          "The SMS provider returned an HTTP error.",
          "unavailable",
          `SMSBD_HTTP_${response.status}`,
          503
        );
      }

      const providerError =
        Number(
          body?.error ??
            -1
        );

      if (
        providerError !==
        0
      ) {
        const mapped =
          mapProviderFailure(
            providerError
          );

        throw new SmsProviderError(
          mapped.message,
          mapped.reason,
          `SMSBD_${providerError}`,
          mapped.reason ===
            "invalid_phone"
            ? 400
            : 503
        );
      }

      return {
        provider:
          this.name,

        requestId:
          body?.data
            ?.request_id ===
          undefined
            ? undefined
            : String(
                body.data
                  .request_id
              ),
      };
    } catch (
      error: unknown
    ) {
      if (
        error instanceof
        SmsProviderError
      ) {
        throw error;
      }

      if (
        error instanceof
          Error &&
        error.name ===
          "AbortError"
      ) {
        throw new SmsProviderError(
          "The SMS provider timed out.",
          "unavailable",
          "SMSBD_TIMEOUT",
          503
        );
      }

      throw new SmsProviderError(
        "Unable to contact the SMS provider.",
        "unavailable",
        "SMSBD_REQUEST_FAILED",
        503
      );
    } finally {
      clearTimeout(
        timeout
      );
    }
  }
}

export default SmsBdProvider;
