import crypto from "crypto";

/* =========================================================
   TYPES
========================================================= */

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

/* =========================================================
   REQUIRED ENV
========================================================= */

function getRequiredEnv(
  name: string
): string {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `${name} is missing`
    );
  }

  return value;
}

/* =========================================================
   GET ENCRYPTION KEY
========================================================= */

function getEncryptionKey(): Buffer {
  const rawKey =
    getRequiredEnv(
      "DATA_ENCRYPTION_KEY"
    );

  const key =
    Buffer.from(
      rawKey,
      "hex"
    );

  if (key.length !== 32) {
    throw new Error(
      "DATA_ENCRYPTION_KEY must be a 64-character hex string."
    );
  }

  return key;
}

/* =========================================================
   AES-256-GCM ENCRYPT
========================================================= */

export function encryptData(
  value: string
): EncryptedData {
  const key =
    getEncryptionKey();

  const iv =
    crypto.randomBytes(12);

  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      key,
      iv
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        value,
        "utf8"
      ),
      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  return {
    encrypted:
      encrypted.toString(
        "hex"
      ),

    iv:
      iv.toString(
        "hex"
      ),

    authTag:
      authTag.toString(
        "hex"
      ),
  };
}

/* =========================================================
   AES-256-GCM DECRYPT
========================================================= */

export function decryptData(
  data: EncryptedData
): string {
  const key =
    getEncryptionKey();

  const decipher =
    crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(
        data.iv,
        "hex"
      )
    );

  decipher.setAuthTag(
    Buffer.from(
      data.authTag,
      "hex"
    )
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          data.encrypted,
          "hex"
        )
      ),
      decipher.final(),
    ]);

  return decrypted.toString(
    "utf8"
  );
}

/* =========================================================
   HMAC LOOKUP
========================================================= */

export function createLookupHash(
  value: string
): string {
  const hmacKey =
    getRequiredEnv(
      "LOOKUP_HMAC_KEY"
    );

  return crypto
    .createHmac(
      "sha256",
      hmacKey
    )
    .update(
      value
        .trim()
        .toLowerCase()
    )
    .digest("hex");
}

/* =========================================================
   NORMALIZE PHONE
========================================================= */

export function normalizePhone(
  phone: string
): string {
  return phone
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .trim();
}

/* =========================================================
   NORMALIZE EMAIL
========================================================= */

export function normalizeEmail(
  email: string
): string {
  return email
    .trim()
    .toLowerCase();
}