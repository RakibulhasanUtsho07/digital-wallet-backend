import crypto from "node:crypto";

import jwt, {
  type JwtPayload,
} from "jsonwebtoken";

import {
  Payment,
  type PaymentMode,
} from "../models/Payment.js";

import {
  User,
} from "../models/User.js";

import {
  KYC,
} from "../models/KYC.js";

import {
  CheckoutVerificationChallenge,
  type CheckoutVerificationChannel,
} from "../models/CheckoutVerificationChallenge.js";

import {
  createLookupHash,
  normalizeEmail,
  normalizePhone,
} from "../utils/crypto.js";

import {
  verifyPassword,
} from "../utils/password.js";

import {
  generateEmailOtp,
  hashOtp,
  safeEqualHash,
} from "../utils/otp.js";

import {
  sendEmailVerificationOtp,
} from "../utils/email.js";

import {
  sendTwoFactorSmsCode,
} from "./securityDeliveryService.js";

/* =========================================================
   ERROR
========================================================= */

export class CheckoutVerificationError
  extends Error {
  statusCode:
    number;

  code:
    string;

  constructor(
    message:
      string,

    statusCode =
      400,

    code =
      "CHECKOUT_VERIFICATION_ERROR"
  ) {
    super(
      message
    );

    this.name =
      "CheckoutVerificationError";

    this.statusCode =
      statusCode;

    this.code =
      code;
  }
}

/* =========================================================
   CONSTANTS
========================================================= */

const OTP_TTL_MS =
  10 *
  60 *
  1000;

const OTP_RESEND_COOLDOWN_MS =
  60 *
  1000;

const CHECKOUT_TOKEN_TTL =
  "10m";

/* =========================================================
   SANDBOX
========================================================= */

export function getSandboxCheckoutCredentials() {
  return {
    email:
      process.env
        .COFFER_SANDBOX_EMAIL
        ?.trim()
        .toLowerCase() ||
      "demo@coffer.test",

    phone:
      normalizePhone(
        process.env
          .COFFER_SANDBOX_PHONE ||
        "01700000000"
      ),

    password:
      process.env
        .COFFER_SANDBOX_PASSWORD ||
      "CofferDemo123!",

    otp:
      process.env
        .COFFER_SANDBOX_OTP ||
      "123456",

    balance:
      Number(
        process.env
          .COFFER_SANDBOX_BALANCE ||
        50000
      ),
  };
}

/* =========================================================
   TOKEN
========================================================= */

interface CheckoutTokenPayload
  extends JwtPayload {
  purpose:
    "merchant_checkout";

  paymentId:
    string;

  mode:
    PaymentMode;

  userId?:
    string;

  challengeId:
    string;
}

function checkoutTokenSecret():
  string {
  const secret =
    process.env
      .CHECKOUT_TOKEN_SECRET
      ?.trim() ||
    process.env
      .JWT_SECRET
      ?.trim();

  if (!secret) {
    throw new Error(
      "CHECKOUT_TOKEN_SECRET or JWT_SECRET is required."
    );
  }

  return secret;
}

/* =========================================================
   IDENTIFIER
========================================================= */

function resolveIdentifier(
  value:
    unknown
): {
  value: string;
  lookup: string;
  channel:
    CheckoutVerificationChannel;
} {
  if (
    typeof value !==
    "string"
  ) {
    throw new CheckoutVerificationError(
      "Email or phone number is required.",
      400,
      "IDENTIFIER_REQUIRED"
    );
  }

  const raw =
    value.trim();

  if (!raw) {
    throw new CheckoutVerificationError(
      "Email or phone number is required.",
      400,
      "IDENTIFIER_REQUIRED"
    );
  }

  const isEmail =
    raw.includes(
      "@"
    );

  if (isEmail) {
    const email =
      normalizeEmail(
        raw
      );

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailRegex.test(
        email
      )
    ) {
      throw new CheckoutVerificationError(
        "Please provide a valid email address.",
        400,
        "INVALID_EMAIL"
      );
    }

    return {
      value:
        email,

      lookup:
        createLookupHash(
          email
        ),

      channel:
        "email",
    };
  }

  const phone =
    normalizePhone(
      raw
    );

  if (
    phone.length <
    7
  ) {
    throw new CheckoutVerificationError(
      "Please provide a valid phone number.",
      400,
      "INVALID_PHONE"
    );
  }

  return {
    value:
      phone,

    lookup:
      createLookupHash(
        phone
      ),

    channel:
      "sms",
  };
}

/* =========================================================
   MASK
========================================================= */

function maskTarget(
  value:
    string
): string {
  if (
    value.includes(
      "@"
    )
  ) {
    const [
      name,
      domain,
    ] =
      value.split(
        "@"
      );

    return `${name?.slice(
      0,
      2
    ) || ""}***@${
      domain || ""
    }`;
  }

  if (
    value.length <=
    4
  ) {
    return "****";
  }

  return `***${value.slice(
    -4
  )}`;
}

/* =========================================================
   PAYMENT
========================================================= */

async function loadPayablePayment(
  paymentId:
    string
) {
  const normalized =
    paymentId.trim();

  if (!normalized) {
    throw new CheckoutVerificationError(
      "Payment ID is required.",
      400,
      "PAYMENT_ID_REQUIRED"
    );
  }

  const payment =
    await Payment.findOne({
      paymentId:
        normalized,
    });

  if (!payment) {
    throw new CheckoutVerificationError(
      "Payment not found.",
      404,
      "PAYMENT_NOT_FOUND"
    );
  }

  if (
    payment.status !==
      "pending" &&
    payment.status !==
      "completed"
  ) {
    throw new CheckoutVerificationError(
      `Payment cannot be verified from status "${payment.status}".`,
      409,
      "PAYMENT_NOT_PAYABLE"
    );
  }

  return payment;
}

/* =========================================================
   LIVE KYC
========================================================= */

export async function assertLiveCustomerKyc(
  userId:
    string
): Promise<void> {
  const [
    user,
    verifiedKyc,
  ] =
    await Promise.all([
      User.findById(
        userId
      )
        .select(
          "accountStatus kycStatus"
        )
        .lean(),

      KYC.exists({
        userId,
        status:
          "verified",
      }),
    ]);

  if (
    !user ||
    user.accountStatus !==
      "active"
  ) {
    throw new CheckoutVerificationError(
      "This Coffer account is not available for payment.",
      403,
      "ACCOUNT_UNAVAILABLE"
    );
  }

  if (
    !verifiedKyc ||
    user.kycStatus !==
      "verified"
  ) {
    throw new CheckoutVerificationError(
      "Verified KYC is required before making a live Coffer payment.",
      403,
      "KYC_REQUIRED"
    );
  }
}

/* =========================================================
   PASSWORD + SEND OTP
========================================================= */

export async function authenticateCheckoutCustomer({
  paymentId,
  identifier,
  password,
}: {
  paymentId:
    string;

  identifier:
    unknown;

  password:
    unknown;
}) {
  const payment =
    await loadPayablePayment(
      paymentId
    );

  if (
    payment.status ===
    "completed"
  ) {
    throw new CheckoutVerificationError(
      "Payment is already completed.",
      409,
      "PAYMENT_ALREADY_COMPLETED"
    );
  }

  const resolved =
    resolveIdentifier(
      identifier
    );

  const normalizedPassword =
    typeof password ===
      "string"
      ? password
      : "";

  if (
    !normalizedPassword
  ) {
    throw new CheckoutVerificationError(
      "Password is required.",
      400,
      "PASSWORD_REQUIRED"
    );
  }

  let userId:
    string | undefined;

  let rawOtp:
    string;

  /* =======================================================
     TEST MODE
  ======================================================= */

  if (
    payment.mode ===
    "test"
  ) {
    const sandbox =
      getSandboxCheckoutCredentials();

    const identifierMatches =
      resolved.value ===
        sandbox.email ||
      resolved.value ===
        sandbox.phone;

    if (
      !identifierMatches ||
      normalizedPassword !==
        sandbox.password
    ) {
      throw new CheckoutVerificationError(
        "Invalid sandbox customer credentials.",
        401,
        "INVALID_SANDBOX_CREDENTIALS"
      );
    }

    rawOtp =
      sandbox.otp;
  }

  /* =======================================================
     LIVE MODE
  ======================================================= */

  else {
    const query =
      resolved.channel ===
      "email"
        ? {
            emailLookup:
              resolved.lookup,
          }
        : {
            phoneLookup:
              resolved.lookup,
          };

    const user =
      await User.findOne(
        query
      ).select(
        "+password accountStatus kycStatus"
      );

    if (
      !user ||
      user.accountStatus !==
        "active"
    ) {
      throw new CheckoutVerificationError(
        "Invalid email/phone or password.",
        401,
        "INVALID_CHECKOUT_CREDENTIALS"
      );
    }

    const storedPassword =
      user.get(
        "password"
      ) as
        | string
        | undefined;

    const matched =
      storedPassword
        ? await verifyPassword(
            storedPassword,
            normalizedPassword
          )
        : false;

    if (!matched) {
      throw new CheckoutVerificationError(
        "Invalid email/phone or password.",
        401,
        "INVALID_CHECKOUT_CREDENTIALS"
      );
    }

    userId =
      user._id.toString();

    await assertLiveCustomerKyc(
      userId
    );

    rawOtp =
      generateEmailOtp();
  }

  /* =======================================================
     RESEND COOLDOWN
  ======================================================= */

  const recent =
    await CheckoutVerificationChallenge.findOne({
      paymentId:
        payment.paymentId,

      identifierLookup:
        resolved.lookup,

      consumedAt: {
        $exists:
          false,
      },

      lastSentAt: {
        $gt:
          new Date(
            Date.now() -
              OTP_RESEND_COOLDOWN_MS
          ),
      },
    })
      .sort({
        createdAt:
          -1,
      })
      .lean();

  if (recent) {
    throw new CheckoutVerificationError(
      "Please wait before requesting another verification code.",
      429,
      "OTP_RESEND_COOLDOWN"
    );
  }

  /* =======================================================
     INVALIDATE PREVIOUS
  ======================================================= */

  await CheckoutVerificationChallenge.updateMany(
    {
      paymentId:
        payment.paymentId,

      identifierLookup:
        resolved.lookup,

      consumedAt: {
        $exists:
          false,
      },
    },
    {
      $set: {
        consumedAt:
          new Date(),
      },
    }
  );

  const challengeId =
    crypto
      .randomBytes(
        32
      )
      .toString(
        "hex"
      );

  const challenge =
    await CheckoutVerificationChallenge.create({
      challengeId,

      paymentId:
        payment.paymentId,

      mode:
        payment.mode,

      userId:
        userId
          ? userId
          : undefined,

      channel:
        resolved.channel,

      identifierLookup:
        resolved.lookup,

      codeHash:
        hashOtp(
          rawOtp
        ),

      attempts:
        0,

      maxAttempts:
        5,

      expiresAt:
        new Date(
          Date.now() +
            OTP_TTL_MS
        ),

      lastSentAt:
        new Date(),
    });

  /* =======================================================
     DELIVERY

     Test mode intentionally does not send a real message.
  ======================================================= */

  if (
    payment.mode ===
    "live"
  ) {
    try {
      if (
        resolved.channel ===
        "email"
      ) {
        await sendEmailVerificationOtp({
          email:
            resolved.value,

          otp:
            rawOtp,
        });
      } else {
        await sendTwoFactorSmsCode({
          phone:
            resolved.value,

          code:
            rawOtp,
        });
      }
    } catch (
      deliveryError
    ) {
      await CheckoutVerificationChallenge.deleteOne({
        _id:
          challenge._id,
      });

      throw deliveryError;
    }
  }

  return {
    challengeId,

    channel:
      resolved.channel,

    target:
      maskTarget(
        resolved.value
      ),

    mode:
      payment.mode,

    expiresInSeconds:
      Math.floor(
        OTP_TTL_MS /
          1000
      ),

    /*
     * Only sandbox returns its test OTP.
     * Live OTP is never returned by API.
     */
    testOtp:
      payment.mode ===
      "test"
        ? rawOtp
        : undefined,
  };
}

/* =========================================================
   VERIFY OTP
========================================================= */

export async function verifyCheckoutOtp({
  paymentId,
  challengeId,
  otp,
}: {
  paymentId:
    string;

  challengeId:
    unknown;

  otp:
    unknown;
}) {
  const normalizedChallengeId =
    typeof challengeId ===
      "string"
      ? challengeId.trim()
      : "";

  const normalizedOtp =
    typeof otp ===
      "string"
      ? otp.trim()
      : "";

  if (
    !normalizedChallengeId ||
    !normalizedOtp
  ) {
    throw new CheckoutVerificationError(
      "Challenge ID and OTP are required.",
      400,
      "OTP_REQUIRED"
    );
  }

  const challenge =
    await CheckoutVerificationChallenge.findOne({
      challengeId:
        normalizedChallengeId,

      paymentId:
        paymentId.trim(),

      consumedAt: {
        $exists:
          false,
      },

      expiresAt: {
        $gt:
          new Date(),
      },
    }).select(
      "+codeHash"
    );

  if (!challenge) {
    throw new CheckoutVerificationError(
      "Invalid or expired checkout verification.",
      400,
      "CHECKOUT_CHALLENGE_INVALID"
    );
  }

  if (
    challenge.attempts >=
    challenge.maxAttempts
  ) {
    throw new CheckoutVerificationError(
      "Too many invalid OTP attempts.",
      429,
      "OTP_ATTEMPTS_EXCEEDED"
    );
  }

  const incomingHash =
    hashOtp(
      normalizedOtp
    );

  const valid =
    safeEqualHash(
      incomingHash,
      challenge.codeHash
    );

  if (!valid) {
    challenge.attempts +=
      1;

    if (
      challenge.attempts >=
      challenge.maxAttempts
    ) {
      challenge.consumedAt =
        new Date();
    }

    await challenge.save();

    throw new CheckoutVerificationError(
      "Invalid verification code.",
      401,
      "INVALID_OTP"
    );
  }

  if (
    challenge.mode ===
      "live" &&
    challenge.userId
  ) {
    await assertLiveCustomerKyc(
      challenge.userId.toString()
    );
  }

  challenge.consumedAt =
    new Date();

  await challenge.save();

  const checkoutToken =
    jwt.sign(
      {
        purpose:
          "merchant_checkout",

        paymentId:
          challenge.paymentId,

        mode:
          challenge.mode,

        userId:
          challenge.userId
            ?.toString(),

        challengeId:
          challenge.challengeId,
      } satisfies CheckoutTokenPayload,

      checkoutTokenSecret(),

      {
        expiresIn:
          CHECKOUT_TOKEN_TTL,

        issuer:
          "coffer",

        audience:
          "merchant-checkout",
      }
    );

  return {
    checkoutToken,

    expiresInSeconds:
      10 *
      60,

    mode:
      challenge.mode,
  };
}

/* =========================================================
   VERIFY CHECKOUT TOKEN
========================================================= */

export function verifyCheckoutToken({
  token,
  paymentId,
}: {
  token:
    string;

  paymentId:
    string;
}): CheckoutTokenPayload {
  try {
    const decoded =
      jwt.verify(
        token,
        checkoutTokenSecret(),
        {
          issuer:
            "coffer",

          audience:
            "merchant-checkout",
        }
      );

    if (
      typeof decoded ===
      "string"
    ) {
      throw new Error();
    }

    const payload =
      decoded as
        CheckoutTokenPayload;

    if (
      payload.purpose !==
        "merchant_checkout" ||
      payload.paymentId !==
        paymentId
    ) {
      throw new Error();
    }

    if (
      payload.mode !==
        "test" &&
      payload.mode !==
        "live"
    ) {
      throw new Error();
    }

    if (
      payload.mode ===
        "live" &&
      !payload.userId
    ) {
      throw new Error();
    }

    return payload;
  } catch {
    throw new CheckoutVerificationError(
      "Checkout verification expired. Verify your account again.",
      401,
      "CHECKOUT_TOKEN_INVALID"
    );
  }
}