import {
  getPayPalConfig,
} from "../../../config/paypal.js";

/* =========================================================
   TYPES
========================================================= */

interface PayPalOAuthSuccessResponse {
  access_token: string;

  token_type: string;

  expires_in: number;

  nonce?: string;

  scope?: string;

  app_id?: string;
}

interface PayPalOAuthErrorResponse {
  error?: string;

  error_description?: string;
}

interface PayPalOAuthResponse {
  access_token?: unknown;

  token_type?: unknown;

  expires_in?: unknown;

  nonce?: unknown;

  scope?: unknown;

  app_id?: unknown;

  error?: unknown;

  error_description?: unknown;
}

/* =========================================================
   TOKEN CACHE
========================================================= */

interface CachedAccessToken {
  accessToken: string;

  expiresAt: number;
}

let cachedAccessToken:
  | CachedAccessToken
  | null = null;

/* =========================================================
   CONSTANTS
========================================================= */

const TOKEN_EXPIRY_SAFETY_MS =
  60 * 1000;

/* =========================================================
   CLEAR TOKEN CACHE
========================================================= */

export const clearPayPalAccessTokenCache =
  (): void => {
    cachedAccessToken = null;
  };

/* =========================================================
   TYPE GUARDS
========================================================= */

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => {
  return (
    typeof value === "object" &&
    value !== null
  );
};

const isPayPalOAuthSuccessResponse = (
  value: unknown,
): value is PayPalOAuthSuccessResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.access_token ===
      "string" &&
    value.access_token.length > 0 &&
    typeof value.token_type ===
      "string" &&
    typeof value.expires_in ===
      "number"
  );
};

const getOAuthErrorMessage = (
  value: unknown,
): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.error_description ===
    "string"
  ) {
    return value.error_description;
  }

  if (
    typeof value.error ===
    "string"
  ) {
    return value.error;
  }

  return null;
};

/* =========================================================
   GET ACCESS TOKEN
========================================================= */

export const getPayPalAccessToken =
  async (): Promise<string> => {
    const now = Date.now();

    /* =====================================================
       CACHE HIT
    ====================================================== */

    if (
      cachedAccessToken &&
      cachedAccessToken.expiresAt >
        now +
          TOKEN_EXPIRY_SAFETY_MS
    ) {
      return cachedAccessToken.accessToken;
    }

    const config =
      getPayPalConfig();

    /* =====================================================
       BASIC AUTH
    ====================================================== */

    if (
      !config.clientId ||
      !config.clientSecret
    ) {
      throw new Error(
        "PayPal client ID and client secret are not configured.",
      );
    }

    const basicCredentials =
      Buffer.from(
        `${config.clientId}:${config.clientSecret}`,
      ).toString("base64");

    /* =====================================================
       REQUEST
    ====================================================== */

    const controller =
      new AbortController();

    const timeout =
      setTimeout(() => {
        controller.abort();
      }, config.timeoutMs);

    try {
      const response =
        await fetch(
          `${config.baseUrl}/v1/oauth2/token`,
          {
            method: "POST",

            headers: {
              Authorization:
                `Basic ${basicCredentials}`,

              "Content-Type":
                "application/x-www-form-urlencoded",

              Accept:
                "application/json",
            },

            body:
              "grant_type=client_credentials",

            signal:
              controller.signal,
          },
        );

      const rawText =
        await response.text();

      let data: unknown = null;

      if (
        rawText.trim().length > 0
      ) {
        try {
          data = JSON.parse(
            rawText,
          ) as unknown;
        } catch {
          data = null;
        }
      }

      /* ===================================================
         PAYPAL AUTH ERROR
      ==================================================== */

      if (!response.ok) {
        const errorMessage =
          getOAuthErrorMessage(data);

        throw new Error(
          errorMessage ??
            `PayPal authentication failed with status ${response.status}.`,
        );
      }

      /* ===================================================
         VALIDATE SUCCESS RESPONSE
      ==================================================== */

      if (
        !isPayPalOAuthSuccessResponse(
          data,
        )
      ) {
        throw new Error(
          "PayPal authentication returned an invalid access token response.",
        );
      }

      const expiresInSeconds =
        data.expires_in > 0
          ? data.expires_in
          : 3600;

      cachedAccessToken = {
        accessToken:
          data.access_token,

        expiresAt:
          Date.now() +
          expiresInSeconds * 1000,
      };

      return data.access_token;
    } catch (
      error: unknown
    ) {
      if (
        error instanceof Error &&
        error.name ===
          "AbortError"
      ) {
        throw new Error(
          "PayPal authentication request timed out.",
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };