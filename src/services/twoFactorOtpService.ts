import crypto from "node:crypto";

import {
  TwoFactorChallenge,
} from "../models/TwoFactorChallenge.js";
import type {
  OtpTwoFactorMethod as TwoFactorMethod,
} from "../models/SecurityPreferences.js";
import {
  generateEmailOtp,
  hashOtp,
  safeEqualHash,
} from "../utils/otp.js";
import {
  getTwoFactorDeliveryAvailability,
  getTwoFactorSmsProvider,
  sendTwoFactorEmailCode,
  sendTwoFactorSmsCode,
  verifyTwoFactorSmsCode,
} from "./securityDeliveryService.js";

export type TwoFactorPurpose =
  | "login"
  | "setup"
  | "method_change";

const OTP_TTL_MS = 5 * 60 * 1000;

export class TwoFactorOtpError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = "TwoFactorOtpError";
  }
}

export function maskTwoFactorTarget(
  value: string
): string {
  if (!value) return "Not available";

  if (value.includes("@")) {
    const [name = "", domain = ""] =
      value.split("@");

    return `${name.slice(0, 2)}***@${domain}`;
  }

  return value.length > 4
    ? `***${value.slice(-4)}`
    : "***";
}

function getTarget({
  method,
  email,
  phone,
}: {
  method: TwoFactorMethod;
  email?: string;
  phone?: string;
}): string {
  const target =
    method === "email"
      ? email?.trim()
      : phone?.trim();

  if (!target) {
    throw new TwoFactorOtpError(
      method === "email"
        ? "No verified email is available for email 2FA."
        : "No verified phone number is available for SMS 2FA.",
      method === "email"
        ? "TWO_FACTOR_EMAIL_MISSING"
        : "TWO_FACTOR_PHONE_MISSING",
      409
    );
  }

  return target;
}

export async function requestTwoFactorOtp(input: {
  userId: string;
  purpose: TwoFactorPurpose;
  method: TwoFactorMethod;
  email?: string;
  phone?: string;
}): Promise<{
  challengeId: string;
  method: TwoFactorMethod;
  target: string;
  expiresAt: string;
  expiresInSeconds: number;
}> {
  const availability =
    getTwoFactorDeliveryAvailability();

  if (!availability[input.method]) {
    throw new TwoFactorOtpError(
      input.method === "email"
        ? "Email 2FA is not configured on the server."
        : "SMS 2FA is not configured on the server.",
      input.method === "email"
        ? "EMAIL_2FA_NOT_CONFIGURED"
        : "SMS_2FA_NOT_CONFIGURED",
      503
    );
  }

  const target = getTarget(input);
  const code = generateEmailOtp();
  const smsProvider =
    input.method === "sms"
      ? getTwoFactorSmsProvider()
      : null;
  const deliveryProvider =
    smsProvider === "descope"
      ? "descope"
      : "local";
  const challengeId =
    crypto.randomBytes(32).toString("hex");
  const expiresAt =
    new Date(Date.now() + OTP_TTL_MS);

  await TwoFactorChallenge.updateMany(
    {
      userId: input.userId,
      purpose: input.purpose,
      consumedAt: { $exists: false },
    },
    {
      $set: { consumedAt: new Date() },
    }
  );

  await TwoFactorChallenge.create({
    challengeId,
    userId: input.userId,
    purpose: input.purpose,
    method: input.method,
    deliveryProvider,
    codeHash:
      deliveryProvider === "local"
        ? hashOtp(code)
        : undefined,
    attempts: 0,
    maxAttempts: 5,
    expiresAt,
  });

  try {
    if (input.method === "email") {
      await sendTwoFactorEmailCode({
        email: target,
        code,
      });
    } else {
      await sendTwoFactorSmsCode({
        phone: target,
        code,
        provider:
          smsProvider || undefined,
      });
    }
  } catch (error) {
    await TwoFactorChallenge.deleteOne({
      challengeId,
    });
    throw error;
  }

  return {
    challengeId,
    method: input.method,
    target: maskTwoFactorTarget(target),
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds:
      Math.floor(OTP_TTL_MS / 1000),
  };
}

export async function verifyTwoFactorOtp(input: {
  userId?: string;
  challengeId: string;
  purpose: TwoFactorPurpose;
  code: string;
  email?: string;
  phone?: string;
}): Promise<{
  userId: string;
  method: TwoFactorMethod;
}> {
  const code = input.code.trim();

  if (!/^\d{6}$/.test(code)) {
    throw new TwoFactorOtpError(
      "Enter the 6-digit verification code.",
      "TWO_FACTOR_CODE_INVALID"
    );
  }

  const challenge =
    await TwoFactorChallenge.findOne({
      challengeId: input.challengeId,
      purpose: input.purpose,
      ...(input.userId
        ? { userId: input.userId }
        : {}),
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }).select("+codeHash");

  if (!challenge) {
    throw new TwoFactorOtpError(
      "The verification challenge is invalid or expired.",
      "TWO_FACTOR_CHALLENGE_EXPIRED"
    );
  }

  if (
    challenge.attempts >=
    challenge.maxAttempts
  ) {
    throw new TwoFactorOtpError(
      "Too many invalid attempts. Request a new code.",
      "TWO_FACTOR_ATTEMPTS_EXCEEDED",
      429
    );
  }

  let verified = false;

  if (
    challenge.method === "sms" &&
    challenge.deliveryProvider === "descope"
  ) {
    const phone = getTarget({
      method: "sms",
      phone: input.phone,
    });

    verified = await verifyTwoFactorSmsCode({
      phone,
      code,
      provider: "descope",
    });
  } else {
    const storedHash =
      challenge.get("codeHash") as
        | string
        | undefined;

    verified = Boolean(
      storedHash &&
        safeEqualHash(
          hashOtp(code),
          storedHash
        )
    );
  }

  if (!verified) {
    challenge.attempts += 1;

    if (
      challenge.attempts >=
      challenge.maxAttempts
    ) {
      challenge.consumedAt = new Date();
    }

    await challenge.save();

    throw new TwoFactorOtpError(
      "The verification code is incorrect.",
      "TWO_FACTOR_CODE_INCORRECT",
      401
    );
  }

  challenge.consumedAt = new Date();
  await challenge.save();

  return {
    userId: challenge.userId.toString(),
    method: challenge.method,
  };
}
