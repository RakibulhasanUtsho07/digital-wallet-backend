/* =========================================================
   TYPES
========================================================= */

interface TwilioMessageResponse {
  sid?: string;
  status?: string;
  code?: number | string;
  message?: string;
}

interface SendTwilioKycOtpInput {
  phone: string;
  code: string;
}

export interface TwilioKycOtpResult {
  messageSid: string;
  status: string;
}

/* =========================================================
   ERROR
========================================================= */

export class TwilioSmsError extends Error {
  constructor(
    message: string,
    readonly providerCode: string,
    readonly statusCode = 503,
  ) {
    super(message);
    this.name = "TwilioSmsError";
  }
}

/* =========================================================
   CONFIGURATION
========================================================= */

function getTwilioConfiguration() {
  return {
    accountSid:
      process.env.TWILIO_ACCOUNT_SID?.trim() ||
      "",

    authToken:
      process.env.TWILIO_AUTH_TOKEN?.trim() ||
      "",

    fromNumber:
      process.env.TWILIO_FROM_NUMBER?.trim() ||
      "",

    messagingServiceSid:
      process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() ||
      "",
  };
}

export function isTwilioKycSmsConfigured(): boolean {
  const config =
    getTwilioConfiguration();

  return Boolean(
    config.accountSid &&
      config.authToken &&
      (config.messagingServiceSid ||
        config.fromNumber),
  );
}

/* =========================================================
   RESPONSE PARSER
========================================================= */

async function readTwilioResponse(
  response: Response,
): Promise<TwilioMessageResponse> {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(
      text,
    ) as TwilioMessageResponse;
  } catch {
    return {};
  }
}

/* =========================================================
   SEND KYC OTP
========================================================= */

export async function sendTwilioKycOtp({
  phone,
  code,
}: SendTwilioKycOtpInput): Promise<TwilioKycOtpResult> {
  const config =
    getTwilioConfiguration();

  if (
    !config.accountSid ||
    !config.authToken ||
    (!config.messagingServiceSid &&
      !config.fromNumber)
  ) {
    throw new TwilioSmsError(
      "Twilio SMS is not configured.",
      "TWILIO_CONFIGURATION_MISSING",
      500,
    );
  }

  const body =
    new URLSearchParams({
      To: phone,
      Body:
        `Your Coffer KYC verification code is ${code}. It expires in 5 minutes. Do not share this code.`,
    });

  if (
    config.messagingServiceSid
  ) {
    body.set(
      "MessagingServiceSid",
      config.messagingServiceSid,
    );
  } else {
    body.set(
      "From",
      config.fromNumber,
    );
  }

  const authorization =
    Buffer.from(
      `${config.accountSid}:${config.authToken}`,
    ).toString("base64");

  let response: Response;

  try {
    response =
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
          config.accountSid,
        )}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Basic ${authorization}`,
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body,
          signal:
            AbortSignal.timeout(
              15_000,
            ),
        },
      );
  } catch (error) {
    const code =
      error instanceof Error &&
      error.name === "TimeoutError"
        ? "TWILIO_REQUEST_TIMEOUT"
        : "TWILIO_NETWORK_ERROR";

    throw new TwilioSmsError(
      "Unable to contact the SMS provider.",
      code,
    );
  }

  const result =
    await readTwilioResponse(
      response,
    );

  if (!response.ok) {
    throw new TwilioSmsError(
      result.message ||
        "Twilio could not deliver the verification code.",
      String(
        result.code ||
          `TWILIO_HTTP_${response.status}`,
      ),
      response.status >= 500
        ? 503
        : 400,
    );
  }

  if (!result.sid) {
    throw new TwilioSmsError(
      "Twilio returned an invalid message response.",
      "TWILIO_INVALID_RESPONSE",
    );
  }

  return {
    messageSid:
      result.sid,

    status:
      result.status ||
      "queued",
  };
}

