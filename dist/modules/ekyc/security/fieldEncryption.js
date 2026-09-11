"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptField = encryptField;
exports.decryptField = decryptField;
exports.keyedLookupHash = keyedLookupHash;
const node_crypto_1 = require("node:crypto");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ADDITIONAL_AUTH_DATA = Buffer.from("coffer:ekyc:field:v1", "utf8");
function getActiveKeyVersion() {
    return (process.env.EKYC_ACTIVE_KEY_VERSION ||
        process.env.EKYC_ENCRYPTION_KEY_VERSION ||
        "v1");
}
function getEncryptionKey(keyVersion) {
    const keysJson = process.env.EKYC_ENCRYPTION_KEYS_JSON;
    let encodedKey;
    if (keysJson) {
        let parsed;
        try {
            parsed = JSON.parse(keysJson);
        }
        catch {
            throw new Error("EKYC_ENCRYPTION_KEYS_JSON contains invalid JSON.");
        }
        encodedKey =
            parsed[keyVersion];
    }
    else {
        encodedKey =
            process.env.EKYC_ENCRYPTION_KEY_BASE64;
    }
    if (!encodedKey) {
        throw new Error(`No e-KYC encryption key found for version ${keyVersion}.`);
    }
    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32) {
        throw new Error("The e-KYC encryption key must decode to exactly 32 bytes.");
    }
    return key;
}
function encryptField(value) {
    if (typeof value !== "string") {
        throw new Error("Only string values can be encrypted.");
    }
    const keyVersion = getActiveKeyVersion();
    const key = getEncryptionKey(keyVersion);
    const iv = (0, node_crypto_1.randomBytes)(IV_LENGTH);
    const cipher = (0, node_crypto_1.createCipheriv)(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    cipher.setAAD(ADDITIONAL_AUTH_DATA);
    const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
    ]);
    return {
        encrypted: encrypted.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher
            .getAuthTag()
            .toString("base64"),
        keyVersion,
    };
}
function decryptField(field) {
    const key = getEncryptionKey(field.keyVersion);
    const iv = Buffer.from(field.iv, "base64");
    const authTag = Buffer.from(field.authTag, "base64");
    const encrypted = Buffer.from(field.encrypted, "base64");
    if (iv.length !== IV_LENGTH) {
        throw new Error("Encrypted field contains an invalid IV.");
    }
    if (authTag.length !==
        AUTH_TAG_LENGTH) {
        throw new Error("Encrypted field contains an invalid authentication tag.");
    }
    const decipher = (0, node_crypto_1.createDecipheriv)(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAAD(ADDITIONAL_AUTH_DATA);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);
    return decrypted.toString("utf8");
}
function keyedLookupHash(value, purpose) {
    const environmentKey = purpose === "rate-limit"
        ? "EKYC_RATE_LIMIT_HMAC_KEY"
        : "EKYC_LOOKUP_HMAC_KEY";
    const secret = process.env[environmentKey];
    if (!secret ||
        secret.length < 32) {
        throw new Error(`${environmentKey} must contain at least 32 characters.`);
    }
    return (0, node_crypto_1.createHmac)("sha256", secret)
        .update(`${purpose}:${value}`, "utf8")
        .digest("hex");
}
