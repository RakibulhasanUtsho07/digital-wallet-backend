import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  WebAuthnFlow,
} from "../models/WebAuthnFlow.js";

/* =========================================================
   TYPES
========================================================= */

export interface TransferAuthorizationInput {
  recipient: unknown;

  amount: unknown;

  reference?: unknown;

  idempotencyKey: string;
}

export interface MerchantPaymentAuthorizationInput {
  paymentId: unknown;

  merchantId: unknown;

  amount: unknown;

  currency: unknown;
}

interface ConsumeAuthorizationInput {
  userId: string;

  token: string;

  operationHash: string;
}

/* =========================================================
   CONSTANTS
========================================================= */

const PAYMENT_AUTHORIZATION_TTL_MS =
  2 * 60 * 1000;

const MAX_TOKEN_LENGTH =
  200;

/* =========================================================
   AUTHORIZATION KEY
========================================================= */

function authorizationKey(): string {
  const key =
    process.env
      .PAYMENT_AUTHORIZATION_HMAC_KEY
      ?.trim() ||
    "";

  if (
    key.length <
    32
  ) {
    throw new Error(
      "PAYMENT_AUTHORIZATION_HMAC_KEY must contain at least 32 characters."
    );
  }

  return key;
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeText(
  value: unknown
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function normalizeCurrency(
  value: unknown
): string {
  const currency =
    normalizeText(
      value
    ).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency
    )
  ) {
    throw new Error(
      "A valid payment currency is required."
    );
  }

  return currency;
}

/* =========================================================
   MONEY
========================================================= */

function amountToMinorUnits(
  value: unknown
): number {
  let raw: string;

  if (
    typeof value ===
    "number"
  ) {
    if (
      !Number.isFinite(
        value
      )
    ) {
      throw new Error(
        "A valid payment amount is required."
      );
    }

    raw =
      String(value);
  } else {
    raw =
      normalizeText(
        value
      );
  }

  if (
    !/^\d+(?:\.\d{1,2})?$/.test(
      raw
    )
  ) {
    throw new Error(
      "Payment amount must have no more than two decimal places."
    );
  }

  const [
    wholePart,
    fractionPart = "",
  ] = raw.split(".");

  const amountMinorUnits =
    Number(
      wholePart
    ) *
      100 +
    Number(
      fractionPart
        .padEnd(2, "0")
        .slice(0, 2)
    );

  if (
    !Number.isSafeInteger(
      amountMinorUnits
    ) ||
    amountMinorUnits <= 0
  ) {
    throw new Error(
      "A valid payment amount is required."
    );
  }

  return amountMinorUnits;
}

/* =========================================================
   OPERATION HMAC
========================================================= */

function createOperationHash(
  canonical:
    Record<string, unknown>
): string {
  return createHmac(
    "sha256",
    authorizationKey()
  )
    .update(
      JSON.stringify(
        canonical
      ),
      "utf8"
    )
    .digest("hex");
}

/* =========================================================
   TRANSFER OPERATION HASH

   Used by the existing Send Money flow.
========================================================= */

export function transferOperationHash(
  input:
    TransferAuthorizationInput
): string {
  const recipient =
    normalizeText(
      input.recipient
    ).toLowerCase();

  const reference =
    normalizeText(
      input.reference
    );

  const idempotencyKey =
    normalizeText(
      input.idempotencyKey
    );

  const amountMinorUnits =
    amountToMinorUnits(
      input.amount
    );

  if (
    !recipient ||
    !idempotencyKey
  ) {
    throw new Error(
      "Valid transfer details are required for payment authorization."
    );
  }

  return createOperationHash({
    action:
      "TRANSFER",

    recipient,

    amountMinorUnits,

    reference,

    idempotencyKey,
  });
}

/* =========================================================
   MERCHANT CHECKOUT OPERATION HASH

   Binds the passkey authorization to:
   - one payment
   - one merchant
   - one exact amount
   - one currency

   A token generated for one payment cannot authorize
   another merchant payment.
========================================================= */

export function merchantPaymentOperationHash(
  input:
    MerchantPaymentAuthorizationInput
): string {
  const paymentId =
    normalizeText(
      input.paymentId
    );

  const merchantId =
    normalizeText(
      input.merchantId
    );

  const currency =
    normalizeCurrency(
      input.currency
    );

  const amountMinorUnits =
    amountToMinorUnits(
      input.amount
    );

  if (
    !paymentId ||
    !merchantId
  ) {
    throw new Error(
      "Valid merchant payment details are required for authorization."
    );
  }

  if (
    paymentId.length >
      200 ||
    merchantId.length >
      100
  ) {
    throw new Error(
      "Merchant payment authorization details are invalid."
    );
  }

  return createOperationHash({
    action:
      "MERCHANT_PAYMENT",

    paymentId,

    merchantId,

    amountMinorUnits,

    currency,
  });
}

/* =========================================================
   TOKEN HASH
========================================================= */

function tokenHash(
  token: string
): string {
  return createHash(
    "sha256"
  )
    .update(
      token,
      "utf8"
    )
    .digest("hex");
}

/* =========================================================
   TIMING-SAFE HASH COMPARISON
========================================================= */

function hashesMatch(
  expectedHash: string,
  actualHash: string
): boolean {
  if (
    !/^[a-f0-9]{64}$/i.test(
      expectedHash
    ) ||
    !/^[a-f0-9]{64}$/i.test(
      actualHash
    )
  ) {
    return false;
  }

  const expected =
    Buffer.from(
      expectedHash,
      "hex"
    );

  const actual =
    Buffer.from(
      actualHash,
      "hex"
    );

  return (
    expected.length ===
      actual.length &&
    timingSafeEqual(
      expected,
      actual
    )
  );
}

/* =========================================================
   ISSUE ONE-TIME AUTHORIZATION
========================================================= */

export async function issuePaymentAuthorization(
  userId: string,
  operationHash: string
): Promise<{
  token: string;
  expiresAt: string;
}> {
  const normalizedUserId =
    normalizeText(
      userId
    );

  if (!normalizedUserId) {
    throw new Error(
      "Authenticated user is required."
    );
  }

  if (
    !/^[a-f0-9]{64}$/i.test(
      operationHash
    )
  ) {
    throw new Error(
      "Payment authorization operation hash is invalid."
    );
  }

  const token =
    randomBytes(32)
      .toString(
        "base64url"
      );

  const expiresAt =
    new Date(
      Date.now() +
        PAYMENT_AUTHORIZATION_TTL_MS
    );

  await WebAuthnFlow.create({
    flowId:
      `payment-token:${randomBytes(
        18
      ).toString(
        "base64url"
      )}`,

    userId:
      normalizedUserId,

    kind:
      "PAYMENT_AUTHORIZATION",

    /*
     * Only the SHA-256 hash of the token is stored.
     */
    tokenHash:
      tokenHash(
        token
      ),

    operationHash,

    expiresAt,
  });

  return {
    token,

    expiresAt:
      expiresAt.toISOString(),
  };
}

/* =========================================================
   CONSUME ONE-TIME AUTHORIZATION
========================================================= */

export async function consumeOperationAuthorization(
  input:
    ConsumeAuthorizationInput
): Promise<boolean> {
  const userId =
    normalizeText(
      input.userId
    );

  const token =
    normalizeText(
      input.token
    );

  const operationHash =
    normalizeText(
      input.operationHash
    );

  if (
    !userId ||
    !token ||
    token.length >
      MAX_TOKEN_LENGTH ||
    !/^[a-f0-9]{64}$/i.test(
      operationHash
    )
  ) {
    return false;
  }

  /*
   * findOneAndDelete makes the authorization single-use.
   *
   * Even if financial processing later fails, the customer
   * must complete passkey authentication again.
   */
  const record =
    await WebAuthnFlow.findOneAndDelete({
      userId,

      kind:
        "PAYMENT_AUTHORIZATION",

      tokenHash:
        tokenHash(
          token
        ),

      expiresAt: {
        $gt:
          new Date(),
      },
    }).select(
      "+operationHash"
    );

  if (
    !record
      ?.operationHash
  ) {
    return false;
  }

  return hashesMatch(
    record.operationHash,
    operationHash
  );
}

/* =========================================================
   CONSUME TRANSFER AUTHORIZATION

   Backward-compatible wrapper for Send Money.
========================================================= */

export async function consumePaymentAuthorization(
  input: {
    userId: string;

    token: string;

    transfer:
      TransferAuthorizationInput;
  }
): Promise<boolean> {
  const operationHash =
    transferOperationHash(
      input.transfer
    );

  return consumeOperationAuthorization({
    userId:
      input.userId,

    token:
      input.token,

    operationHash,
  });
}

/* =========================================================
   CONSUME MERCHANT PAYMENT AUTHORIZATION
========================================================= */

export async function consumeMerchantPaymentAuthorization(
  input: {
    userId: string;

    token: string;

    payment:
      MerchantPaymentAuthorizationInput;
  }
): Promise<boolean> {
  const operationHash =
    merchantPaymentOperationHash(
      input.payment
    );

  return consumeOperationAuthorization({
    userId:
      input.userId,

    token:
      input.token,

    operationHash,
  });
}