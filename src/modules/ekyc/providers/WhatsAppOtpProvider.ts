export type WhatsAppOtpProviderFailureReason =
  | "configuration"
  | "invalid_phone"
  | "rate_limited"
  | "rejected"
  | "unavailable";

export class WhatsAppOtpProviderError extends Error {
  constructor(
    message: string,
    readonly reason: WhatsAppOtpProviderFailureReason,
    readonly providerCode: string,
    readonly statusCode = 503
  ) {
    super(message);

    this.name = "WhatsAppOtpProviderError";

    Object.setPrototypeOf(
      this,
      new.target.prototype
    );
  }
}

export interface SendWhatsAppOtpInput {
  to: string;
  otp: string;
}

export interface SendWhatsAppOtpResult {
  provider: "whatsapp_cloud";
  requestId?: string;
}

type MetaCloudErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type MetaCloudSuccessBody = {
  messaging_product?: string;
  contacts?: Array<{
    input?: string;
    wa_id?: string;
  }>;
  messages?: Array<{
    id?: string;
  }>;
};

function requiredEnv(
  name: string
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new WhatsAppOtpProviderError(
      `${name} is not configured.`,
      "configuration",
      `${name}_MISSING`,
      500
    );
  }

  return value;
}

function graphApiVersion(): string {
  const value =
    process.env
      .WHATSAPP_GRAPH_API_VERSION
      ?.trim() ||
    "v25.0";

  if (!/^v\d+\.\d+$/.test(value)) {
    throw new WhatsAppOtpProviderError(
      "WHATSAPP_GRAPH_API_VERSION is invalid.",
      "configuration",
      "WHATSAPP_GRAPH_API_VERSION_INVALID",
      500
    );
  }

  return value;
}

function requestTimeoutMs(): number {
  const raw =
    Number(
      process.env
        .WHATSAPP_REQUEST_TIMEOUT_MS ??
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

function toMetaPhone(
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
    throw new WhatsAppOtpProviderError(
      "The Bangladesh mobile number is invalid.",
      "invalid_phone",
      "WHATSAPP_PHONE_INVALID",
      400
    );
  }

  return normalized;
}

function mapMetaError(
  status: number,
  body:
    | MetaCloudErrorBody
    | undefined
): WhatsAppOtpProviderError {
  const code =
    body?.error?.code;

  const subcode =
    body?.error
      ?.error_subcode;

  const providerCode = [
    "META",
    code ?? status,
    subcode,
  ]
    .filter(
      (value) =>
        value !== undefined
    )
    .join("_");

  if (
    status === 429 ||
    code === 4 ||
    code === 80007
  ) {
    return new WhatsAppOtpProviderError(
      "WhatsApp temporarily rate-limited the request.",
      "rate_limited",
      providerCode,
      429
    );
  }

  if (
    status === 400
  ) {
    return new WhatsAppOtpProviderError(
      "WhatsApp rejected the OTP request. Check the test recipient and authentication template configuration.",
      "rejected",
      providerCode,
      400
    );
  }

  if (
    status === 401 ||
    status === 403
  ) {
    return new WhatsAppOtpProviderError(
      "WhatsApp Cloud API credentials are invalid or unavailable.",
      "configuration",
      providerCode,
      500
    );
  }

  return new WhatsAppOtpProviderError(
    "WhatsApp Cloud API is temporarily unavailable.",
    "unavailable",
    providerCode,
    503
  );
}

export class WhatsAppOtpProvider {
  readonly name =
    "whatsapp_cloud" as const;

  private readonly phoneNumberId:
    string;

  private readonly accessToken:
    string;

  private readonly templateName:
    string;

  private readonly templateLanguage:
    string;

  private readonly apiVersion:
    string;

  constructor() {
    this.phoneNumberId =
      requiredEnv(
        "WHATSAPP_PHONE_NUMBER_ID"
      );

    this.accessToken =
      requiredEnv(
        "WHATSAPP_ACCESS_TOKEN"
      );

    this.templateName =
      (
        process.env
          .WHATSAPP_AUTH_TEMPLATE_NAME ??
        "authentication_code_copy_code_button"
      )
        .trim();

    this.templateLanguage =
      (
        process.env
          .WHATSAPP_AUTH_TEMPLATE_LANGUAGE ??
        "en_US"
      )
        .trim();

    this.apiVersion =
      graphApiVersion();
  }

  async send(
    input: SendWhatsAppOtpInput
  ): Promise<SendWhatsAppOtpResult> {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        requestTimeoutMs()
      );

    const endpoint =
      `https://graph.facebook.com/${this.apiVersion}/${encodeURIComponent(
        this.phoneNumberId
      )}/messages`;

    try {
      const response =
        await fetch(
          endpoint,
          {
            method: "POST",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${this.accessToken}`,
            },

            body:
              JSON.stringify(
                {
                  messaging_product:
                    "whatsapp",

                  recipient_type:
                    "individual",

                  to:
                    toMetaPhone(
                      input.to
                    ),

                  type:
                    "template",

                  template: {
                    name:
                      this.templateName,

                    language: {
                      code:
                        this.templateLanguage,
                    },

                    components: [
                      {
                        type:
                          "body",

                        parameters: [
                          {
                            type:
                              "text",

                            text:
                              input.otp,
                          },
                        ],
                      },

                      {
                        type:
                          "button",

                        sub_type:
                          "url",

                        index:
                          "0",

                        parameters: [
                          {
                            type:
                              "text",

                            text:
                              input.otp,
                          },
                        ],
                      },
                    ],
                  },
                }
              ),

            signal:
              controller.signal,
          }
        );

      let body:
        | MetaCloudSuccessBody
        | MetaCloudErrorBody
        | undefined;

      try {
        body =
          (await response.json()) as
            | MetaCloudSuccessBody
            | MetaCloudErrorBody;
      } catch {
        body =
          undefined;
      }

      if (
        !response.ok
      ) {
        throw mapMetaError(
          response.status,
          body as
            | MetaCloudErrorBody
            | undefined
        );
      }

      const success =
        body as
          | MetaCloudSuccessBody
          | undefined;

      const requestId =
        success?.messages?.[0]
          ?.id;

      if (!requestId) {
        throw new WhatsAppOtpProviderError(
          "WhatsApp accepted the request without returning a message ID.",
          "unavailable",
          "WHATSAPP_MESSAGE_ID_MISSING",
          503
        );
      }

      return {
        provider:
          this.name,

        requestId,
      };
    } catch (
      error: unknown
    ) {
      if (
        error instanceof
        WhatsAppOtpProviderError
      ) {
        throw error;
      }

      if (
        error instanceof
          Error &&
        error.name ===
          "AbortError"
      ) {
        throw new WhatsAppOtpProviderError(
          "WhatsApp Cloud API timed out.",
          "unavailable",
          "WHATSAPP_TIMEOUT",
          503
        );
      }

      throw new WhatsAppOtpProviderError(
        "Unable to contact WhatsApp Cloud API.",
        "unavailable",
        "WHATSAPP_REQUEST_FAILED",
        503
      );
    } finally {
      clearTimeout(
        timeout
      );
    }
  }
}

let cachedProvider:
  | WhatsAppOtpProvider
  | undefined;

export function getWhatsAppOtpProvider(): WhatsAppOtpProvider {
  if (!cachedProvider) {
    cachedProvider =
      new WhatsAppOtpProvider();
  }

  return cachedProvider;
}

export default WhatsAppOtpProvider;
