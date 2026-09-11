import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { EncryptedField } from "../types.js";

function loadEncryptionKey(): Buffer {
  const encoded = process.env.EKYC_ENCRYPTION_KEY_BASE64;
  if (!encoded) throw new Error("EKYC_ENCRYPTION_KEY_BASE64 is required.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("e-KYC encryption key must decode to exactly 32 bytes.");
  return key;
}

export function encryptField(value: string): EncryptedField {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: process.env.EKYC_ENCRYPTION_KEY_VERSION || "v1",
  };
}

export function decryptField(field: EncryptedField): string {
  const decipher = createDecipheriv("aes-256-gcm", loadEncryptionKey(), Buffer.from(field.iv, "base64"));
  decipher.setAuthTag(Buffer.from(field.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(field.encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export type LookupHashPurpose =
  | "nid"
  | "rate-limit"
  | "vector-user"
  | "media-owner"
  | "fingerprint";

export function keyedLookupHash(
  value: string,
  purpose: LookupHashPurpose
): string {
  const envName = purpose === "rate-limit" ? "EKYC_RATE_LIMIT_HMAC_KEY" : "EKYC_LOOKUP_HMAC_KEY";
  const secret = process.env[envName];
  if (!secret || secret.length < 32) throw new Error(`${envName} must contain at least 32 characters.`);
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}
