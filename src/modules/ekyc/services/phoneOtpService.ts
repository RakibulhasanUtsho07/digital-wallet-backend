import mongoose from "mongoose";
import { User } from "../../../models/User.js";
import {
  createLookupHash,
  decryptData,
  encryptData,
} from "../../../utils/crypto.js";
import { generateEmailOtp, hashOtp, safeEqualHash } from "../../../utils/otp.js";
import { sendTwoFactorSmsCode } from "../../../services/securityDeliveryService.js";
import { EKYCPhoneChallenge } from "../models/EKYCPhoneChallenge.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const VERIFIED_CHALLENGE_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export class PhoneOtpError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = "PhoneOtpError";
  }
}

export function normalizeBangladeshPhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, "");
  if (/^01[3-9]\d{8}$/.test(compact)) return `+88${compact}`;
  if (/^8801[3-9]\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+8801[3-9]\d{8}$/.test(compact)) return compact;
  throw new PhoneOtpError(
    "Enter a valid Bangladesh mobile number, for example +8801XXXXXXXXX.",
    "PHONE_INVALID"
  );
}

export function maskPhone(value: string): string {
  return `${value.slice(0, 6)}••••${value.slice(-3)}`;
}

async function sendOtpSms(phone: string, otp: string): Promise<void> {
  if (process.env.NODE_ENV !== "production" && process.env.EKYC_DEV_OTP_ENABLED === "true") {
    console.info("E-KYC development OTP issued", { phone: maskPhone(phone), otp });
    return;
  }
  try {
    await sendTwoFactorSmsCode({ phone, code: otp });
  } catch {
    throw new PhoneOtpError(
      "The SMS provider is temporarily unavailable.",
      "SMS_PROVIDER_UNAVAILABLE",
      503
    );
  }
}

export async function getUserKycPhone(userId: string): Promise<string> {
  const user = await User.findById(userId).select("+phoneEncrypted accountStatus").lean();
  if (!user || user.accountStatus === "deleted") {
    throw new PhoneOtpError("User account was not found.", "USER_NOT_FOUND", 404);
  }
  if (!user.phoneEncrypted) return "";
  return normalizeBangladeshPhone(decryptData(user.phoneEncrypted));
}

export async function requestPhoneOtp(userId: string, phoneInput: string): Promise<{
  challengeId: string;
  maskedPhone: string;
  expiresAt: string;
  resendAfterSeconds: number;
}> {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new PhoneOtpError("Invalid authenticated user.", "USER_INVALID", 401);
  }
  const phone = normalizeBangladeshPhone(phoneInput);
  const latest = await EKYCPhoneChallenge.findOne({ userId })
    .sort({ createdAt: -1 })
    .select("lastSentAt")
    .lean();
  if (latest) {
    const remaining = RESEND_COOLDOWN_MS - (Date.now() - latest.lastSentAt.getTime());
    if (remaining > 0) {
      throw new PhoneOtpError(
        `Please wait ${Math.ceil(remaining / 1000)} seconds before requesting another code.`,
        "OTP_RESEND_LIMIT",
        429
      );
    }
  }

  const otp = generateEmailOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const challenge = await EKYCPhoneChallenge.create({
    userId,
    phoneEncrypted: encryptData(phone),
    phoneLookup: createLookupHash(phone),
    otpHash: hashOtp(otp),
    attempts: 0,
    maxAttempts: 5,
    expiresAt,
    lastSentAt: new Date(),
  });

  try {
    await sendOtpSms(phone, otp);
  } catch (error) {
    await EKYCPhoneChallenge.deleteOne({ _id: challenge._id });
    throw error;
  }

  return {
    challengeId: challenge.id,
    maskedPhone: maskPhone(phone),
    expiresAt: expiresAt.toISOString(),
    resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
  };
}

export async function verifyPhoneOtp(input: {
  userId: string;
  challengeId: string;
  otp: string;
}): Promise<{ challengeId: string; phone: string; verifiedAt: string }> {
  if (!mongoose.Types.ObjectId.isValid(input.challengeId)) {
    throw new PhoneOtpError("Invalid OTP challenge.", "OTP_CHALLENGE_INVALID");
  }
  if (!/^\d{6}$/.test(input.otp)) {
    throw new PhoneOtpError("Enter the 6-digit verification code.", "OTP_INVALID");
  }

  const challenge = await EKYCPhoneChallenge.findOne({
    _id: input.challengeId,
    userId: input.userId,
  }).select("+phoneEncrypted +phoneLookup +otpHash attempts maxAttempts expiresAt verifiedAt consumedAt");

  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() <= Date.now()) {
    throw new PhoneOtpError("The verification code expired. Request a new code.", "OTP_EXPIRED");
  }
  if (challenge.verifiedAt) {
    const phone = decryptData(challenge.phoneEncrypted);
    return { challengeId: challenge.id, phone, verifiedAt: challenge.verifiedAt.toISOString() };
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    throw new PhoneOtpError("Too many incorrect attempts. Request a new code.", "OTP_ATTEMPTS_EXCEEDED", 429);
  }

  const incoming = hashOtp(input.otp);
  if (!safeEqualHash(incoming, challenge.otpHash)) {
    challenge.attempts += 1;
    await challenge.save();
    throw new PhoneOtpError("The verification code is incorrect.", "OTP_INCORRECT");
  }

  const duplicate = await User.exists({
    _id: { $ne: input.userId },
    phoneLookup: challenge.phoneLookup,
    accountStatus: { $ne: "deleted" },
  });
  if (duplicate) {
    throw new PhoneOtpError(
      "This phone number is already linked to another account.",
      "PHONE_ALREADY_IN_USE",
      409
    );
  }

  const verifiedAt = new Date();
  challenge.verifiedAt = verifiedAt;
  challenge.expiresAt = new Date(Date.now() + VERIFIED_CHALLENGE_TTL_MS);
  await challenge.save();
  await User.updateOne(
    { _id: input.userId, accountStatus: { $ne: "deleted" } },
    {
      $set: {
        phoneEncrypted: challenge.phoneEncrypted,
        phoneLookup: challenge.phoneLookup,
      },
    }
  );

  return {
    challengeId: challenge.id,
    phone: decryptData(challenge.phoneEncrypted),
    verifiedAt: verifiedAt.toISOString(),
  };
}

export async function assertVerifiedPhoneChallenge(userId: string, challengeId: string): Promise<{
  phone: string;
  verifiedAt: Date;
}> {
  if (!mongoose.Types.ObjectId.isValid(challengeId)) {
    throw new PhoneOtpError("Phone verification is required.", "PHONE_NOT_VERIFIED");
  }
  const challenge = await EKYCPhoneChallenge.findOne({
    _id: challengeId,
    userId,
    verifiedAt: { $type: "date" },
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).select("+phoneEncrypted verifiedAt");
  if (!challenge?.verifiedAt) {
    throw new PhoneOtpError("Verify your phone number before continuing.", "PHONE_NOT_VERIFIED");
  }
  return {
    phone: decryptData(challenge.phoneEncrypted),
    verifiedAt: challenge.verifiedAt,
  };
}

export async function consumeVerifiedPhoneChallenge(
  userId: string,
  challengeId: string
): Promise<void> {
  const result = await EKYCPhoneChallenge.updateOne(
    {
      _id: challengeId,
      userId,
      verifiedAt: { $type: "date" },
      consumedAt: { $exists: false },
    },
    { $set: { consumedAt: new Date() } }
  );
  if (result.modifiedCount !== 1) {
    throw new PhoneOtpError("Phone verification was already used or expired.", "PHONE_NOT_VERIFIED");
  }
}
