/* =========================================================
   PAYPAL CONFIGURATION
========================================================= */

export type PayPalEnvironment =
  | "sandbox"
  | "live";

/* =========================================================
   CONFIG TYPE
========================================================= */

export interface PayPalConfig {
  environment: PayPalEnvironment;

  baseUrl: string;

  clientId: string;

  clientSecret: string;

  timeoutMs: number;
}

/* =========================================================
   ENVIRONMENT
========================================================= */

const getEnvironment =
  (): PayPalEnvironment => {
    const raw =
      (
        process.env.PAYPAL_ENVIRONMENT ??
        "sandbox"
      )
        .trim()
        .toLowerCase();

    if (
      raw ===
      "live"
    ) {
      return "live";
    }

    return "sandbox";
  };

/* =========================================================
   BASE URL
========================================================= */

const getBaseUrl =
  (
    environment:
      PayPalEnvironment
  ): string => {
    return environment ===
      "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  };

/* =========================================================
   CONFIG
========================================================= */

export const getPayPalConfig =
  (): PayPalConfig => {
    const environment =
      getEnvironment();

    const clientId =
      process.env
        .PAYPAL_CLIENT_ID?.trim();

    const clientSecret =
      process.env
        .PAYPAL_CLIENT_SECRET?.trim();

    if (!clientId) {
      throw new Error(
        "PAYPAL_CLIENT_ID is not configured."
      );
    }

    if (!clientSecret) {
      throw new Error(
        "PAYPAL_CLIENT_SECRET is not configured."
      );
    }

    return {
      environment,

      baseUrl:
        getBaseUrl(
          environment
        ),

      clientId,

      clientSecret,

      timeoutMs:
        Number(
          process.env
            .PAYPAL_TIMEOUT_MS ??
            15000
        ) || 15000,
    };
  };

/* =========================================================
   SANDBOX CHECK
========================================================= */

export const isPayPalSandbox =
  (): boolean => {
    return (
      getEnvironment() ===
      "sandbox"
    );
  };

/* =========================================================
   LIVE CHECK
========================================================= */

export const isPayPalLive =
  (): boolean => {
    return (
      getEnvironment() ===
      "live"
    );
  };