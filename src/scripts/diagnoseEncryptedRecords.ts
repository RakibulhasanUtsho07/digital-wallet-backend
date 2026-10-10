import "dotenv/config";
import crypto from "node:crypto";

import mongoose from "mongoose";

import { decryptData, type EncryptedData } from "../utils/crypto.js";

// Read-only check. Run from the backend root:
// npx tsx src/scripts/diagnoseEncryptedRecords.ts
// Never print the encryption key, document references, or decrypted values.

type Result =
  | "valid"
  | "missing"
  | "malformed"
  | "authentication_failed"
  | "utility_error"
  | "invalid_plaintext"
  | "configuration_error";

type Counts = Record<Result, number>;

type MalformedShape =
  | "string"
  | "number_or_boolean"
  | "array"
  | "binary"
  | "missing_encrypted"
  | "missing_iv"
  | "missing_auth_tag"
  | "non_string_part"
  | "empty_part"
  | "invalid_iv_hex"
  | "invalid_auth_tag_hex"
  | "invalid_encrypted_hex"
  | "iv_wrong_length"
  | "auth_tag_wrong_length"
  | "other_decryption_error";

function malformedShape(value: unknown): MalformedShape {
  if (typeof value === "string") return "string";
  if (typeof value === "number" || typeof value === "boolean") return "number_or_boolean";
  if (Array.isArray(value)) return "array";
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return "binary";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (!("encrypted" in record)) return "missing_encrypted";
    if (!("iv" in record)) return "missing_iv";
    if (!("authTag" in record)) return "missing_auth_tag";
    if ([record.encrypted, record.iv, record.authTag].some((part) => typeof part !== "string")) {
      return "non_string_part";
    }
    if ([record.encrypted, record.iv, record.authTag].some((part) => !part)) return "empty_part";
    const iv = record.iv as string;
    const authTag = record.authTag as string;
    const encrypted = record.encrypted as string;
    const hex = (part: string) => /^(?:[\da-fA-F]{2})+$/.test(part);
    if (!hex(iv)) return "invalid_iv_hex";
    if (!hex(authTag)) return "invalid_auth_tag_hex";
    if (!hex(encrypted)) return "invalid_encrypted_hex";
    if (iv.length !== 24) return "iv_wrong_length";
    if (authTag.length !== 32) return "auth_tag_wrong_length";
  }
  return "other_decryption_error";
}

function recordMalformedShape(value: unknown, result: Result, shapes: Partial<Record<MalformedShape, number>>): void {
  if (result !== "malformed") return;
  const shape = malformedShape(value);
  shapes[shape] = (shapes[shape] ?? 0) + 1;
}

function emptyCounts(): Counts {
  return {
    valid: 0,
    missing: 0,
    malformed: 0,
    authentication_failed: 0,
    utility_error: 0,
    invalid_plaintext: 0,
    configuration_error: 0,
  };
}

function isEncryptedData(value: unknown): value is EncryptedData {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<EncryptedData>;
  return [record.encrypted, record.iv, record.authTag].every(
    (part) => typeof part === "string" && part.length > 0,
  );
}

// Independently validate AES-GCM authentication without printing plaintext.
// A success here with a decryptData failure means the utility needs inspection.
function canAuthenticateWithCurrentKey(value: EncryptedData): boolean {
  try {
    const key = Buffer.from(process.env.DATA_ENCRYPTION_KEY!.trim(), "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "hex"));
    decipher.setAuthTag(Buffer.from(value.authTag, "hex"));
    decipher.update(Buffer.from(value.encrypted, "hex"));
    decipher.final();
    return true;
  } catch {
    return false;
  }
}

function inspect(value: unknown, kind: "amount" | "document", merchantId?: string, documentKind?: string): Result {
  if (value == null) return "missing";
  if (!isEncryptedData(value)) return "malformed";

  let plaintext: string;
  try {
    plaintext = decryptData(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("DATA_ENCRYPTION_KEY")) return "configuration_error";
    if (message.includes("authenticate data")) return "authentication_failed";
    if (malformedShape(value) === "other_decryption_error") {
      return canAuthenticateWithCurrentKey(value) ? "utility_error" : "authentication_failed";
    }
    return "malformed";
  }

  if (kind === "amount") {
    const minor = Number(plaintext);
    return /^\d+$/.test(plaintext) && Number.isSafeInteger(minor) && minor >= 0
      ? "valid"
      : "invalid_plaintext";
  }

  try {
    const reference = JSON.parse(plaintext) as Record<string, unknown>;
    return reference.merchantId === merchantId &&
      reference.kind === documentKind &&
      typeof reference.publicId === "string" && reference.publicId.length > 0 &&
      typeof reference.format === "string" && reference.format.length > 0 &&
      (reference.resourceType === "image" || reference.resourceType === "raw")
      ? "valid"
      : "invalid_plaintext";
  } catch {
    return "invalid_plaintext";
  }
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_DB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is missing.");

  const configuredKey = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!configuredKey || !/^[a-fA-F0-9]{64}$/.test(configuredKey)) {
    throw new Error("DATA_ENCRYPTION_KEY is missing or is not 64 hexadecimal characters.");
  }

  const cloudinaryConfigured = [
    process.env.CLOUDINARY_CLOUD_NAME,
    process.env.CLOUDINARY_API_KEY,
    process.env.CLOUDINARY_API_SECRET,
  ].every((part) => Boolean(part?.trim()));

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is unavailable.");

  const transactionAmounts = emptyCounts();
  const merchantDocumentReferences = emptyCounts();
  const transactionMalformedShapes: Partial<Record<MalformedShape, number>> = {};
  const merchantDocumentMalformedShapes: Partial<Record<MalformedShape, number>> = {};

  for await (const transaction of db.collection("transactions").find(
    {},
    { projection: { amountEncrypted: 1 } },
  )) {
    const result = inspect(transaction.amountEncrypted, "amount");
    transactionAmounts[result] += 1;
    recordMalformedShape(transaction.amountEncrypted, result, transactionMalformedShapes);
  }

  for await (const verification of db.collection("merchantverifications").find(
    {},
    { projection: { merchantId: 1, documents: 1 } },
  )) {
    const documents = Array.isArray(verification.documents) ? verification.documents : [];
    for (const document of documents) {
      const entry = document && typeof document === "object"
        ? document as { kind?: unknown; objectRefEncrypted?: unknown }
        : {};
      const kind = typeof entry.kind === "string" ? entry.kind : "";
      const result = inspect(entry.objectRefEncrypted, "document", String(verification.merchantId), kind);
      merchantDocumentReferences[result] += 1;
      recordMalformedShape(entry.objectRefEncrypted, result, merchantDocumentMalformedShapes);
    }
  }

  console.log(JSON.stringify({
    transactionAmounts,
    transactionMalformedShapes,
    merchantDocumentReferences,
    merchantDocumentMalformedShapes,
    cloudinaryEnvironmentConfigured: cloudinaryConfigured,
    cloudinaryFileAccessTested: false,
    databaseWrites: 0,
  }, null, 2));

  const failed = (counts: Counts) => Object.entries(counts)
    .some(([result, count]) => result !== "valid" && count > 0);

  if (transactionAmounts.authentication_failed && merchantDocumentReferences.authentication_failed) {
    console.log("Both collections failed AES-GCM authentication. Check whether the original DATA_ENCRYPTION_KEY changed.");
  } else if (merchantDocumentReferences.valid && !cloudinaryConfigured) {
    console.log("Document references decrypt, but Cloudinary environment variables are missing.");
  } else if (!failed(merchantDocumentReferences) && merchantDocumentReferences.valid) {
    console.log("Stored merchant references decrypt. If the drawer still fails, check the backend document-signing log and Cloudinary account.");
  }

  if (failed(transactionAmounts) || failed(merchantDocumentReferences) || !cloudinaryConfigured) {
    process.exitCode = 1;
  }
}

void main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    console.error(message.startsWith("MONGO_URI") || message.startsWith("DATA_ENCRYPTION_KEY")
      ? message
      : "Diagnostic could not connect to MongoDB or read the required collections.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
