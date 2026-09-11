"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptData = encryptData;
exports.decryptData = decryptData;
exports.createLookupHash = createLookupHash;
exports.normalizePhone = normalizePhone;
exports.normalizeEmail = normalizeEmail;
exports.hashSecretCode = hashSecretCode;
exports.safeEqualHex = safeEqualHex;
const node_crypto_1 = __importDefault(require("node:crypto"));
/* =========================================================
   REQUIRED ENV
========================================================= */
function getRequiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is missing from environment variables.`);
    }
    return value;
}
/* =========================================================
   GET ENCRYPTION KEY
========================================================= */
function getEncryptionKey() {
    const rawKey = getRequiredEnv("DATA_ENCRYPTION_KEY");
    /*
     * Must be exactly 32 bytes.
     * 32 bytes = 64 hexadecimal characters.
     */
    if (!/^[a-fA-F0-9]{64}$/.test(rawKey)) {
        throw new Error("DATA_ENCRYPTION_KEY must be a 64-character hexadecimal string.");
    }
    const key = Buffer.from(rawKey, "hex");
    if (key.length !== 32) {
        throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes.");
    }
    return key;
}
/* =========================================================
   GET LOOKUP HMAC KEY
========================================================= */
function getLookupHmacKey() {
    const key = getRequiredEnv("LOOKUP_HMAC_KEY");
    /*
     * HMAC keys should be sufficiently long.
     */
    if (key.length < 32) {
        throw new Error("LOOKUP_HMAC_KEY must contain at least 32 characters.");
    }
    return key;
}
/* =========================================================
   NORMALIZE LOOKUP VALUE
========================================================= */
function normalizeLookupValue(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
}
/* =========================================================
   AES-256-GCM ENCRYPT
========================================================= */
function encryptData(value) {
    if (typeof value !== "string") {
        throw new TypeError("Value to encrypt must be a string.");
    }
    const key = getEncryptionKey();
    /*
     * 12-byte IV is recommended for GCM.
     */
    const iv = node_crypto_1.default.randomBytes(12);
    const cipher = node_crypto_1.default.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return {
        encrypted: encrypted.toString("hex"),
        iv: iv.toString("hex"),
        authTag: authTag.toString("hex"),
    };
}
/* =========================================================
   AES-256-GCM DECRYPT
========================================================= */
function decryptData(data) {
    if (!data ||
        typeof data !== "object") {
        throw new TypeError("Encrypted data is required.");
    }
    if (!data.encrypted ||
        !data.iv ||
        !data.authTag) {
        throw new Error("Invalid encrypted data.");
    }
    const key = getEncryptionKey();
    const iv = Buffer.from(data.iv, "hex");
    const authTag = Buffer.from(data.authTag, "hex");
    const encrypted = Buffer.from(data.encrypted, "hex");
    if (iv.length !== 12) {
        throw new Error("Invalid AES-GCM IV.");
    }
    if (authTag.length !== 16) {
        throw new Error("Invalid AES-GCM authentication tag.");
    }
    const decipher = node_crypto_1.default.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);
    return decrypted.toString("utf8");
}
/* =========================================================
   HMAC LOOKUP
========================================================= */
/*
 * IMPORTANT
 *
 * The same normalization + hashing logic MUST be used by:
 *
 * - Payment source seed
 * - Payment source validation
 * - Payment service
 * - User email lookup
 * - User phone lookup
 *
 * Example:
 *
 * 01710000001
 *     ↓
 * normalizeLookupValue()
 *     ↓
 * createHmac("sha256", LOOKUP_HMAC_KEY)
 *     ↓
 * 64-character hex hash
 */
function createLookupHash(value) {
    if (typeof value !== "string") {
        throw new TypeError("Lookup value must be a string.");
    }
    const normalized = normalizeLookupValue(value);
    if (!normalized) {
        throw new Error("Cannot create lookup hash from an empty value.");
    }
    return node_crypto_1.default
        .createHmac("sha256", getLookupHmacKey())
        .update(normalized, "utf8")
        .digest("hex");
}
/* =========================================================
   NORMALIZE PHONE
========================================================= */
function normalizePhone(phone) {
    if (typeof phone !== "string") {
        return "";
    }
    return phone
        .replace(/\s+/g, "")
        .replace(/-/g, "")
        .trim();
}
/* =========================================================
   NORMALIZE EMAIL
========================================================= */
function normalizeEmail(email) {
    if (typeof email !== "string") {
        return "";
    }
    return email
        .trim()
        .toLowerCase();
}
/* =========================================================
   HASH SECRET CODE
========================================================= */
/*
 * Used by demo payment-source accounts.
 *
 * Never store the plain secret code in MongoDB.
 */
function hashSecretCode(value) {
    if (typeof value !== "string") {
        throw new TypeError("Secret code must be a string.");
    }
    const normalized = value.trim();
    if (!normalized) {
        throw new Error("Secret code cannot be empty.");
    }
    return node_crypto_1.default
        .createHmac("sha256", getLookupHmacKey())
        .update(normalized, "utf8")
        .digest("hex");
}
/* =========================================================
   SAFE HEX COMPARISON
========================================================= */
function safeEqualHex(leftValue, rightValue) {
    try {
        if (typeof leftValue !== "string" ||
            typeof rightValue !== "string") {
            return false;
        }
        const left = Buffer.from(leftValue, "hex");
        const right = Buffer.from(rightValue, "hex");
        if (left.length === 0 ||
            right.length === 0) {
            return false;
        }
        if (left.length !==
            right.length) {
            return false;
        }
        return node_crypto_1.default.timingSafeEqual(left, right);
    }
    catch {
        return false;
    }
}
