import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import type {
  EncryptedField,
} from "../types.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const ADDITIONAL_AUTH_DATA =
  Buffer.from(
    "coffer:ekyc:field:v1",
    "utf8"
  );

function getActiveKeyVersion(): string {
  return (
    process.env.EKYC_ACTIVE_KEY_VERSION ||
    process.env.EKYC_ENCRYPTION_KEY_VERSION ||
    "v1"
  );
}

function getEncryptionKey(
  keyVersion: string
): Buffer {
  const keysJson =
    process.env.EKYC_ENCRYPTION_KEYS_JSON;

  let encodedKey:
    string | undefined;

  if (keysJson) {
    let parsed:
      Record<string, string>;

    try {
      parsed = JSON.parse(keysJson) as Record<
        string,
        string
      >;
    } catch {
      throw new Error(
        "EKYC_ENCRYPTION_KEYS_JSON contains invalid JSON."
      );
    }

    encodedKey =
      parsed[keyVersion];
  } else {
    encodedKey =
      process.env.EKYC_ENCRYPTION_KEY_BASE64;
  }

  if (!encodedKey) {
    throw new Error(
      `No e-KYC encryption key found for version ${keyVersion}.`
    );
  }

  const key =
    Buffer.from(
      encodedKey,
      "base64"
    );

  if (key.length !== 32) {
    throw new Error(
      "The e-KYC encryption key must decode to exactly 32 bytes."
    );
  }

  return key;
}

export function encryptField(
  value: string
): EncryptedField {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      "Only string values can be encrypted."
    );
  }

  const keyVersion =
    getActiveKeyVersion();

  const key =
    getEncryptionKey(
      keyVersion
    );

  const iv =
    randomBytes(
      IV_LENGTH
    );

  const cipher =
    createCipheriv(
      ALGORITHM,
      key,
      iv,
      {
        authTagLength:
          AUTH_TAG_LENGTH,
      }
    );

  cipher.setAAD(
    ADDITIONAL_AUTH_DATA
  );

  const encrypted =
    Buffer.concat([
      cipher.update(
        value,
        "utf8"
      ),
      cipher.final(),
    ]);

  return {
    encrypted:
      encrypted.toString(
        "base64"
      ),

    iv:
      iv.toString(
        "base64"
      ),

    authTag:
      cipher
        .getAuthTag()
        .toString(
          "base64"
        ),

    keyVersion,
  };
}

export function decryptField(
  field: EncryptedField
): string {
  const key =
    getEncryptionKey(
      field.keyVersion
    );

  const iv =
    Buffer.from(
      field.iv,
      "base64"
    );

  const authTag =
    Buffer.from(
      field.authTag,
      "base64"
    );

  const encrypted =
    Buffer.from(
      field.encrypted,
      "base64"
    );

  if (
    iv.length !== IV_LENGTH
  ) {
    throw new Error(
      "Encrypted field contains an invalid IV."
    );
  }

  if (
    authTag.length !==
    AUTH_TAG_LENGTH
  ) {
    throw new Error(
      "Encrypted field contains an invalid authentication tag."
    );
  }

  const decipher =
    createDecipheriv(
      ALGORITHM,
      key,
      iv,
      {
        authTagLength:
          AUTH_TAG_LENGTH,
      }
    );

  decipher.setAAD(
    ADDITIONAL_AUTH_DATA
  );

  decipher.setAuthTag(
    authTag
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        encrypted
      ),
      decipher.final(),
    ]);

  return decrypted.toString(
    "utf8"
  );
}

export type LookupHashPurpose =
  | "nid"
  | "rate-limit"
  | "vector-user";

export function keyedLookupHash(
  value: string,
  purpose: LookupHashPurpose
): string {
  const environmentKey =
    purpose === "rate-limit"
      ? "EKYC_RATE_LIMIT_HMAC_KEY"
      : "EKYC_LOOKUP_HMAC_KEY";

  const secret =
    process.env[
      environmentKey
    ];

  if (
    !secret ||
    secret.length < 32
  ) {
    throw new Error(
      `${environmentKey} must contain at least 32 characters.`
    );
  }

  return createHmac(
    "sha256",
    secret
  )
    .update(
      `${purpose}:${value}`,
      "utf8"
    )
    .digest("hex");
}