"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeEqualHash = exports.hashOtp = exports.generateEmailOtp = void 0;
const crypto_1 = __importDefault(require("crypto"));
/* =========================================================
   GENERATE OTP
========================================================= */
const generateEmailOtp = () => {
    return crypto_1.default
        .randomInt(100000, 1000000)
        .toString();
};
exports.generateEmailOtp = generateEmailOtp;
/* =========================================================
   HASH OTP
========================================================= */
const hashOtp = (otp) => {
    return crypto_1.default
        .createHmac("sha256", process.env.LOOKUP_HMAC_KEY ||
        process.env.JWT_SECRET ||
        "change-this-secret")
        .update(otp
        .trim())
        .digest("hex");
};
exports.hashOtp = hashOtp;
/* =========================================================
   SAFE COMPARE
========================================================= */
const safeEqualHash = (incomingHash, storedHash) => {
    try {
        const left = Buffer.from(incomingHash, "hex");
        const right = Buffer.from(storedHash, "hex");
        if (left.length !==
            right.length) {
            return false;
        }
        return crypto_1.default.timingSafeEqual(left, right);
    }
    catch {
        return false;
    }
};
exports.safeEqualHash = safeEqualHash;
