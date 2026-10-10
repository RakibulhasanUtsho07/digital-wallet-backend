export type SmsProviderFailureReason =
  | "configuration"
  | "invalid_phone"
  | "rate_limited"
  | "insufficient_balance"
  | "rejected"
  | "unavailable";

export class SmsProviderError extends Error {
  constructor(
    message: string,
    readonly reason: SmsProviderFailureReason,
    readonly providerCode: string,
    readonly statusCode = 503
  ) {
    super(message);

    this.name =
      "SmsProviderError";

    Object.setPrototypeOf(
      this,
      new.target.prototype
    );
  }
}

export interface SendSmsInput {
  to: string;
  message: string;
}

export interface SendSmsResult {
  provider: string;
  requestId?: string;
}

export interface SmsProvider {
  readonly name: string;

  send(
    input: SendSmsInput
  ): Promise<SendSmsResult>;
}

let cachedProvider:
  | SmsProvider
  | undefined;

export async function getSmsProvider(): Promise<SmsProvider> {
  if (
    cachedProvider
  ) {
    return cachedProvider;
  }

  const provider =
    (
      process.env
        .SMS_PROVIDER ??
      "zendsms"
    )
      .trim()
      .toLowerCase();

  switch (
    provider
  ) {
    case "zendsms":
    case "zend-sms":
    case "zend_sms": {
      const {
        ZendSmsProvider,
      } =
        await import(
          "./ZendSmsProvider.js"
        );

      cachedProvider =
        new ZendSmsProvider();

      return cachedProvider;
    }

    // Keep the old provider available if you ever switch back.
    case "smsbd":
    case "sms.bd":
    case "alpha":
    case "alpha-sms": {
      const {
        SmsBdProvider,
      } =
        await import(
          "./SmsBdProvider.js"
        );

      cachedProvider =
        new SmsBdProvider();

      return cachedProvider;
    }

    default:
      throw new SmsProviderError(
        `Unsupported SMS provider: ${provider}`,
        "configuration",
        "SMS_PROVIDER_UNSUPPORTED",
        500
      );
  }
}
