import mongoose from "mongoose";

import {
  User,
} from "../../../models/User.js";

import {
  createLookupHash,
  decryptData,
  encryptData,
} from "../../../utils/crypto.js";

import {
  generateEmailOtp,
  hashOtp,
  safeEqualHash,
} from "../../../utils/otp.js";

/*
 * Default import avoids the reported named-export resolution
 * error while the model still exports both forms.
 */
import EKYCPhoneChallenge from "../models/EKYCPhoneChallenge.js";
import { DescopeOtpProviderError, requestDescopeSmsOtp, verifyDescopeSmsOtp } from "./descopeOtpService.js";


const OTP_TTL_MS =
  5 * 60 * 1000;

const VERIFIED_CHALLENGE_TTL_MS =
  30 * 60 * 1000;

const RESEND_COOLDOWN_MS =
  60 * 1000;

const REQUEST_LIMIT_WINDOW_MS =
  24 * 60 * 60 * 1000;

const DEFAULT_MAX_DAILY_REQUESTS =
  3;

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

function getMaxDailyRequests(): number {
  const value =
    Number(
      process.env
        .EKYC_OTP_MAX_REQUESTS_PER_DAY
    );

  if (
    Number.isInteger(value) &&
    value > 0 &&
    value <= 20
  ) {
    return value;
  }

  return DEFAULT_MAX_DAILY_REQUESTS;
}

function isDevelopmentOtpEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.EKYC_DEV_OTP_ENABLED === "true"
  );
}

export function normalizeBangladeshPhone(
  value: string
): string {
  const compact =
    value.replace(
      /[\s()-]/g,
      ""
    );

  if (
    /^01[3-9]\d{8}$/.test(
      compact
    )
  ) {
    return `+88${compact}`;
  }

  if (
    /^8801[3-9]\d{8}$/.test(
      compact
    )
  ) {
    return `+${compact}`;
  }

  if (
    /^\+8801[3-9]\d{8}$/.test(
      compact
    )
  ) {
    return compact;
  }

  throw new PhoneOtpError(
    "Enter a valid Bangladesh mobile number, for example +8801XXXXXXXXX.",
    "PHONE_INVALID"
  );
}

export function maskPhone(
  value: string
): string {
  return `${value.slice(0, 6)}••••${value.slice(-3)}`;
}

type DescopeOtpErrorDetails = {
  providerCode?: string;
  reason?: string;
};

function getDescopeOtpErrorDetails(
  error: unknown
): DescopeOtpErrorDetails {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return {};
  }

  const record =
    error as Record<string, unknown>;

  return {
    providerCode:
      typeof record.providerCode === "string"
        ? record.providerCode
        : undefined,

    reason:
      typeof record.reason === "string"
        ? record.reason
        : undefined,
  };
}

function mapSendError(
  error: unknown
): PhoneOtpError {
  const details =
    getDescopeOtpErrorDetails(
      error
    );

  console.error(
    "Descope SMS request failed",
    {
      providerCode:
        details.providerCode,
      reason:
        details.reason,
    }
  );

  if (
    details.reason === "rate_limited"
  ) {
    return new PhoneOtpError(
      "Too many verification codes were requested. Please try again later.",
      "OTP_REQUEST_LIMIT",
      429
    );
  }

  if (
    details.reason === "invalid_phone"
  ) {
    return new PhoneOtpError(
      "The SMS provider rejected this phone number.",
      "PHONE_INVALID"
    );
  }

  return new PhoneOtpError(
    "The SMS provider is temporarily unavailable.",
    "SMS_PROVIDER_UNAVAILABLE",
    503
  );
}

export async function getUserKycPhone(
  userId: string
): Promise<string> {
  if (
    !mongoose.Types.ObjectId.isValid(
      userId
    )
  ) {
    throw new PhoneOtpError(
      "Invalid authenticated user.",
      "USER_INVALID",
      401
    );
  }

  const user =
    await User.findById(userId)
      .select(
        "+phoneEncrypted accountStatus"
      )
      .lean();

  if (
    !user ||
    user.accountStatus === "deleted"
  ) {
    throw new PhoneOtpError(
      "User account was not found.",
      "USER_NOT_FOUND",
      404
    );
  }

  if (!user.phoneEncrypted) {
    return "";
  }

  return normalizeBangladeshPhone(
    decryptData(
      user.phoneEncrypted
    )
  );
}

export async function requestPhoneOtp(
  userId: string,
  phoneInput: string
): Promise<{
  challengeId: string;
  maskedPhone: string;
  expiresAt: string;
  resendAfterSeconds: number;
}> {
  if (
    !mongoose.Types.ObjectId.isValid(
      userId
    )
  ) {
    throw new PhoneOtpError(
      "Invalid authenticated user.",
      "USER_INVALID",
      401
    );
  }

  const userExists =
    await User.exists({
      _id: userId,
      accountStatus: {
        $ne: "deleted",
      },
    });

  if (!userExists) {
    throw new PhoneOtpError(
      "User account was not found.",
      "USER_NOT_FOUND",
      404
    );
  }

  const phone =
    normalizeBangladeshPhone(
      phoneInput
    );

  const requestWindowStart =
    new Date(
      Date.now() -
        REQUEST_LIMIT_WINDOW_MS
    );

  const requestCount =
    await EKYCPhoneChallenge
      .countDocuments({
        userId,
        createdAt: {
          $gte: requestWindowStart,
        },
      });

  if (
    requestCount >=
    getMaxDailyRequests()
  ) {
    throw new PhoneOtpError(
      "You reached the daily phone verification limit. Please try again later.",
      "OTP_DAILY_LIMIT",
      429
    );
  }

  const latest =
    await EKYCPhoneChallenge
      .findOne({
        userId,
      })
      .sort({
        createdAt: -1,
      })
      .select(
        "lastSentAt"
      )
      .lean();

  if (latest) {
    const remaining =
      RESEND_COOLDOWN_MS -
      (Date.now() -
        latest.lastSentAt.getTime());

    if (remaining > 0) {
      throw new PhoneOtpError(
        `Please wait ${Math.ceil(
          remaining / 1000
        )} seconds before requesting another code.`,
        "OTP_RESEND_LIMIT",
        429
      );
    }
  }

  const developmentMode =
    isDevelopmentOtpEnabled();

  const developmentOtp =
    developmentMode
      ? generateEmailOtp()
      : undefined;

  const expiresAt =
    new Date(
      Date.now() +
        OTP_TTL_MS
    );

  const challenge =
    await EKYCPhoneChallenge.create({
      userId,

      phoneEncrypted:
        encryptData(phone),

      phoneLookup:
        createLookupHash(phone),

      provider:
        developmentMode
          ? "development"
          : "descope",

      otpHash:
        developmentOtp
          ? hashOtp(
              developmentOtp
            )
          : undefined,

      attempts: 0,
      maxAttempts: 5,
      expiresAt,
      lastSentAt: new Date(),
    });

  try {
    if (
      developmentMode &&
      developmentOtp
    ) {
      console.info(
        "E-KYC development OTP issued",
        {
          phone:
            maskPhone(phone),
          otp:
            developmentOtp,
        }
      );
    } else {
      await requestDescopeSmsOtp(
        phone
      );
    }
  } catch (error: unknown) {
    await EKYCPhoneChallenge.deleteOne({
      _id:
        challenge._id,
    });

    if (
      error instanceof
      DescopeOtpProviderError
    ) {
      throw mapSendError(
        error
      );
    }

    throw new PhoneOtpError(
      "The SMS provider is temporarily unavailable.",
      "SMS_PROVIDER_UNAVAILABLE",
      503
    );
  }

  await EKYCPhoneChallenge.updateMany(
    {
      _id: {
        $ne: challenge._id,
      },
      userId,
      verifiedAt: {
        $exists: false,
      },
      consumedAt: {
        $exists: false,
      },
    },
    {
      $set: {
        consumedAt:
          new Date(),
      },
    }
  );

  return {
    challengeId:
      challenge.id,
    maskedPhone:
      maskPhone(phone),
    expiresAt:
      expiresAt.toISOString(),
    resendAfterSeconds:
      RESEND_COOLDOWN_MS / 1000,
  };
}

export async function verifyPhoneOtp(
  input: {
    userId: string;
    challengeId: string;
    otp: string;
  }
): Promise<{
  challengeId: string;
  phone: string;
  verifiedAt: string;
}> {
  if (
    !mongoose.Types.ObjectId.isValid(
      input.userId
    )
  ) {
    throw new PhoneOtpError(
      "Invalid authenticated user.",
      "USER_INVALID",
      401
    );
  }

  if (
    !mongoose.Types.ObjectId.isValid(
      input.challengeId
    )
  ) {
    throw new PhoneOtpError(
      "Invalid OTP challenge.",
      "OTP_CHALLENGE_INVALID"
    );
  }

  if (
    !/^\d{6}$/.test(
      input.otp
    )
  ) {
    throw new PhoneOtpError(
      "Enter the 6-digit verification code.",
      "OTP_INVALID"
    );
  }

  const challenge =
    await EKYCPhoneChallenge
      .findOne({
        _id:
          input.challengeId,
        userId:
          input.userId,
      })
      .select(
        [
          "+phoneEncrypted",
          "+phoneLookup",
          "+otpHash",
          "provider",
          "attempts",
          "maxAttempts",
          "expiresAt",
          "verifiedAt",
          "consumedAt",
        ].join(" ")
      );

  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt.getTime() <=
      Date.now()
  ) {
    throw new PhoneOtpError(
      "The verification code expired. Request a new code.",
      "OTP_EXPIRED"
    );
  }

  if (challenge.verifiedAt) {
    return {
      challengeId:
        challenge.id,
      phone:
        decryptData(
          challenge.phoneEncrypted
        ),
      verifiedAt:
        challenge.verifiedAt
          .toISOString(),
    };
  }

  if (
    challenge.attempts >=
    challenge.maxAttempts
  ) {
    throw new PhoneOtpError(
      "Too many incorrect attempts. Request a new code.",
      "OTP_ATTEMPTS_EXCEEDED",
      429
    );
  }

  const phone =
    decryptData(
      challenge.phoneEncrypted
    );

  const provider =
    challenge.provider ||
    (challenge.otpHash
      ? "development"
      : "descope");

  if (
    provider === "development"
  ) {
    if (!challenge.otpHash) {
      throw new PhoneOtpError(
        "The verification code expired. Request a new code.",
        "OTP_EXPIRED"
      );
    }

    const incoming =
      hashOtp(
        input.otp
      );

    if (
      !safeEqualHash(
        incoming,
        challenge.otpHash
      )
    ) {
      challenge.attempts += 1;

      await challenge.save();

      if (
        challenge.attempts >=
        challenge.maxAttempts
      ) {
        throw new PhoneOtpError(
          "Too many incorrect attempts. Request a new code.",
          "OTP_ATTEMPTS_EXCEEDED",
          429
        );
      }

      throw new PhoneOtpError(
        "The verification code is incorrect.",
        "OTP_INCORRECT"
      );
    }
  } else {
    try {
      await verifyDescopeSmsOtp(
        phone,
        input.otp
      );
    } catch (error: unknown) {
      if (
        !(
          error instanceof
          DescopeOtpProviderError
        )
      ) {
        throw new PhoneOtpError(
          "The verification provider is temporarily unavailable.",
          "SMS_PROVIDER_UNAVAILABLE",
          503
        );
      }

      const providerError =
        getDescopeOtpErrorDetails(
          error
        );

      console.error(
        "Descope OTP verification failed",
        {
          providerCode:
            providerError.providerCode,
          reason:
            providerError.reason,
        }
      );

      if (
        providerError.reason ===
        "invalid_code"
      ) {
        challenge.attempts += 1;

        await challenge.save();

        if (
          challenge.attempts >=
          challenge.maxAttempts
        ) {
          throw new PhoneOtpError(
            "Too many incorrect attempts. Request a new code.",
            "OTP_ATTEMPTS_EXCEEDED",
            429
          );
        }

        throw new PhoneOtpError(
          "The verification code is incorrect.",
          "OTP_INCORRECT"
        );
      }

      if (
        providerError.reason ===
        "too_many_attempts"
      ) {
        challenge.attempts =
          challenge.maxAttempts;

        await challenge.save();

        throw new PhoneOtpError(
          "Too many incorrect attempts. Request a new code.",
          "OTP_ATTEMPTS_EXCEEDED",
          429
        );
      }

      if (
        providerError.reason ===
        "expired"
      ) {
        challenge.expiresAt =
          new Date();

        await challenge.save();

        throw new PhoneOtpError(
          "The verification code expired. Request a new code.",
          "OTP_EXPIRED"
        );
      }

      if (
        providerError.reason ===
        "rate_limited"
      ) {
        throw new PhoneOtpError(
          "Too many verification attempts. Please try again later.",
          "OTP_ATTEMPTS_EXCEEDED",
          429
        );
      }

      throw new PhoneOtpError(
        "The verification provider is temporarily unavailable.",
        "SMS_PROVIDER_UNAVAILABLE",
        503
      );
    }
  }

  const duplicate =
    await User.exists({
      _id: {
        $ne:
          input.userId,
      },
      phoneLookup:
        challenge.phoneLookup,
      accountStatus: {
        $ne: "deleted",
      },
    });

  if (duplicate) {
    throw new PhoneOtpError(
      "This phone number is already linked to another account.",
      "PHONE_ALREADY_IN_USE",
      409
    );
  }

  const verifiedAt =
    new Date();

  challenge.verifiedAt =
    verifiedAt;

  challenge.expiresAt =
    new Date(
      Date.now() +
        VERIFIED_CHALLENGE_TTL_MS
    );

  await challenge.save();

  const result =
    await User.updateOne(
      {
        _id:
          input.userId,
        accountStatus: {
          $ne: "deleted",
        },
      },
      {
        $set: {
          phoneEncrypted:
            challenge.phoneEncrypted,
          phoneLookup:
            challenge.phoneLookup,
        },
      }
    );

  if (
    result.matchedCount !== 1
  ) {
    throw new PhoneOtpError(
      "User account was not found.",
      "USER_NOT_FOUND",
      404
    );
  }

  return {
    challengeId:
      challenge.id,
    phone,
    verifiedAt:
      verifiedAt.toISOString(),
  };
}

export async function assertVerifiedPhoneChallenge(
  userId: string,
  challengeId: string
): Promise<{
  phone: string;
  verifiedAt: Date;
}> {
  if (
    !mongoose.Types.ObjectId.isValid(
      userId
    ) ||
    !mongoose.Types.ObjectId.isValid(
      challengeId
    )
  ) {
    throw new PhoneOtpError(
      "Phone verification is required.",
      "PHONE_NOT_VERIFIED"
    );
  }

  const challenge =
    await EKYCPhoneChallenge
      .findOne({
        _id:
          challengeId,
        userId,
        verifiedAt: {
          $type: "date",
        },
        consumedAt: {
          $exists: false,
        },
        expiresAt: {
          $gt:
            new Date(),
        },
      })
      .select(
        "+phoneEncrypted verifiedAt"
      );

  if (!challenge?.verifiedAt) {
    throw new PhoneOtpError(
      "Verify your phone number before continuing.",
      "PHONE_NOT_VERIFIED"
    );
  }

  return {
    phone:
      decryptData(
        challenge.phoneEncrypted
      ),
    verifiedAt:
      challenge.verifiedAt,
  };
}

export async function consumeVerifiedPhoneChallenge(
  userId: string,
  challengeId: string
): Promise<void> {
  const result =
    await EKYCPhoneChallenge
      .updateOne(
        {
          _id:
            challengeId,
          userId,
          verifiedAt: {
            $type: "date",
          },
          consumedAt: {
            $exists: false,
          },
          expiresAt: {
            $gt:
              new Date(),
          },
        },
        {
          $set: {
            consumedAt:
              new Date(),
          },
        }
      );

  if (
    result.modifiedCount !== 1
  ) {
    throw new PhoneOtpError(
      "Phone verification was already used or expired.",
      "PHONE_NOT_VERIFIED"
    );
  }
}