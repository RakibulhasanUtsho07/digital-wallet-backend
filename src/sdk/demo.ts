import {
  randomUUID,
} from "node:crypto";

/* =========================================================
   TYPES
========================================================= */

export type DamoEnvironment =
  | "test"
  | "live";

export interface DamoClientOptions {
  secretKey: string;
  baseUrl?: string;
}

export interface CreatePaymentParams {
  amount: number | string;
  currency?: string;
  customerId: string;
  orderId?: string;
  merchantReference?: string;
  returnUrl?: string;
  cancelUrl?: string;
  idempotencyKey?: string;
}

export interface DamoPayment {
  id: string;
  status:
    | "pending"
    | "authorized"
    | "captured"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";

  amount: string;
  currency: string;

  merchantId: string;
  customerId: string;

  orderId?: string;
  merchantReference?: string;

  mode: DamoEnvironment;
  sourceType: string;
  provider: string;

  checkoutUrl?: string;

  returnUrl?: string;
  cancelUrl?: string;

  createdAt?: string;

  authorizedAt?: string;
  capturedAt?: string;
  completedAt?: string;

  failedAt?: string;
  cancelledAt?: string;
  expiredAt?: string;

  failureCode?: string;
  failureMessage?: string;
}

interface CreatePaymentResponse {
  success: boolean;
  duplicate: boolean;
  payment: DamoPayment;
}

interface GetPaymentResponse {
  success: boolean;
  payment: DamoPayment;
}

/* =========================================================
   SDK ERROR
========================================================= */

export class DamoApiError extends Error {
  status: number;

  details: unknown;

  constructor(
    message: string,
    status: number,
    details?: unknown
  ) {
    super(message);

    this.name =
      "DamoApiError";

    this.status =
      status;

    this.details =
      details;
  }
}

/* =========================================================
   CLIENT
========================================================= */

export class DamoClient {
  private readonly secretKey: string;

  private readonly baseUrl: string;

  public readonly environment:
    | DamoEnvironment;

  constructor(
    options: DamoClientOptions
  ) {
    const secretKey =
      options.secretKey?.trim();

    if (!secretKey) {
      throw new Error(
        "DAMO secretKey is required."
      );
    }

    if (
      !secretKey.startsWith(
        "sk_test_"
      ) &&
      !secretKey.startsWith(
        "sk_live_"
      )
    ) {
      throw new Error(
        "Invalid DAMO secret key format."
      );
    }

    this.secretKey =
      secretKey;

    this.environment =
      secretKey.startsWith(
        "sk_live_"
      )
        ? "live"
        : "test";

    this.baseUrl =
      (
        options.baseUrl?.trim() ||
        "http://localhost:5000/api/v1"
      ).replace(
        /\/+$/,
        ""
      );
  }

  /* =======================================================
     REQUEST
  ======================================================== */

  private async request<T>(
    endpoint: string,
    options: {
      method: "GET" | "POST";
      body?: unknown;
      idempotencyKey?: string;
    }
  ): Promise<T> {
    const headers =
      new Headers();

    headers.set(
      "Authorization",
      `Bearer ${this.secretKey}`
    );

    headers.set(
      "Accept",
      "application/json"
    );

    if (
      options.body !==
        undefined
    ) {
      headers.set(
        "Content-Type",
        "application/json"
      );
    }

    if (
      options.idempotencyKey
    ) {
      headers.set(
        "Idempotency-Key",
        options.idempotencyKey
      );
    }

    const response =
      await fetch(
        `${this.baseUrl}${endpoint}`,
        {
          method:
            options.method,

          headers,

          body:
            options.body !==
            undefined
              ? JSON.stringify(
                  options.body
                )
              : undefined,

          redirect: "error",
        }
      );

    const raw =
      await response.text();

    let data: unknown =
      null;

    if (raw) {
      try {
        data =
          JSON.parse(
            raw
          );
      } catch {
        data = {
          message:
            raw,
        };
      }
    }

    if (
      !response.ok
    ) {
      let message =
        `DAMO API request failed with status ${response.status}.`;

      if (
        typeof data ===
          "object" &&
        data !== null &&
        "message" in data
      ) {
        const apiMessage =
          (
            data as {
              message?: unknown;
            }
          ).message;

        if (
          typeof apiMessage ===
            "string" &&
          apiMessage.trim()
        ) {
          message =
            apiMessage;
        }
      }

      throw new DamoApiError(
        message,
        response.status,
        data
      );
    }

    return data as T;
  }

  /* =======================================================
     PAYMENTS
  ======================================================== */

  public readonly payments =
    {
      create:
        async (
          params: CreatePaymentParams
        ): Promise<
          CreatePaymentResponse
        > => {
          if (
            !params.customerId?.trim()
          ) {
            throw new Error(
              "customerId is required."
            );
          }

          if (
            params.amount ===
              undefined ||
            params.amount ===
              null
          ) {
            throw new Error(
              "amount is required."
            );
          }

          /*
           * For callers that do not explicitly
           * provide an idempotency key, create one.
           *
           * For production retries, the merchant
           * should persist and reuse the same key.
           */
          const idempotencyKey =
            params.idempotencyKey?.trim() ||
            randomUUID();

          return this.request<
            CreatePaymentResponse
          >(
            "/payments",
            {
              method:
                "POST",

              idempotencyKey,

              body: {
                amount:
                  params.amount,

                currency:
                  params.currency ||
                  "BDT",

                customerId:
                  params.customerId.trim(),

                orderId:
                  params.orderId,

                merchantReference:
                  params.merchantReference,

                returnUrl:
                  params.returnUrl,

                cancelUrl:
                  params.cancelUrl,
              },
            }
          );
        },

      get:
        async (
          paymentId: string
        ): Promise<
          GetPaymentResponse
        > => {
          const normalizedId =
            paymentId?.trim();

          if (
            !normalizedId
          ) {
            throw new Error(
              "paymentId is required."
            );
          }

          return this.request<
            GetPaymentResponse
          >(
            `/payments/${encodeURIComponent(
              normalizedId
            )}`,
            {
              method:
                "GET",
            }
          );
        },
    };
}

/* =========================================================
   FACTORY
========================================================= */

export const createDamoClient =
  (
    options: DamoClientOptions
  ): DamoClient => {
    return new DamoClient(
      options
    );
  };