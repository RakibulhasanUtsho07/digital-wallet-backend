import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { WebAuthnFlow } from "../models/WebAuthnFlow.js";

export interface TransferAuthorizationInput {
  recipient: unknown;
  amount: unknown;
  reference?: unknown;
  idempotencyKey: string;
}

function authorizationKey(): string {
  const key = process.env.PAYMENT_AUTHORIZATION_HMAC_KEY?.trim() || "";
  if (key.length < 32) {
    throw new Error("PAYMENT_AUTHORIZATION_HMAC_KEY must contain at least 32 characters.");
  }
  return key;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function transferOperationHash(input: TransferAuthorizationInput): string {
  const recipient = normalizeText(input.recipient).toLowerCase();
  const reference = normalizeText(input.reference);
  const amount = Number(input.amount);
  const amountMinorUnits = Math.round(amount * 100);
  const idempotencyKey = input.idempotencyKey.trim();

  if (!recipient || !idempotencyKey || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Valid transfer details are required for payment authorization.");
  }
  if (!Number.isSafeInteger(amountMinorUnits) || Math.abs(amount - amountMinorUnits / 100) > Number.EPSILON) {
    throw new Error("Transfer amount must have no more than two decimal places.");
  }

  const canonical = JSON.stringify({
    action: "TRANSFER",
    recipient,
    amountMinorUnits,
    reference,
    idempotencyKey,
  });

  return createHmac("sha256", authorizationKey()).update(canonical, "utf8").digest("hex");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function issuePaymentAuthorization(
  userId: string,
  operationHash: string
): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

  await WebAuthnFlow.create({
    flowId: `payment-token:${randomBytes(18).toString("base64url")}`,
    userId,
    kind: "PAYMENT_AUTHORIZATION",
    tokenHash: tokenHash(token),
    operationHash,
    expiresAt,
  });

  return { token, expiresAt: expiresAt.toISOString() };
}

export async function consumePaymentAuthorization(input: {
  userId: string;
  token: string;
  transfer: TransferAuthorizationInput;
}): Promise<boolean> {
  const normalizedToken = input.token.trim();
  if (!normalizedToken || normalizedToken.length > 200) return false;

  const record = await WebAuthnFlow.findOneAndDelete({
    userId: input.userId,
    kind: "PAYMENT_AUTHORIZATION",
    tokenHash: tokenHash(normalizedToken),
    expiresAt: { $gt: new Date() },
  }).select("+operationHash");

  if (!record?.operationHash) return false;

  const expected = Buffer.from(record.operationHash, "hex");
  const actual = Buffer.from(transferOperationHash(input.transfer), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
