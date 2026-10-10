import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import {
  Types,
} from "mongoose";

import {
  EKYCPhoneChallenge,
} from "../models/EKYCPhoneChallenge.js";

import {
  getSmsProvider,
  SmsProviderError,
} from "../providers/SmsProvider.js";

import {
  getWhatsAppOtpProvider,
  WhatsAppOtpProviderError,
} from "../providers/WhatsAppOtpProvider.js";

/* =========================================================
   TYPES
========================================================= */

export type PhoneOtpChannel =
  | "sms"
  | "whatsapp";

export type PhoneOtpErrorCode =
  | "PHONE_INVALID"
  | "OTP_COOLDOWN"
  | "OTP_DAILY_LIMIT"
  | "OTP_DELIVERY_FAILED"
  | "OTP_CHALLENGE_NOT_FOUND"
  | "OTP_EXPIRED"
  | "OTP_INVALID"
  | "OTP_ATTEMPTS_EXCEEDED"
  | "OTP_ALREADY_USED"
  | "OTP_NOT_VERIFIED"
  | "OTP_VERIFICATION_EXPIRED";

export class PhoneOtpError extends Error {
  constructor(
    message: string,
    readonly code: PhoneOtpErrorCode,
    readonly statusCode: number
  ) {
    super(message);

    this.name =
      "PhoneOtpError";

    Object.setPrototypeOf(
      this,
      new.target.prototype
    );
  }
}

export type PhoneOtpChallengeResponse = {
  id: string;
  challengeId: string;
  channel: PhoneOtpChannel;
  provider: string;
  maskedPhone: string;
  expiresAt: string;
  resendAvailableAt: string;
  resendAfterSeconds: number;
};

export type PhoneOtpVerificationResponse = {
  challengeId: string;
  verified: true;
  phone: string;
  maskedPhone: string;
  channel: PhoneOtpChannel;
  verifiedAt: string;
  validUntil: string;
};

export type VerifiedPhoneChallenge = {
  challengeId: string;
  phone: string;
  channel: PhoneOtpChannel;
  verifiedAt: Date;
  verifiedUntil: Date;
};

/* =========================================================
   CONFIG
========================================================= */

function boundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw =
    Number(
      process.env[name] ??
        fallback
    );

  if (
    !Number.isFinite(raw)
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.trunc(raw)
    )
  );
}

function otpTtlMs() {
  return (
    boundedInteger(
      "EKYC_OTP_TTL_SECONDS",
      300,
      120,
      600
    ) * 1000
  );
}

function verificationTtlMs() {
  return (
    boundedInteger(
      "EKYC_PHONE_VERIFICATION_TTL_SECONDS",
      1800,
      300,
      7200
    ) * 1000
  );
}

function resendCooldownMs() {
  return (
    boundedInteger(
      "EKYC_OTP_RESEND_COOLDOWN_SECONDS",
      60,
      30,
      300
    ) * 1000
  );
}

function maxAttempts() {
  return boundedInteger(
    "EKYC_OTP_MAX_ATTEMPTS",
    5,
    3,
    10
  );
}

function dailyRequestLimit() {
  return boundedInteger(
    "EKYC_OTP_DAILY_REQUEST_LIMIT",
    10,
    3,
    50
  );
}

function challengeRetentionMs() {
  return (
    boundedInteger(
      "EKYC_PHONE_CHALLENGE_RETENTION_HOURS",
      24,
      2,
      168
    ) *
    60 *
    60 *
    1000
  );
}

function requiredSecret(
  name: string,
  minLength = 32
): string {
  const value =
    process.env[name]?.trim();

  if (
    !value ||
    value.length <
      minLength
  ) {
    throw new PhoneOtpError(
      `${name} is not configured securely.`,
      "OTP_DELIVERY_FAILED",
      500
    );
  }

  return value;
}

function encryptionKey(): Buffer {
  const value =
    process.env
      .EKYC_PHONE_ENCRYPTION_KEY
      ?.trim();

  if (!value) {
    throw new PhoneOtpError(
      "EKYC_PHONE_ENCRYPTION_KEY is not configured.",
      "OTP_DELIVERY_FAILED",
      500
    );
  }

  let key:
    Buffer;

  if (
    /^[a-fA-F0-9]{64}$/.test(
      value
    )
  ) {
    key =
      Buffer.from(
        value,
        "hex"
      );
  } else {
    key =
      Buffer.from(
        value,
        "base64"
      );
  }

  if (
    key.length !== 32
  ) {
    throw new PhoneOtpError(
      "EKYC_PHONE_ENCRYPTION_KEY must decode to exactly 32 bytes.",
      "OTP_DELIVERY_FAILED",
      500
    );
  }

  return key;
}

/* =========================================================
   PHONE NORMALIZATION
========================================================= */

export function normalizeBangladeshPhone(
  input: string
): string {
  const compact =
    input
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );

  let normalized =
    compact;

  if (
    /^01[3-9]\d{8}$/.test(
      normalized
    )
  ) {
    normalized =
      `+88${normalized}`;
  } else if (
    /^8801[3-9]\d{8}$/.test(
      normalized
    )
  ) {
    normalized =
      `+${normalized}`;
  }

  if (
    !/^\+8801[3-9]\d{8}$/.test(
      normalized
    )
  ) {
    throw new PhoneOtpError(
      "Enter a valid Bangladesh mobile number.",
      "PHONE_INVALID",
      400
    );
  }

  return normalized;
}

function maskPhone(
  phone: string
): string {
  if (
    phone.length < 8
  ) {
    return phone;
  }

  return `${phone.slice(
    0,
    6
  )}•••••${phone.slice(
    -3
  )}`;
}

/* =========================================================
   CRYPTO
========================================================= */

function phoneLookupHash(
  phone: string
): string {
  return createHmac(
    "sha256",
    requiredSecret(
      "EKYC_PHONE_LOOKUP_SECRET"
    )
  )
    .update(phone)
    .digest("hex");
}

function otpHash(
  challengeId: string,
  otp: string
): string {
  return createHmac(
    "sha256",
    requiredSecret(
      "EKYC_OTP_HASH_SECRET"
    )
  )
    .update(
      `${challengeId}:${otp}`
    )
    .digest("hex");
}

function secureEqualHex(
  first: string,
  second: string
): boolean {
  try {
    const a =
      Buffer.from(
        first,
        "hex"
      );

    const b =
      Buffer.from(
        second,
        "hex"
      );

    return (
      a.length ===
        b.length &&
      timingSafeEqual(
        a,
        b
      )
    );
  } catch {
    return false;
  }
}

function encryptPhone(
  phone: string
) {
  const iv =
    randomBytes(12);

  const cipher =
    createCipheriv(
      "aes-256-gcm",
      encryptionKey(),
      iv
    );

  const ciphertext =
    Buffer.concat([
      cipher.update(
        phone,
        "utf8"
      ),

      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  return {
    phoneCiphertext:
      ciphertext.toString(
        "base64"
      ),

    phoneIv:
      iv.toString(
        "base64"
      ),

    phoneAuthTag:
      authTag.toString(
        "base64"
      ),
  };
}

function decryptPhone(
  value: {
    phoneCiphertext:
      string;

    phoneIv:
      string;

    phoneAuthTag:
      string;
  }
): string {
  const decipher =
    createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(
        value.phoneIv,
        "base64"
      )
    );

  decipher.setAuthTag(
    Buffer.from(
      value.phoneAuthTag,
      "base64"
    )
  );

  const plaintext =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          value.phoneCiphertext,
          "base64"
        )
      ),

      decipher.final(),
    ]);

  return plaintext.toString(
    "utf8"
  );
}

function generateOtp(): string {
  return randomInt(
    0,
    1_000_000
  )
    .toString()
    .padStart(
      6,
      "0"
    );
}
function buildOtpMessage(
  otp: string
): string {
  return `Your Coffer verification code is ${otp}. This code is valid for 5 minutes. Do not share this code.`;
}
/* =========================================================
   REQUEST OTP
========================================================= */

export async function requestPhoneOtp(
  userId: string,
  phone: string,
  channel: PhoneOtpChannel = "sms"
): Promise<PhoneOtpChallengeResponse> {
  if (
    channel !== "sms" &&
    channel !== "whatsapp"
  ) {
    throw new PhoneOtpError(
      "Unsupported OTP delivery channel.",
      "OTP_DELIVERY_FAILED",
      400
    );
  }
  if (
    !Types.ObjectId.isValid(
      userId
    )
  ) {
    throw new PhoneOtpError(
      "Authenticated user is invalid.",
      "OTP_DELIVERY_FAILED",
      500
    );
  }

  const normalizedPhone =
    normalizeBangladeshPhone(
      phone
    );

  const phoneHash =
    phoneLookupHash(
      normalizedPhone
    );

  const now =
    new Date();

  const latest =
    await EKYCPhoneChallenge.findOne(
      {
        userId:
          new Types.ObjectId(
            userId
          ),

        phoneLookupHash:
          phoneHash,

        // A provider failure must not force the user to wait
        // before retrying the delivery.
        status: {
          $ne:
            "DELIVERY_FAILED",
        },
      }
    )
      .sort({
        createdAt: -1,
      })
      .select(
        "+phoneLookupHash resendAvailableAt createdAt status"
      )
      .lean();

  if (
    latest &&
    latest.resendAvailableAt >
      now
  ) {
    const remaining =
      Math.max(
        1,
        Math.ceil(
          (
            latest.resendAvailableAt.getTime() -
            now.getTime()
          ) /
            1000
        )
      );

    throw new PhoneOtpError(
      `Please wait ${remaining} seconds before requesting another code.`,
      "OTP_COOLDOWN",
      429
    );
  }

  const rollingDay =
    new Date(
      now.getTime() -
        24 *
          60 *
          60 *
          1000
    );

  const requestsToday =
    await EKYCPhoneChallenge.countDocuments(
      {
        $or: [
          {
            userId:
              new Types.ObjectId(
                userId
              ),
          },

          {
            phoneLookupHash:
              phoneHash,
          },
        ],

        status: {
          $ne:
            "DELIVERY_FAILED",
        },

        createdAt: {
          $gte:
            rollingDay,
        },
      }
    );

  if (
    requestsToday >=
    dailyRequestLimit()
  ) {
    throw new PhoneOtpError(
      "The daily phone verification limit has been reached. Please try again later.",
      "OTP_DAILY_LIMIT",
      429
    );
  }

  const challengeId =
    new Types.ObjectId();

  const otp =
    generateOtp();

  const otpExpiresAt =
    new Date(
      now.getTime() +
        otpTtlMs()
    );

  const resendAvailableAt =
    new Date(
      now.getTime() +
        resendCooldownMs()
    );

  const deleteAt =
    new Date(
      now.getTime() +
        challengeRetentionMs()
    );

  const encrypted =
    encryptPhone(
      normalizedPhone
    );

  const challenge =
    await EKYCPhoneChallenge.create(
      {
        _id:
          challengeId,

        userId:
          new Types.ObjectId(
            userId
          ),

        ...encrypted,

        phoneLookupHash:
          phoneHash,

        otpHash:
          otpHash(
            challengeId.toString(),
            otp
          ),

        channel,

        status:
          "PENDING",

        attempts: 0,

        maxAttempts:
          maxAttempts(),

        otpExpiresAt,

        resendAvailableAt,

        provider:
          channel ===
          "whatsapp"
            ? "whatsapp_cloud"
            : (
                process.env
                  .SMS_PROVIDER ??
                "smsbd"
              )
                .trim()
                .toLowerCase(),

        deleteAt,
      }
    );

  let deliveryProvider =
    channel ===
    "whatsapp"
      ? "whatsapp_cloud"
      : (
          process.env
            .SMS_PROVIDER ??
          "smsbd"
        )
          .trim()
          .toLowerCase();

  try {
    const result =
      channel ===
      "whatsapp"
        ? await getWhatsAppOtpProvider().send(
            {
              to:
                normalizedPhone,

              otp,
            }
          )
        : await (
            await getSmsProvider()
          ).send(
            {
              to:
                normalizedPhone,

              message:
                buildOtpMessage(
                  otp
                ),
            }
          );

    deliveryProvider =
      result.provider;

    await EKYCPhoneChallenge.updateOne(
      {
        _id:
          challenge._id,
      },
      {
        $set: {
          provider:
            result.provider,

          ...(result.requestId
            ? {
                providerRequestId:
                  result.requestId,
              }
            : {}),
        },
      }
    );
  } catch (
    error: unknown
  ) {
    await EKYCPhoneChallenge.updateOne(
      {
        _id:
          challenge._id,

        status:
          "PENDING",
      },
      {
        $set: {
          status:
            "DELIVERY_FAILED",
        },

        $unset: {
          otpHash: 1,
        },
      }
    ).catch(
      () =>
        undefined
    );

    if (
      error instanceof
        SmsProviderError ||
      error instanceof
        WhatsAppOtpProviderError
    ) {
      const providerError =
        error as
          | SmsProviderError
          | WhatsAppOtpProviderError;

      const invalidPhone =
        providerError.reason ===
        "invalid_phone";

      const safeMessage =
        invalidPhone
          ? "The selected verification provider rejected this phone number."
          : channel ===
              "whatsapp"
            ? "Unable to send the verification code on WhatsApp right now. Check the Meta test recipient/template configuration and try again."
            : providerError.reason ===
                "insufficient_balance"
              ? "SMS balance is insufficient. Recharge the SMS account and try again."
              : providerError.reason ===
                  "configuration"
                ? "The SMS provider is not configured or approved correctly."
                : providerError.reason ===
                    "rate_limited"
                  ? "The SMS provider is temporarily rate-limiting requests. Please try again shortly."
                  : providerError.reason ===
                      "rejected"
                    ? "The SMS provider rejected this message. Check the approved sender ID and message template."
                    : "Unable to send the verification SMS right now. Please try again later.";

      throw new PhoneOtpError(
        safeMessage,
        invalidPhone
          ? "PHONE_INVALID"
          : "OTP_DELIVERY_FAILED",
        invalidPhone
          ? 400
          : providerError.statusCode ===
              429
            ? 429
            : 503
      );
    }

    throw new PhoneOtpError(
      channel ===
        "whatsapp"
        ? "Unable to send the verification code on WhatsApp right now. Please try again later."
        : "Unable to send the verification SMS right now. Please try again later.",
      "OTP_DELIVERY_FAILED",
      503
    );
  }

  return {
    id:
      challengeId.toString(),

    challengeId:
      challengeId.toString(),

    channel,

    provider:
      deliveryProvider,

    maskedPhone:
      maskPhone(
        normalizedPhone
      ),

    expiresAt:
      otpExpiresAt.toISOString(),

    resendAvailableAt:
      resendAvailableAt.toISOString(),

    resendAfterSeconds:
      Math.max(
        0,
        Math.ceil(
          (
            resendAvailableAt.getTime() -
            Date.now()
          ) /
            1000
        )
      ),
  };
}

/* =========================================================
   VERIFY OTP
========================================================= */

export async function verifyPhoneOtp(
  input: {
    userId: string;
    challengeId: string;
    otp: string;
  }
): Promise<PhoneOtpVerificationResponse> {
  const normalizedOtp =
    input.otp.trim();

  if (
    !/^\d{6}$/.test(
      normalizedOtp
    )
  ) {
    throw new PhoneOtpError(
      "Enter the 6-digit verification code.",
      "OTP_INVALID",
      400
    );
  }

  if (
    !Types.ObjectId.isValid(
      input.userId
    ) ||
    !Types.ObjectId.isValid(
      input.challengeId
    )
  ) {
    throw new PhoneOtpError(
      "Phone verification challenge was not found.",
      "OTP_CHALLENGE_NOT_FOUND",
      404
    );
  }

  const userObjectId =
    new Types.ObjectId(
      input.userId
    );

  const challengeObjectId =
    new Types.ObjectId(
      input.challengeId
    );

  const selectFields =
    "+otpHash +phoneCiphertext +phoneIv +phoneAuthTag channel status attempts maxAttempts otpExpiresAt verifiedAt verifiedUntil";

  const readChallenge =
    () =>
      EKYCPhoneChallenge.findOne({
        _id:
          challengeObjectId,

        userId:
          userObjectId,
      }).select(
        selectFields
      );

  const toSuccessResponse =
    (
      value: {
        _id: Types.ObjectId;
        phoneCiphertext: string;
        phoneIv: string;
        phoneAuthTag: string;
        channel?: string;
        verifiedAt?: Date;
        verifiedUntil?: Date;
      }
    ): PhoneOtpVerificationResponse => {
      if (
        !value.verifiedAt ||
        !value.verifiedUntil
      ) {
        throw new PhoneOtpError(
          "Phone verification state is incomplete. Request a new code.",
          "OTP_CHALLENGE_NOT_FOUND",
          409
        );
      }

      const phone =
        decryptPhone(
          value
        );

      return {
        challengeId:
          value._id.toString(),

        verified:
          true,

        phone,

        maskedPhone:
          maskPhone(
            phone
          ),

        channel:
          value.channel ===
            "whatsapp"
            ? "whatsapp"
            : "sms",

        verifiedAt:
          value.verifiedAt.toISOString(),

        validUntil:
          value.verifiedUntil.toISOString(),
      };
    };

  const challenge =
    await readChallenge();

  if (!challenge) {
    throw new PhoneOtpError(
      "Phone verification challenge was not found.",
      "OTP_CHALLENGE_NOT_FOUND",
      404
    );
  }

  const now =
    new Date();

  /*
   * Idempotent success:
   * if this challenge was already verified by an earlier request,
   * return the same successful verification result.
   */
  if (
    challenge.status ===
      "VERIFIED"
  ) {
    if (
      challenge.verifiedAt &&
      challenge.verifiedUntil &&
      challenge.verifiedUntil >
        now
    ) {
      return toSuccessResponse(
        challenge
      );
    }

    throw new PhoneOtpError(
      "Phone verification has expired. Request a new code.",
      "OTP_VERIFICATION_EXPIRED",
      410
    );
  }

  if (
    challenge.status ===
    "DELIVERY_FAILED"
  ) {
    throw new PhoneOtpError(
      "This verification code was not delivered. Request a new code.",
      "OTP_CHALLENGE_NOT_FOUND",
      409
    );
  }

  if (
    challenge.status ===
    "CONSUMED"
  ) {
    throw new PhoneOtpError(
      "This phone verification has already been used.",
      "OTP_ALREADY_USED",
      409
    );
  }

  if (
    challenge.status ===
      "LOCKED" ||
    challenge.attempts >=
      challenge.maxAttempts
  ) {
    throw new PhoneOtpError(
      "Too many incorrect verification attempts. Request a new code.",
      "OTP_ATTEMPTS_EXCEEDED",
      429
    );
  }

  /*
   * A fresh challenge must have a real Date here.
   * If it does not, the model/schema and service are out of sync.
   */
  if (
    !challenge.otpExpiresAt ||
    Number.isNaN(
      challenge.otpExpiresAt.getTime()
    )
  ) {
    throw new PhoneOtpError(
      "The phone verification challenge is invalid. Request a new code.",
      "OTP_CHALLENGE_NOT_FOUND",
      409
    );
  }

  if (
    challenge.otpExpiresAt <=
    now
  ) {
    throw new PhoneOtpError(
      "The verification code has expired. Request a new code.",
      "OTP_EXPIRED",
      410
    );
  }

  const expected =
    challenge.otpHash;

  const submitted =
    otpHash(
      challenge._id.toString(),
      normalizedOtp
    );

  if (
    !expected ||
    !secureEqualHex(
      expected,
      submitted
    )
  ) {
    /*
     * Increment attempts atomically against the still-pending challenge.
     * We deliberately re-read after the increment so the lock decision
     * uses the value actually stored in MongoDB.
     */
    await EKYCPhoneChallenge.updateOne(
      {
        _id:
          challenge._id,

        userId:
          challenge.userId,

        status:
          "PENDING",
      },
      {
        $inc: {
          attempts: 1,
        },
      }
    );

    const afterAttempt =
      await readChallenge();

    const attempts =
      afterAttempt?.attempts ??
      challenge.attempts + 1;

    const limit =
      afterAttempt?.maxAttempts ??
      challenge.maxAttempts;

    if (
      attempts >=
      limit
    ) {
      await EKYCPhoneChallenge.updateOne(
        {
          _id:
            challengeObjectId,

          userId:
            userObjectId,

          status:
            "PENDING",
        },
        {
          $set: {
            status:
              "LOCKED",
          },
        }
      );

      throw new PhoneOtpError(
        "Too many incorrect verification attempts. Request a new code.",
        "OTP_ATTEMPTS_EXCEEDED",
        429
      );
    }

    throw new PhoneOtpError(
      "The verification code is incorrect.",
      "OTP_INVALID",
      400
    );
  }

  const verifiedAt =
    now;

  const verifiedUntil =
    new Date(
      now.getTime() +
        verificationTtlMs()
    );

  /*
   * IMPORTANT:
   *
   * OTP expiry was already validated above using the same `now`.
   * Do not put otpExpiresAt back into this transition query.
   *
   * The only state condition required for the write is PENDING.
   * Repeating otpExpiresAt here caused the false
   * OTP_CHALLENGE_NOT_FOUND / "state changed" conflict.
   */
  let updated =
    await EKYCPhoneChallenge.findOneAndUpdate(
      {
        _id:
          challengeObjectId,

        userId:
          userObjectId,

        status:
          "PENDING",
      },
      {
        $set: {
          status:
            "VERIFIED",

          verifiedAt,

          verifiedUntil,
        },

        $unset: {
          otpHash: 1,
        },
      },
      {
        new: true,
      }
    ).select(
      "+phoneCiphertext +phoneIv +phoneAuthTag channel status verifiedAt verifiedUntil"
    );

  if (!updated) {
    /*
     * A simultaneous request may have completed the same transition.
     * Re-read the canonical state and make this endpoint idempotent.
     */
    const latest =
      await readChallenge();

    if (!latest) {
      throw new PhoneOtpError(
        "Phone verification challenge was not found.",
        "OTP_CHALLENGE_NOT_FOUND",
        404
      );
    }

    if (
      latest.status ===
        "VERIFIED" &&
      latest.verifiedAt &&
      latest.verifiedUntil &&
      latest.verifiedUntil >
        now
    ) {
      return toSuccessResponse(
        latest
      );
    }

    if (
      latest.status ===
      "CONSUMED"
    ) {
      throw new PhoneOtpError(
        "This phone verification has already been used.",
        "OTP_ALREADY_USED",
        409
      );
    }

    if (
      latest.status ===
      "LOCKED"
    ) {
      throw new PhoneOtpError(
        "Too many incorrect verification attempts. Request a new code.",
        "OTP_ATTEMPTS_EXCEEDED",
        429
      );
    }

    if (
      latest.status ===
      "DELIVERY_FAILED"
    ) {
      throw new PhoneOtpError(
        "This verification code was not delivered. Request a new code.",
        "OTP_CHALLENGE_NOT_FOUND",
        409
      );
    }

    if (
      latest.otpExpiresAt &&
      latest.otpExpiresAt <=
        now
    ) {
      throw new PhoneOtpError(
        "The verification code has expired. Request a new code.",
        "OTP_EXPIRED",
        410
      );
    }

    /*
     * If Mongo still reports the challenge as PENDING, retry the
     * transition once. This protects against a transient state race
     * without sending another OTP or accepting a different code.
     */
    if (
      latest.status ===
      "PENDING"
    ) {
      updated =
        await EKYCPhoneChallenge.findOneAndUpdate(
          {
            _id:
              challengeObjectId,

            userId:
              userObjectId,

            status:
              "PENDING",
          },
          {
            $set: {
              status:
                "VERIFIED",

              verifiedAt,

              verifiedUntil,
            },

            $unset: {
              otpHash: 1,
            },
          },
          {
            new: true,
          }
        ).select(
          "+phoneCiphertext +phoneIv +phoneAuthTag channel status verifiedAt verifiedUntil"
        );

      if (updated) {
        return toSuccessResponse(
          updated
        );
      }
    }

    if (
      process.env.NODE_ENV !==
      "production"
    ) {
      console.warn(
        "[eKYC OTP] verification transition could not be finalized",
        {
          challengeSuffix:
            input.challengeId.slice(
              -6
            ),

          status:
            latest.status,

          hasVerifiedAt:
            Boolean(
              latest.verifiedAt
            ),

          hasVerifiedUntil:
            Boolean(
              latest.verifiedUntil
            ),
        }
      );
    }

    throw new PhoneOtpError(
      "Unable to finalize phone verification. Request a new code.",
      "OTP_CHALLENGE_NOT_FOUND",
      409
    );
  }

  return toSuccessResponse(
    updated
  );
}


/* =========================================================
   ASSERT VERIFIED CHALLENGE
========================================================= */

export async function assertVerifiedPhoneChallenge(
  userId: string,
  challengeId: string
): Promise<VerifiedPhoneChallenge> {
  if (
    !Types.ObjectId.isValid(
      userId
    ) ||
    !Types.ObjectId.isValid(
      challengeId
    )
  ) {
    throw new PhoneOtpError(
      "A verified phone challenge is required.",
      "OTP_NOT_VERIFIED",
      409
    );
  }

  const now =
    new Date();

  const challenge =
    await EKYCPhoneChallenge.findOne(
      {
        _id:
          new Types.ObjectId(
            challengeId
          ),

        userId:
          new Types.ObjectId(
            userId
          ),

        status:
          "VERIFIED",
      }
    )
      .select(
        "+phoneCiphertext +phoneIv +phoneAuthTag channel verifiedAt verifiedUntil"
      )
      .lean();

  if (!challenge) {
    throw new PhoneOtpError(
      "The phone number has not been verified.",
      "OTP_NOT_VERIFIED",
      409
    );
  }

  if (
    !challenge.verifiedAt ||
    !challenge.verifiedUntil ||
    challenge.verifiedUntil <=
      now
  ) {
    throw new PhoneOtpError(
      "Phone verification has expired. Verify the phone number again.",
      "OTP_VERIFICATION_EXPIRED",
      410
    );
  }

  return {
    challengeId:
      String(
        challenge._id
      ),

    phone:
      decryptPhone(
        challenge
      ),

    channel:
      challenge.channel ===
        "whatsapp"
        ? "whatsapp"
        : "sms",

    verifiedAt:
      challenge.verifiedAt,

    verifiedUntil:
      challenge.verifiedUntil,
  };
}

/* =========================================================
   CONSUME VERIFIED CHALLENGE
========================================================= */

export async function consumeVerifiedPhoneChallenge(
  userId: string,
  challengeId: string
): Promise<void> {
  if (
    !Types.ObjectId.isValid(
      userId
    ) ||
    !Types.ObjectId.isValid(
      challengeId
    )
  ) {
    throw new PhoneOtpError(
      "A verified phone challenge is required.",
      "OTP_NOT_VERIFIED",
      409
    );
  }

  const now =
    new Date();

  const result =
    await EKYCPhoneChallenge.findOneAndUpdate(
      {
        _id:
          new Types.ObjectId(
            challengeId
          ),

        userId:
          new Types.ObjectId(
            userId
          ),

        status:
          "VERIFIED",

        verifiedUntil: {
          $gt:
            now,
        },
      },
      {
        $set: {
          status:
            "CONSUMED",

          consumedAt:
            now,
        },
      },
      {
        new: true,
      }
    );

  if (!result) {
    throw new PhoneOtpError(
      "The verified phone challenge is unavailable or has expired.",
      "OTP_VERIFICATION_EXPIRED",
      410
    );
  }
}

/* =========================================================
   GET USER KYC PHONE
========================================================= */

export async function getUserKycPhone(
  userId: string
): Promise<string | null> {
  if (
    !Types.ObjectId.isValid(
      userId
    )
  ) {
    return null;
  }

  const latest =
    await EKYCPhoneChallenge.findOne(
      {
        userId:
          new Types.ObjectId(
            userId
          ),

        status: {
          $in: [
            "VERIFIED",
            "CONSUMED",
          ],
        },
      }
    )
      .sort({
        verifiedAt: -1,
      })
      .select(
        "+phoneCiphertext +phoneIv +phoneAuthTag"
      )
      .lean();

  if (!latest) {
    return null;
  }

  return decryptPhone(
    latest
  );
}
