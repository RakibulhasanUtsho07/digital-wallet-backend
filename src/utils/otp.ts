import crypto from "crypto";

/* =========================================================
   GENERATE OTP
========================================================= */

export const generateEmailOtp =
  (): string => {
    return crypto
      .randomInt(
        100000,
        1000000
      )
      .toString();
  };

/* =========================================================
   HASH OTP
========================================================= */

export const hashOtp = (
  otp: string
): string => {
  return crypto
    .createHmac(
      "sha256",
      process.env.LOOKUP_HMAC_KEY ||
        process.env.JWT_SECRET ||
        "change-this-secret"
    )
    .update(
      otp
        .trim()
    )
    .digest("hex");
};

/* =========================================================
   SAFE COMPARE
========================================================= */

export const safeEqualHash = (
  incomingHash: string,
  storedHash: string
): boolean => {
  try {
    const left =
      Buffer.from(
        incomingHash,
        "hex"
      );

    const right =
      Buffer.from(
        storedHash,
        "hex"
      );

    if (
      left.length !==
      right.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      left,
      right
    );
  } catch {
    return false;
  }
};