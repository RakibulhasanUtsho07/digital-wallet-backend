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
  }
}

/* =========================================================
   CLIENT
========================================================= */

let cachedClient:
  | ReturnType<typeof DescopeClient>
  | undefined;

function getDescopeClient(): ReturnType<typeof DescopeClient> {
  if (process.env.DESCOPE_SMS_ENABLED !== "true") {
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

  if (!cachedClient) {
    try {
      cachedClient = DescopeClient({
        projectId,
      });
    } catch {
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
  error:
    | {
        errorCode?: string;
        errorDescription?: string;
        errorMessage?: string;
      }
    | undefined
): DescopeOtpProviderError {
  const providerCode =
    error?.errorCode ??
    "DESCOPE_UNKNOWN_ERROR";

  const reason =
    mapProviderError(providerCode);

  return new DescopeOtpProviderError(
    error?.errorDescription ??
      error?.errorMessage ??
      "Descope OTP operation failed.",
    reason,
    providerCode
  );
}

/* =========================================================
   SEND SMS OTP
========================================================= */

export async function requestDescopeSmsOtp(
  phone: string
): Promise<void> {
  const client =
    getDescopeClient();

  try {
    const response =
      await client.otp.signUpOrIn["sms"](
        phone,
        {}
      );

    if (!response.ok) {
      throw createProviderResponseError(
        response.error
      );
    }
  } catch (error) {
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

  try {
    const response =
      await client.otp.verify["sms"](
        phone,
        otp
      );

    if (!response.ok) {
      throw createProviderResponseError(
        response.error
      );
    }

    /*
     * Descope returns session tokens after successful
     * verification. Coffer already has its own authenticated
     * session, so those tokens are intentionally not returned
     * or logged.
     */
  } catch (error) {
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