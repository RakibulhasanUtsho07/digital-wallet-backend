import DescopeClient from "@descope/node-sdk";

/* =========================================================
   TYPES
========================================================= */

export type DescopeOtpFailureReason =
  | "invalid_code"
  | "too_many_attempts"
  | "expired"
  | "rate_limited"
  | "invalid_phone"
  | "configuration"
  | "provider_unavailable";

type DescopeErrorPayload = {
  errorCode?: string;
  errorDescription?: string;
  errorMessage?: string;
  message?: string;
};

/* =========================================================
   PROVIDER ERROR
========================================================= */

export class DescopeOtpProviderError extends Error {
  constructor(
    message: string,
    readonly reason: DescopeOtpFailureReason,
    readonly providerCode: string
  ) {
    super(message);

    this.name = "DescopeOtpProviderError";

    Object.setPrototypeOf(
      this,
      new.target.prototype
    );
  }
}

/* =========================================================
   CLIENT
========================================================= */

let cachedClient:
  | ReturnType<typeof DescopeClient>
  | undefined;

let cachedProjectId = "";

function isDescopeSmsEnabled(): boolean {
  return (
    process.env.DESCOPE_SMS_ENABLED
      ?.trim()
      .toLowerCase() === "true"
  );
}

function getDescopeClient(): ReturnType<typeof DescopeClient> {
  if (!isDescopeSmsEnabled()) {
    throw new DescopeOtpProviderError(
      "Descope SMS verification is disabled.",
      "configuration",
      "DESCOPE_SMS_DISABLED"
    );
  }

  const projectId =
    process.env.DESCOPE_PROJECT_ID?.trim();

  if (!projectId) {
    throw new DescopeOtpProviderError(
      "DESCOPE_PROJECT_ID is not configured.",
      "configuration",
      "DESCOPE_PROJECT_ID_MISSING"
    );
  }

  if (
    !cachedClient ||
    cachedProjectId !== projectId
  ) {
    try {
      cachedClient = DescopeClient({
        projectId,
      });

      cachedProjectId = projectId;
    } catch {
      cachedClient = undefined;
      cachedProjectId = "";

      throw new DescopeOtpProviderError(
        "Descope client initialization failed.",
        "configuration",
        "DESCOPE_INITIALIZATION_FAILED"
      );
    }
  }

  return cachedClient;
}

/* =========================================================
   ERROR MAPPING
========================================================= */

function mapProviderError(
  providerCode: string
): DescopeOtpFailureReason {
  switch (providerCode) {
    case "E061102":
      return "invalid_code";

    case "E061103":
      return "too_many_attempts";

    case "E061104":
      return "expired";

    case "E032101":
    case "E033005":
      return "rate_limited";

    case "E032106":
      return "invalid_phone";

    case "E061002":
    case "E071001":
    case "E013009":
      return "configuration";

    default:
      return "provider_unavailable";
  }
}

function createProviderResponseError(
  error: DescopeErrorPayload | undefined
): DescopeOtpProviderError {
  const providerCode =
    error?.errorCode ??
    "DESCOPE_UNKNOWN_ERROR";

  return new DescopeOtpProviderError(
    error?.errorDescription ??
      error?.errorMessage ??
      error?.message ??
      "Descope OTP operation failed.",
    mapProviderError(providerCode),
    providerCode
  );
}

function validatePhone(phone: string): string {
  const normalized = phone.trim();

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new DescopeOtpProviderError(
      "The phone number must use E.164 format.",
      "invalid_phone",
      "PHONE_FORMAT_INVALID"
    );
  }

  return normalized;
}

/* =========================================================
   SEND SMS OTP
========================================================= */

export async function requestDescopeSmsOtp(
  phone: string
): Promise<void> {
  const client =
    getDescopeClient();

  const normalizedPhone =
    validatePhone(phone);

  try {
    const response =
      await client.otp.signUpOrIn["sms"](
        normalizedPhone,
        {}
      );

    if (!response.ok) {
      throw createProviderResponseError(
        response.error
      );
    }
  } catch (error: unknown) {
    if (
      error instanceof
      DescopeOtpProviderError
    ) {
      throw error;
    }

    throw new DescopeOtpProviderError(
      "Unable to contact the SMS verification provider.",
      "provider_unavailable",
      "DESCOPE_REQUEST_FAILED"
    );
  }
}

/* =========================================================
   VERIFY SMS OTP
========================================================= */

export async function verifyDescopeSmsOtp(
  phone: string,
  otp: string
): Promise<void> {
  const client =
    getDescopeClient();

  const normalizedPhone =
    validatePhone(phone);

  const normalizedOtp =
    otp.trim();

  if (!/^\d{6}$/.test(normalizedOtp)) {
    throw new DescopeOtpProviderError(
      "Enter the 6-digit verification code.",
      "invalid_code",
      "OTP_FORMAT_INVALID"
    );
  }

  try {
    const response =
      await client.otp.verify["sms"](
        normalizedPhone,
        normalizedOtp
      );

    if (!response.ok) {
      throw createProviderResponseError(
        response.error
      );
    }

    /*
     * Descope returns its own session tokens after successful
     * verification. The wallet already has an authenticated
     * session, so these tokens are intentionally not returned
     * or logged.
     */
  } catch (error: unknown) {
    if (
      error instanceof
      DescopeOtpProviderError
    ) {
      throw error;
    }

    throw new DescopeOtpProviderError(
      "Unable to verify the SMS code.",
      "provider_unavailable",
      "DESCOPE_VERIFY_FAILED"
    );
  }
}
