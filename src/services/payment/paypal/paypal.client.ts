import crypto from "node:crypto";

import {
  getPayPalConfig,
} from "../../../config/paypal.js";

import {
  clearPayPalAccessTokenCache,
  getPayPalAccessToken,
} from "./paypal.auth.js";

/* =========================================================
   TYPES
========================================================= */

export interface PayPalRequestOptions {
  method:
    | "GET"
    | "POST"
    | "PATCH"
    | "PUT"
    | "DELETE";

  path: string;

  body?: unknown;

  headers?: Record<
    string,
    string
  >;

  requestId?: string;
}

export interface PayPalResponse<T> {
  data: T;

  status: number;

  headers: Headers;
}

/* =========================================================
   REQUEST ID
========================================================= */

export const createPayPalRequestId =
  (): string => {
    return `yourpay-${crypto
      .randomBytes(16)
      .toString("hex")}`;
  };

/* =========================================================
   HTTP ERROR
========================================================= */

const createPayPalHttpError = (
  status: number,
  data: unknown,
): Error => {
  let message =
    `PayPal API request failed with status ${status}.`;

  if (
    data &&
    typeof data === "object"
  ) {
    const object =
      data as Record<
        string,
        unknown
      >;

    if (
      typeof object.message ===
      "string"
    ) {
      message =
        object.message;
    } else if (
      typeof object.name ===
      "string"
    ) {
      message =
        object.name;
    }

    if (
      Array.isArray(
        object.details,
      ) &&
      object.details.length > 0
    ) {
      const firstDetail =
        object.details[0];

      if (
        firstDetail &&
        typeof firstDetail ===
          "object"
      ) {
        const detail =
          firstDetail as Record<
            string,
            unknown
          >;

        if (
          typeof detail.description ===
          "string"
        ) {
          message =
            `${message}: ${detail.description}`;
        }
      }
    }
  }

  const error =
    new Error(message);

  error.name =
    "PayPalApiError";

  return error;
};

/* =========================================================
   CLIENT
========================================================= */

export const paypalRequest =
  async <T>(
    options: PayPalRequestOptions,
  ): Promise<
    PayPalResponse<T>
  > => {
    const config =
      getPayPalConfig();

    const path =
      options.path.startsWith("/")
        ? options.path
        : `/${options.path}`;

    const requestId =
      options.requestId ??
      createPayPalRequestId();

    const makeRequest =
      async (
        accessToken: string,
      ): Promise<
        Response
      > => {
        const headers =
          new Headers();

        headers.set(
          "Authorization",
          `Bearer ${accessToken}`,
        );

        headers.set(
          "Accept",
          "application/json",
        );

        headers.set(
          "Content-Type",
          "application/json",
        );

        headers.set(
          "PayPal-Request-Id",
          requestId,
        );

        if (
          options.headers
        ) {
          for (
            const [
              key,
              value,
            ] of Object.entries(
              options.headers,
            )
          ) {
            headers.set(
              key,
              value,
            );
          }
        }

        const controller =
          new AbortController();

        const timeout =
          setTimeout(() => {
            controller.abort();
          }, config.timeoutMs);

        try {
          return await fetch(
            `${config.baseUrl}${path}`,
            {
              method:
                options.method,

              headers,

              body:
                options.body !==
                undefined
                  ? JSON.stringify(
                      options.body,
                    )
                  : undefined,

              signal:
                controller.signal,
            },
          );
        } finally {
          clearTimeout(timeout);
        }
      };

    /* =======================================================
       FIRST REQUEST
    ======================================================== */

    let accessToken =
      await getPayPalAccessToken();

    let response =
      await makeRequest(
        accessToken,
      );

    /* =======================================================
       TOKEN REFRESH + RETRY
    ======================================================== */

    if (
      response.status === 401
    ) {
      clearPayPalAccessTokenCache();

      accessToken =
        await getPayPalAccessToken();

      response =
        await makeRequest(
          accessToken,
        );
    }

    /* =======================================================
       RESPONSE PARSING
    ======================================================== */

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
        data = {
          message: rawText,
        };
      }
    }

    /* =======================================================
       ERROR
    ======================================================== */

    if (!response.ok) {
      throw createPayPalHttpError(
        response.status,
        data,
      );
    }

    return {
      data: data as T,

      status:
        response.status,

      headers:
        response.headers,
    };
  };