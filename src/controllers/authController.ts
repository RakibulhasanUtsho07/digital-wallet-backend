import crypto from "crypto";

import type {
  Request,
  Response,
} from "express";

import {
  PendingRegistration,
} from "../models/PendingRegistration.js";

import {
  User,
} from "../models/User.js";

import {
  Wallet,
} from "../models/Wallet.js";

import {
  AuthSession,
} from "../models/AuthSession.js";

import {
  SecurityPreferences,
} from "../models/SecurityPreferences.js";

import {
  TwoFactorChallenge,
} from "../models/TwoFactorChallenge.js";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  issueAuthenticatedSession,
  clearAuthCookie,
  revokeAllSessions,
  revokeCurrentSessionFromRequest,
  revokeAllOtherSessions,
  revokeSessionById,
  readTokenFromRequest,
  decodeSessionToken,
} from "../services/authSessionService.js";

import {
  sendEmailVerificationOtp,
  sendPasswordResetEmail,
} from "../utils/email.js";

import {
  createLookupHash,
  encryptData,
  decryptData,
  normalizeEmail,
  normalizePhone,
} from "../utils/crypto.js";

import {
  hashPassword,
  verifyPassword,
} from "../utils/password.js";

import {
  recordSecurityEvent,
} from "../services/securityEventService.js";

import {
  getSecurityRequestMetadata,
} from "../services/securityRequestMetadata.js";

import {
  sendTwoFactorEmailCode,
  sendTwoFactorSmsCode,
  getTwoFactorDeliveryAvailability,
} from "../services/securityDeliveryService.js";

import {
  verifyTotp,
} from "../services/totpService.js";

import {
  dispatchSecurityAlert,
} from "../services/securityAlertService.js";

import {
  uploadProfileImage,
} from "../services/cloudinaryService.js";

import {
  generateEmailOtp,
  hashOtp,
  safeEqualHash,
} from "../utils/otp.js";

/* =========================================================
   TYPES
========================================================= */

interface EncryptedContactValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

const REGISTRATION_OTP_TTL_MS =
  10 * 60 * 1000;

const OTP_RESEND_COOLDOWN_MS =
  60 * 1000;

/* =========================================================
   HELPERS
========================================================= */

const toStringValue = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value
    : "";
};

/* =========================================================
   DECRYPT CONTACT
========================================================= */

const decryptContactValue = (
  value:
    | EncryptedContactValue
    | undefined
): string => {
  if (!value) {
    return "";
  }

  try {
    return decryptData(value);
  } catch (error) {
    console.error(
      "CONTACT DECRYPT ERROR:",
      error
    );

    return "";
  }
};

/* =========================================================
   CHALLENGE HASH KEY
========================================================= */

const getChallengeHashKey = (): string => {
  const key =
    process.env.LOOKUP_HMAC_KEY ||
    process.env.JWT_SECRET;

  if (!key) {
    throw new Error(
      "LOOKUP_HMAC_KEY or JWT_SECRET is required."
    );
  }

  return key;
};

/* =========================================================
   BACKUP CODE NORMALIZATION
========================================================= */

const normalizeBackupCode = (
  value: string
): string => {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
};

/* =========================================================
   HASH ONE-TIME CODE
========================================================= */

const hashOneTimeCode = (
  value: string
): string => {
  return crypto
    .createHmac(
      "sha256",
      getChallengeHashKey()
    )
    .update(
      normalizeBackupCode(value)
    )
    .digest("hex");
};

/* =========================================================
   SAFE HEX COMPARISON
========================================================= */

const safeEqualHex = (
  a: string,
  b: string
): boolean => {
  try {
    const left =
      Buffer.from(a, "hex");

    const right =
      Buffer.from(b, "hex");

    return (
      left.length === right.length &&
      crypto.timingSafeEqual(
        left,
        right
      )
    );
  } catch {
    return false;
  }
};

/* =========================================================
   STRONG PASSWORD
========================================================= */

const isStrongSecurityPassword = (
  password: string
): boolean => {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(
    password
  );
};

/* =========================================================
   MASK TARGET
========================================================= */

const maskTarget = (
  value: string
): string => {
  if (!value) {
    return "Unavailable";
  }

  if (value.includes("@")) {
    const [
      name,
      domain,
    ] = value.split("@");

    return `${name?.slice(0, 2) ?? ""}***@${
      domain ?? ""
    }`;
  }

  return value.length > 4
    ? `***${value.slice(-4)}`
    : "***";
};

/* =========================================================
   GET CURRENT SESSION ID
========================================================= */

const getCurrentSessionId = (
  req: AuthRequest
): string | null => {
  return req.user?.sessionId
    ? String(
        req.user.sessionId
      )
    : null;
};

/* =========================================================
   CREATE LOGIN 2FA CHALLENGE
========================================================= */

const createLoginChallenge =
  async ({
    userId,
    method,
    email,
    phone,
  }: {
    userId: string;
    method:
      | "app"
      | "email"
      | "sms";
    email: string;
    phone: string;
  }): Promise<{
    challengeId: string;
    target: string;
  }> => {
    const challengeId =
      crypto
        .randomBytes(32)
        .toString("hex");

    const expiresAt =
      new Date(
        Date.now() +
          5 * 60 * 1000
      );

    let codeHash:
      | string
      | undefined;

    let rawCode = "";

    let target =
      "Authenticator app";

    if (
      method === "email" ||
      method === "sms"
    ) {
      rawCode = String(
        crypto.randomInt(
          100000,
          1000000
        )
      );

      codeHash =
        hashOneTimeCode(
          rawCode
        );
    }

    await TwoFactorChallenge.create({
      challengeId,
      userId,
      purpose: "login",
      method,
      codeHash,
      attempts: 0,
      maxAttempts: 5,
      expiresAt,
    });

    try {
      if (method === "email") {
        if (!email) {
          throw new Error(
            "Email address is unavailable for 2FA."
          );
        }

        await sendTwoFactorEmailCode({
          email,
          code: rawCode,
        });

        target =
          maskTarget(email);
      }

      if (method === "sms") {
        if (!phone) {
          throw new Error(
            "Phone number is unavailable for 2FA."
          );
        }

        await sendTwoFactorSmsCode({
          phone,
          code: rawCode,
        });

        target =
          maskTarget(phone);
      }
    } catch (error) {
      await TwoFactorChallenge.deleteOne({
        challengeId,
      });

      throw error;
    }

    return {
      challengeId,
      target,
    };
  };

/* =========================================================
   AUTHENTICATED RESPONSE
========================================================= */

const respondWithAuthenticatedUser =
  async ({
    user,
    req,
    res,
    message,
  }: {
    user: any;
    req: Request;
    res: Response;
    message: string;
  }): Promise<void> => {
    const session =
      await issueAuthenticatedSession({
        user,
        req,
        res,
      });

    const email =
      decryptContactValue(
        user.emailEncrypted
      );

    const phone =
      decryptContactValue(
        user.phoneEncrypted
      );

    await recordSecurityEvent({
      userId:
        user._id.toString(),

      eventType:
        "LOGIN_SUCCESS",

      title:
        "Successful login",

      status:
        "success",

      detail:
        "A new authenticated session was created.",

      sessionId:
        session.sessionId,

      req,
    });

    res.status(200).json({
      success: true,

      message,

      user: {
        _id:
          user._id.toString(),

        name:
          user.name,

        email,

        phone,

        role:
          user.role,

        kycStatus:
          user.kycStatus,

        avatarUrl:
          user.avatarUrl ??
          "",
      },
    });
  };

/* =========================================================
   REGISTER
========================================================= */

export const registerUser =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const normalizedName =
        toStringValue(
          req.body?.name
        ).trim();

      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            req.body?.email
          )
        );

      const normalizedPhone =
        normalizePhone(
          toStringValue(
            req.body?.phone
          )
        );

      const normalizedPassword =
        toStringValue(
          req.body?.password
        );

      if (
        !normalizedName ||
        !normalizedEmail ||
        !normalizedPassword
      ) {
        res.status(400).json({
          success: false,
          message:
            "Name, email and password are required.",
        });

        return;
      }

      if (
        normalizedPassword.length <
        6
      ) {
        res.status(400).json({
          success: false,
          message:
            "Password must be at least 6 characters.",
        });

        return;
      }

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (
        !emailRegex.test(
          normalizedEmail
        )
      ) {
        res.status(400).json({
          success: false,
          message:
            "Please provide a valid email address.",
        });

        return;
      }

      if (!req.file?.buffer) {
        res.status(400).json({
          success: false,
          message:
            "Profile image is required. Send it using the profileImage field.",
        });

        return;
      }

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      const phoneLookup =
        normalizedPhone
          ? createLookupHash(
              normalizedPhone
            )
          : undefined;

      const existingUser =
        await User.findOne({
          $or: [
            {
              emailLookup,
            },

            ...(phoneLookup
              ? [
                  {
                    phoneLookup,
                  },
                ]
              : []),
          ],
        }).lean();

      if (existingUser) {
        res.status(409).json({
          success: false,
          code:
            "ACCOUNT_EXISTS",
          message:
            "An account with this email or phone already exists.",
        });

        return;
      }

      const existingPending =
        await PendingRegistration.findOne(
          {
            emailLookup,
          }
        ).select(
          "lastSentAt"
        );

      if (existingPending) {
        const elapsed =
          Date.now() -
          existingPending.lastSentAt.getTime();

        if (
          elapsed <
          OTP_RESEND_COOLDOWN_MS
        ) {
          const remaining =
            Math.ceil(
              (
                OTP_RESEND_COOLDOWN_MS -
                elapsed
              ) / 1000
            );

          res.status(429).json({
            success: false,
            message:
              `Please wait ${remaining} seconds before trying to register again.`,
          });

          return;
        }
      }

      const uploadedAvatar =
        await uploadProfileImage(
          req.file.buffer,
          `user-${Date.now()}-${crypto
            .randomBytes(8)
            .toString("hex")}`
        );

      if (
        !uploadedAvatar?.secure_url ||
        !uploadedAvatar?.public_id
      ) {
        throw new Error(
          "Cloudinary did not return profile image information."
        );
      }

      const passwordHash =
        await hashPassword(
          normalizedPassword
        );

      const passwordPolicyVersion =
        isStrongSecurityPassword(
          normalizedPassword
        )
          ? 2
          : 1;

      const otp =
        generateEmailOtp();

      const otpHash =
        hashOtp(otp);

      const now =
        new Date();

      const expiresAt =
        new Date(
          now.getTime() +
            REGISTRATION_OTP_TTL_MS
        );

      await sendEmailVerificationOtp({
        email:
          normalizedEmail,

        otp,
      });

      await PendingRegistration.findOneAndUpdate(
        {
          emailLookup,
        },
        {
          emailLookup,

          name:
            normalizedName,

          emailEncrypted:
            encryptData(
              normalizedEmail
            ),

          phoneEncrypted:
            normalizedPhone
              ? encryptData(
                  normalizedPhone
                )
              : undefined,

          phoneLookup,

          passwordHash,

          passwordPolicyVersion,

          avatarUrl:
            uploadedAvatar.secure_url,

          avatarPublicId:
            uploadedAvatar.public_id,

          codeHash:
            otpHash,

          attempts: 0,

          maxAttempts: 5,

          expiresAt,

          lastSentAt:
            now,
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert:
            true,
        }
      );

      res.status(201).json({
        success: true,

        message:
          "A verification code has been sent to your email. Your account will be created once you verify it.",

        requiresEmailVerification:
          true,

        email:
          normalizedEmail,
      });
    } catch (
      error: any
    ) {
      console.error(
        "REGISTER ERROR:",
        error
      );

      if (
        error?.code ===
        11000
      ) {
        res.status(409).json({
          success: false,

          code:
            "DUPLICATE_KEY",

          message:
            "An account with this email or phone already exists.",
        });

        return;
      }

      res.status(500).json({
        success: false,

        message:
          error?.message ||
          "Registration failed. Please try again.",
      });
    }
  };

/* =========================================================
   VERIFY EMAIL OTP
========================================================= */

export const verifyEmailOtp =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            req.body?.email
          )
        );

      const code =
        toStringValue(
          req.body?.otp
        )
          .replace(
            /\s+/g,
            ""
          )
          .trim();

      if (!normalizedEmail) {
        res.status(400).json({
          success: false,
          message:
            "Email address is required.",
        });

        return;
      }

      if (
        !/^\d{6}$/.test(
          code
        )
      ) {
        res.status(400).json({
          success: false,
          message:
            "Please enter a valid 6-digit verification code.",
        });

        return;
      }

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      const existingUser =
        await User.findOne({
          emailLookup,
        });

      if (
        existingUser?.emailVerified
      ) {
        res.status(400).json({
          success: false,
          message:
            "Email is already verified.",
        });

        return;
      }

      const pending =
        await PendingRegistration.findOne(
          {
            emailLookup,

            expiresAt: {
              $gt:
                new Date(),
            },
          }
        ).select(
          "+passwordHash +codeHash"
        );

      if (!pending) {
        res.status(400).json({
          success: false,
          message:
            "Verification code is invalid or expired. Please register again.",
        });

        return;
      }

      if (
        pending.attempts >=
        pending.maxAttempts
      ) {
        res.status(429).json({
          success: false,
          message:
            "Too many verification attempts. Please register again.",
        });

        return;
      }

      const incomingHash =
        hashOtp(code);

      const valid =
        safeEqualHash(
          incomingHash,
          pending.codeHash
        );

      if (!valid) {
        pending.attempts +=
          1;

        await pending.save();

        res.status(400).json({
          success: false,

          message:
            "Incorrect verification code.",

          attemptsRemaining:
            Math.max(
              0,
              pending.maxAttempts -
                pending.attempts
            ),
        });

        return;
      }

      let createdUserId:
        | string
        | null = null;

      let createdWallet =
        false;

      try {
        const user =
          await User.create({
            name:
              pending.name,

            emailEncrypted:
              pending.emailEncrypted,

            emailLookup:
              pending.emailLookup,

            phoneEncrypted:
              pending.phoneEncrypted,

            phoneLookup:
              pending.phoneLookup,

            password:
              pending.passwordHash,

            role:
              "user",

            authVersion:
              0,

            accountStatus:
              "active",

            emailVerified:
              true,

            emailVerifiedAt:
              new Date(),

            passwordPolicyVersion:
              pending.passwordPolicyVersion,

            passwordChangedAt:
              new Date(),

            kycStatus:
              "not_started",

            avatarUrl:
              pending.avatarUrl,

            avatarPublicId:
              pending.avatarPublicId,
          });

        createdUserId =
          user._id.toString();

        const wallet =
          await Wallet.create({
            userId:
              user._id,

            balance:
              0,
          });

        createdWallet =
          true;

        user.walletId =
          wallet._id;

        await user.save();

        await SecurityPreferences.create({
          userId:
            user._id,
        });

        await PendingRegistration.deleteOne({
          emailLookup,
        });

        const session =
          await issueAuthenticatedSession({
            user,
            req,
            res,
          });

        await recordSecurityEvent({
          userId:
            createdUserId,

          eventType:
            "LOGIN_SUCCESS",

          title:
            "Email verification completed",

          status:
            "success",

          detail:
            "The user completed email verification and an authenticated session was created.",

          sessionId:
            session.sessionId,

          req,
        });

        const email =
          decryptContactValue(
            user.emailEncrypted
          );

        const phone =
          decryptContactValue(
            user.phoneEncrypted
          );

        res.status(200).json({
          success: true,

          message:
            "Email verified successfully.",

          user: {
            _id:
              createdUserId,

            name:
              user.name,

            email,

            phone,

            role:
              user.role,

            kycStatus:
              user.kycStatus,

            avatarUrl:
              user.avatarUrl ||
              "",

            emailVerified:
              user.emailVerified,

            emailVerifiedAt:
              user.emailVerifiedAt ??
              null,
          },
        });
      } catch (
        createError: any
      ) {
        console.error(
          "USER CREATION AFTER OTP VERIFY FAILED:",
          createError
        );

        if (createdUserId) {
          if (
            createdWallet
          ) {
            await Wallet.deleteOne({
              userId:
                createdUserId,
            }).catch(
              (cleanupError) =>
                console.error(
                  "WALLET CLEANUP ERROR:",
                  cleanupError
                )
            );
          }

          await User.deleteOne({
            _id:
              createdUserId,
          }).catch(
            (cleanupError) =>
              console.error(
                "USER CLEANUP ERROR:",
                cleanupError
              )
          );
        }

        if (
          createError?.code ===
          11000
        ) {
          res.status(409).json({
            success: false,
            code:
              "ACCOUNT_EXISTS",
            message:
              "An account with this email or phone already exists.",
          });

          return;
        }

        throw createError;
      }
    } catch (
      error
    ) {
      console.error(
        "VERIFY EMAIL OTP ERROR:",
        error
      );

      if (
        res.headersSent
      ) {
        return;
      }

      res.status(500).json({
        success: false,
        message:
          "Unable to verify email. Please try again.",
      });
    }
  };

/* =========================================================
   RESEND EMAIL OTP
========================================================= */

export const resendEmailOtp =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            req.body?.email
          )
        );

      if (!normalizedEmail) {
        res.status(400).json({
          success: false,
          message:
            "Email address is required.",
        });

        return;
      }

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      const existingUser =
        await User.findOne({
          emailLookup,
        }).select(
          "emailVerified"
        );

      if (
        existingUser?.emailVerified
      ) {
        res.status(400).json({
          success: false,
          message:
            "Email is already verified.",
        });

        return;
      }

      const pending =
        await PendingRegistration.findOne({
          emailLookup,
        });

      if (!pending) {
        res.status(404).json({
          success: false,
          message:
            "No pending registration found for this email. Please register again.",
        });

        return;
      }

      const elapsed =
        Date.now() -
        pending.lastSentAt.getTime();

      if (
        elapsed <
        OTP_RESEND_COOLDOWN_MS
      ) {
        const remaining =
          Math.ceil(
            (
              OTP_RESEND_COOLDOWN_MS -
              elapsed
            ) / 1000
          );

        res.status(429).json({
          success: false,
          message:
            `Please wait ${remaining} seconds before requesting another code.`,
        });

        return;
      }

      const otp =
        generateEmailOtp();

      await sendEmailVerificationOtp({
        email:
          normalizedEmail,
        otp,
      });

      const now =
        new Date();

      pending.codeHash =
        hashOtp(otp);

      pending.attempts =
        0;

      pending.expiresAt =
        new Date(
          now.getTime() +
            REGISTRATION_OTP_TTL_MS
        );

      pending.lastSentAt =
        now;

      await pending.save();

      res.status(200).json({
        success: true,
        message:
          "A new verification code has been sent to your email.",
      });
    } catch (
      error
    ) {
      console.error(
        "RESEND EMAIL OTP ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to resend verification code.",
      });
    }
  };

/* =========================================================
   LOGIN
========================================================= */

export const loginUser =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            req.body?.email
          )
        );

      const normalizedPassword =
        toStringValue(
          req.body?.password
        );

      if (
        !normalizedEmail ||
        !normalizedPassword
      ) {
        res.status(400).json({
          success: false,
          message:
            "Email and password are required.",
        });

        return;
      }

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      const user =
        await User.findOne({
          emailLookup,
        }).select(
          "+password"
        );

      if (
        !user ||
        user.accountStatus ===
          "deleted"
      ) {
        res.status(401).json({
          success: false,
          message:
            "Invalid email or password.",
        });

        return;
      }

      const storedPassword =
        user.get("password") as
          | string
          | undefined;

      const passwordMatched =
        storedPassword
          ? await verifyPassword(
              storedPassword,
              normalizedPassword
            )
          : false;

      if (!passwordMatched) {
        await recordSecurityEvent({
          userId:
            user._id.toString(),

          eventType:
            "LOGIN_FAILED",

          title:
            "Failed login attempt",

          status:
            "warning",

          detail:
            "A sign-in attempt failed because the supplied credentials were not accepted.",

          req,
        });

        await dispatchSecurityAlert({
          userId:
            user._id.toString(),

          kind:
            "failedLogin",

          title:
            "Failed sign-in attempt",

          message:
            "A sign-in attempt to your Coffer account was not successful. Review Security Center if this was not you.",
        });

        res.status(401).json({
          success: false,
          message:
            "Invalid email or password.",
        });

        return;
      }

      if (!user.emailVerified) {
        res.status(403).json({
          success: false,

          code:
            "EMAIL_NOT_VERIFIED",

          message:
            "Please verify your email before signing in.",
        });

        return;
      }

      const preferences =
        await SecurityPreferences.findOne({
          userId:
            user._id,
        });

      if (
        preferences?.twoFactor?.enabled
      ) {
        const method =
          preferences.twoFactor.method;

        const availability =
          getTwoFactorDeliveryAvailability();

        if (
          method === "email" &&
          !availability.email
        ) {
          res.status(503).json({
            success: false,

            code:
              "EMAIL_2FA_NOT_CONFIGURED",

            message:
              "Email 2FA is not configured on the server.",
          });

          return;
        }

        if (
          method === "sms" &&
          !availability.sms
        ) {
          res.status(503).json({
            success: false,

            code:
              "SMS_2FA_NOT_CONFIGURED",

            message:
              "SMS 2FA is not configured on the server.",
          });

          return;
        }

        const email =
          decryptContactValue(
            user.emailEncrypted
          );

        const phone =
          decryptContactValue(
            user.phoneEncrypted
          );

        const challenge =
          await createLoginChallenge({
            userId:
              user._id.toString(),

            method,

            email,

            phone,
          });

        res.status(202).json({
          success: true,

          requiresTwoFactor:
            true,

          challengeId:
            challenge.challengeId,

          method,

          target:
            challenge.target,

          expiresInSeconds:
            300,

          message:
            method === "app"
              ? "Enter the code from your authenticator app."
              : "Enter the verification code that was sent to you.",
        });

        return;
      }

      const metadata =
        getSecurityRequestMetadata(
          req
        );

      const [
        knownDevice,
        previousSessions,
      ] =
        await Promise.all([
          AuthSession.exists({
            userId:
              user._id,

            userAgentHash:
              metadata.userAgentHash,
          }),

          AuthSession.find({
            userId:
              user._id,
          })
            .select(
              "location"
            )
            .sort({
              createdAt:
                -1,
            })
            .limit(10)
            .lean(),
        ]);

      const locationChanged =
        metadata.location !==
          "Unknown location" &&
        previousSessions.length >
          0 &&
        !previousSessions.some(
          (session) =>
            session.location ===
            metadata.location
        );

      const session =
        await issueAuthenticatedSession({
          user,
          req,
          res,
        });

      await recordSecurityEvent({
        userId:
          user._id.toString(),

        eventType:
          "LOGIN_SUCCESS",

        title:
          "Successful login",

        status:
          "success",

        detail:
          "A new authenticated session was created.",

        sessionId:
          session.sessionId,

        req,
      });

      if (!knownDevice) {
        try {
          await recordSecurityEvent({
            userId:
              user._id.toString(),

            eventType:
              "SUSPICIOUS_LOGIN",

            title:
              "New device sign-in",

            status:
              "info",

            detail:
              "A successful sign-in was created from a device fingerprint not seen in previous sessions.",

            sessionId:
              session.sessionId,

            req,
          });
        } catch (
          eventError
        ) {
          console.error(
            "NEW DEVICE EVENT ERROR:",
            eventError
          );
        }

        try {
          await dispatchSecurityAlert({
            userId:
              user._id.toString(),

            kind:
              "newDevice",

            title:
              "New device signed in",

            message:
              `A new ${metadata.device} session signed in from ${metadata.location}.`,
          });
        } catch (
          alertError
        ) {
          console.error(
            "NEW DEVICE ALERT ERROR:",
            alertError
          );
        }
      }

      if (locationChanged) {
        try {
          await dispatchSecurityAlert({
            userId:
              user._id.toString(),

            kind:
              "suspiciousActivity",

            title:
              "New sign-in location detected",

            message:
              `A successful sign-in was detected from ${metadata.location}. Review your active sessions if this was not you.`,
          });
        } catch (
          alertError
        ) {
          console.error(
            "LOCATION ALERT ERROR:",
            alertError
          );
        }
      }

      const email =
        decryptContactValue(
          user.emailEncrypted
        );

      const phone =
        decryptContactValue(
          user.phoneEncrypted
        );

      res.status(200).json({
        success: true,

        message:
          "Login successful.",

        user: {
          _id:
            user._id.toString(),

          name:
            user.name,

          email,

          phone,

          role:
            user.role,

          kycStatus:
            user.kycStatus,

          avatarUrl:
            user.avatarUrl ??
            "",
        },
      });
    } catch (
      error
    ) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      if (
        res.headersSent
      ) {
        return;
      }

      res.status(500).json({
        success: false,

        message:
          "Login failed. Please try again.",
      });
    }
  };

/* =========================================================
   VERIFY LOGIN 2FA
========================================================= */

export const verifyLoginTwoFactor =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const challengeId =
        toStringValue(
          req.body?.challengeId
        ).trim();

      const code =
        toStringValue(
          req.body?.code
        ).trim();

      if (
        !challengeId ||
        !code
      ) {
        res.status(400).json({
          success: false,

          message:
            "Challenge id and verification code are required.",
        });

        return;
      }

      const challenge =
        await TwoFactorChallenge.findOne({
          challengeId,

          purpose:
            "login",

          consumedAt: {
            $exists: false,
          },

          expiresAt: {
            $gt:
              new Date(),
          },
        }).select(
          "+codeHash"
        );

      if (!challenge) {
        res.status(400).json({
          success: false,

          message:
            "Invalid or expired 2FA challenge.",
        });

        return;
      }

      if (
        challenge.attempts >=
        challenge.maxAttempts
      ) {
        res.status(429).json({
          success: false,

          message:
            "Too many invalid 2FA attempts. Sign in again.",
        });

        return;
      }

      const [
        user,
        preferences,
      ] =
        await Promise.all([
          User.findById(
            challenge.userId
          ),

          SecurityPreferences.findOne({
            userId:
              challenge.userId,
          }).select(
            "+twoFactor.backupCodeHashes"
          ),
        ]);

      if (
        !user ||
        !preferences?.twoFactor
          ?.enabled
      ) {
        res.status(400).json({
          success: false,

          message:
            "Two-factor configuration is no longer valid.",
        });

        return;
      }

      let verified = false;

      const backupHash =
        hashOneTimeCode(code);

      const backupCodeHashes =
        (preferences.twoFactor
          .backupCodeHashes ||
          []) as string[];

      const backupIndex =
        backupCodeHashes.findIndex(
          (hash: string) =>
            safeEqualHex(
              hash,
              backupHash
            )
        );

      if (
        backupIndex >= 0
      ) {
        verified = true;

        preferences.twoFactor.backupCodeHashes.splice(
          backupIndex,
          1
        );

        await preferences.save();
      } else if (
        challenge.method ===
        "app"
      ) {
        const encrypted =
          preferences
            .twoFactor
            .secretEncrypted;

        if (encrypted) {
          try {
            const secret =
              decryptData(
                encrypted
              );

            verified =
              verifyTotp(
                secret,
                code
              );
          } catch {
            verified = false;
          }
        }
      } else {
        const providedHash =
          hashOneTimeCode(code);

        const storedHash =
          challenge.get(
            "codeHash"
          ) as
            | string
            | undefined;

        verified =
          Boolean(
            storedHash &&
              safeEqualHex(
                storedHash,
                providedHash
              )
          );
      }

      if (!verified) {
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

        await recordSecurityEvent({
          userId:
            user._id.toString(),

          eventType:
            "LOGIN_FAILED",

          title:
            "Failed two-factor verification",

          status:
            "warning",

          detail:
            "The supplied two-factor verification code was invalid.",

          req,
        });

        res.status(401).json({
          success: false,

          message:
            "Invalid verification code.",

          attemptsRemaining:
            Math.max(
              0,
              challenge.maxAttempts -
                challenge.attempts
            ),
        });

        return;
      }

      challenge.consumedAt =
        new Date();

      await challenge.save();

      const metadata =
        getSecurityRequestMetadata(
          req
        );

      const [
        knownDevice,
        previousSessions,
      ] =
        await Promise.all([
          AuthSession.exists({
            userId:
              user._id,

            userAgentHash:
              metadata.userAgentHash,
          }),

          AuthSession.find({
            userId:
              user._id,
          })
            .select(
              "location"
            )
            .sort({
              createdAt:
                -1,
            })
            .limit(10)
            .lean(),
        ]);

      const locationChanged =
        metadata.location !==
          "Unknown location" &&
        previousSessions.length >
          0 &&
        !previousSessions.some(
          (session) =>
            session.location ===
            metadata.location
        );

      const session =
        await issueAuthenticatedSession({
          user,
          req,
          res,
        });

      await recordSecurityEvent({
        userId:
          user._id.toString(),

        eventType:
          "LOGIN_SUCCESS",

        title:
          "Successful login",

        status:
          "success",

        detail:
          "A new authenticated session was created after two-factor verification.",

        sessionId:
          session.sessionId,

        req,
      });

      if (!knownDevice) {
        try {
          await recordSecurityEvent({
            userId:
              user._id.toString(),

            eventType:
              "SUSPICIOUS_LOGIN",

            title:
              "New device sign-in",

            status:
              "info",

            detail:
              "A successful two-factor login was created from a device fingerprint not seen in previous sessions.",

            sessionId:
              session.sessionId,

            req,
          });
        } catch (
          eventError
        ) {
          console.error(
            "2FA NEW DEVICE EVENT ERROR:",
            eventError
          );
        }

        try {
          await dispatchSecurityAlert({
            userId:
              user._id.toString(),

            kind:
              "newDevice",

            title:
              "New device signed in",

            message:
              `A new ${metadata.device} session signed in from ${metadata.location}.`,
          });
        } catch (
          alertError
        ) {
          console.error(
            "2FA NEW DEVICE ALERT ERROR:",
            alertError
          );
        }
      }

      if (locationChanged) {
        try {
          await dispatchSecurityAlert({
            userId:
              user._id.toString(),

            kind:
              "suspiciousActivity",

            title:
              "New sign-in location detected",

            message:
              `A successful sign-in was detected from ${metadata.location}. Review your active sessions if this was not you.`,
          });
        } catch (
          alertError
        ) {
          console.error(
            "2FA LOCATION ALERT ERROR:",
            alertError
          );
        }
      }

      const email =
        decryptContactValue(
          user.emailEncrypted
        );

      const phone =
        decryptContactValue(
          user.phoneEncrypted
        );

      res.status(200).json({
        success: true,

        message:
          "Login successful.",

        user: {
          _id:
            user._id.toString(),

          name:
            user.name,

          email,

          phone,

          role:
            user.role,

          kycStatus:
            user.kycStatus,

          avatarUrl:
            user.avatarUrl ??
            "",
        },
      });
    } catch (
      error
    ) {
      console.error(
        "VERIFY LOGIN 2FA ERROR:",
        error
      );

      if (
        res.headersSent
      ) {
        return;
      }

      res.status(500).json({
        success: false,

        message:
          "Unable to verify two-factor authentication.",
      });
    }
  };

/* =========================================================
   FORGOT PASSWORD
========================================================= */

export const forgotPassword =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            req.body?.email
          )
        );

      if (!normalizedEmail) {
        res.status(400).json({
          success: false,

          message:
            "Email address is required.",
        });

        return;
      }

      const genericMessage =
        "If an account exists for this email, a password reset link has been sent.";

      const user =
        await User.findOne({
          emailLookup:
            createLookupHash(
              normalizedEmail
            ),
        }).select(
          "+resetPasswordTokenHash +resetPasswordExpires"
        );

      if (!user) {
        res.status(200).json({
          success: true,

          message:
            genericMessage,
        });

        return;
      }

      const rawToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      const tokenHash =
        crypto
          .createHash(
            "sha256"
          )
          .update(
            rawToken
          )
          .digest("hex");

      user.resetPasswordTokenHash =
        tokenHash;

      user.resetPasswordExpires =
        new Date(
          Date.now() +
            15 * 60 * 1000
        );

      await user.save();

      const frontendUrl =
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const resetUrl =
        `${frontendUrl}/reset-password?token=${encodeURIComponent(
          rawToken
        )}&email=${encodeURIComponent(
          normalizedEmail
        )}`;

      try {
        await sendPasswordResetEmail({
          email:
            normalizedEmail,

          resetUrl,
        });
      } catch (
        error
      ) {
        user.resetPasswordTokenHash =
          undefined;

        user.resetPasswordExpires =
          undefined;

        await user.save();

        throw error;
      }

      res.status(200).json({
        success: true,

        message:
          genericMessage,
      });
    } catch (
      error
    ) {
      console.error(
        "FORGOT PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to process the password reset request.",
      });
    }
  };

/* =========================================================
   RESET PASSWORD
========================================================= */

export const resetPassword =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            req.body?.email
          )
        );

      const normalizedToken =
        toStringValue(
          req.body?.token
        ).trim();

      const normalizedPassword =
        toStringValue(
          req.body?.password
        );

      if (
        !normalizedEmail ||
        !normalizedToken ||
        !normalizedPassword
      ) {
        res.status(400).json({
          success: false,

          message:
            "Email, reset token and new password are required.",
        });

        return;
      }

      if (
        normalizedPassword.length <
        6
      ) {
        res.status(400).json({
          success: false,

          message:
            "Password must be at least 6 characters.",
        });

        return;
      }

      const tokenHash =
        crypto
          .createHash(
            "sha256"
          )
          .update(
            normalizedToken
          )
          .digest("hex");

      const user =
        await User.findOne({
          emailLookup:
            createLookupHash(
              normalizedEmail
            ),

          resetPasswordTokenHash:
            tokenHash,

          resetPasswordExpires: {
            $gt:
              new Date(),
          },
        }).select(
          "+password +resetPasswordTokenHash +resetPasswordExpires"
        );

      if (!user) {
        res.status(400).json({
          success: false,

          message:
            "Invalid or expired password reset link.",
        });

        return;
      }

      user.password =
        await hashPassword(
          normalizedPassword
        );

      user.passwordPolicyVersion =
        isStrongSecurityPassword(
          normalizedPassword
        )
          ? 2
          : 1;

      user.passwordChangedAt =
        new Date();

      user.authVersion =
        (user.authVersion ?? 0) +
        1;

      user.resetPasswordTokenHash =
        undefined;

      user.resetPasswordExpires =
        undefined;

      await user.save();

      await revokeAllSessions(
        user._id.toString()
      );

      await respondWithAuthenticatedUser({
        user,
        req,
        res,

        message:
          "Password reset successfully.",
      });
    } catch (
      error
    ) {
      console.error(
        "RESET PASSWORD ERROR:",
        error
      );

      if (
        res.headersSent
      ) {
        return;
      }

      res.status(500).json({
        success: false,

        message:
          "Unable to reset password.",
      });
    }
  };

/* =========================================================
   LOGOUT CURRENT SESSION
========================================================= */

export const logoutUser =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      await revokeCurrentSessionFromRequest(
        req
      );

      clearAuthCookie(
        res
      );

      res.status(200).json({
        success: true,

        message:
          "Logged out successfully.",
      });
    } catch (
      error
    ) {
      console.error(
        "LOGOUT ERROR:",
        error
      );

      clearAuthCookie(
        res
      );

      res.status(200).json({
        success: true,

        message:
          "Logged out.",
      });
    }
  };

/* =========================================================
   GET ACTIVE SESSIONS
   GET /api/auth/sessions
========================================================= */

export const getActiveSessions =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      res.setHeader(
        "Cache-Control",
        "private, no-store, max-age=0"
      );

      if (!req.user?._id) {
        res.status(401).json({
          success: false,

          message:
            "Not authorized",
        });

        return;
      }

      const userId =
        req.user._id.toString();

      const currentSessionId =
        getCurrentSessionId(
          req
        );

      const sessions =
        await AuthSession.find({
          userId,

          revokedAt: {
            $exists:
              false,
          },

          expiresAt: {
            $gt:
              new Date(),
          },
        })
          .sort({
            lastActiveAt:
              -1,
          })
          .select(
            [
              "sessionId",
              "device",
              "browser",
              "os",
              "location",
              "maskedIp",
              "lastActiveAt",
              "expiresAt",
              "createdAt",
              "updatedAt",
            ].join(" ")
          )
          .lean();

      const safeSessions =
        sessions.map(
          (
            session
          ) => ({
            sessionId:
              session.sessionId,

            device:
              session.device,

            browser:
              session.browser,

            os:
              session.os,

            location:
              session.location,

            maskedIp:
              session.maskedIp,

            lastActiveAt:
              session.lastActiveAt,

            expiresAt:
              session.expiresAt,

            createdAt:
              session.createdAt,

            isCurrent:
              session.sessionId ===
              currentSessionId,
          })
        );

      res.status(200).json({
        success: true,

        count:
          safeSessions.length,

        sessions:
          safeSessions,
      });
    } catch (
      error
    ) {
      console.error(
        "GET ACTIVE SESSIONS ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to load active sessions.",
      });
    }
  };

/* =========================================================
   LOGOUT ONE SESSION
   DELETE /api/auth/sessions/:sessionId
========================================================= */

export const logoutSession =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      res.setHeader(
        "Cache-Control",
        "private, no-store, max-age=0"
      );

      if (!req.user?._id) {
        res.status(401).json({
          success: false,

          message:
            "Not authorized",
        });

        return;
      }

      const userId =
        req.user._id.toString();

      const rawSessionId =
        req.params.sessionId;

      const sessionId =
        Array.isArray(
          rawSessionId
        )
          ? rawSessionId[0]
          : rawSessionId;

      if (
        typeof sessionId !==
          "string" ||
        !sessionId.trim()
      ) {
        res.status(400).json({
          success: false,

          message:
            "A valid session ID is required.",
        });

        return;
      }

      const currentSessionId =
        getCurrentSessionId(
          req
        );

      if (
        currentSessionId &&
        currentSessionId ===
          sessionId.trim()
      ) {
        res.status(400).json({
          success: false,

          code:
            "CURRENT_SESSION",

          message:
            "This is your current session. Use logout to sign out from this device.",
        });

        return;
      }

      const revoked =
        await revokeSessionById({
          userId,

          sessionId:
            sessionId.trim(),
        });

      if (!revoked) {
        res.status(404).json({
          success: false,

          message:
            "Active session not found.",
        });

        return;
      }

      try {
        await recordSecurityEvent({
          userId,

          eventType:
            "SESSION_REVOKED",

          title:
            "Device session signed out",

          status:
            "info",

          detail:
            "An authenticated device session was revoked from Security Center.",

          req,
        });
      } catch (
        eventError
      ) {
        console.error(
          "SESSION REVOKE EVENT ERROR:",
          eventError
        );
      }

      res.status(200).json({
        success: true,

        message:
          "The selected device has been logged out.",
      });
    } catch (
      error
    ) {
      console.error(
        "LOGOUT SESSION ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to log out this device.",
      });
    }
  };

/* =========================================================
   LOGOUT ALL OTHER SESSIONS
   DELETE /api/auth/sessions/others
========================================================= */

export const logoutOtherSessions =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      res.setHeader(
        "Cache-Control",
        "private, no-store, max-age=0"
      );

      if (!req.user?._id) {
        res.status(401).json({
          success: false,

          message:
            "Not authorized",
        });

        return;
      }

      const userId =
        req.user._id.toString();

      const currentSessionId =
        getCurrentSessionId(
          req
        );

      if (!currentSessionId) {
        res.status(401).json({
          success: false,

          message:
            "Current session could not be identified.",
        });

        return;
      }

      const revokedCount =
        await revokeAllOtherSessions({
          userId,

          currentSessionId,
        });

      try {
        await recordSecurityEvent({
          userId,

          eventType:
            "SESSION_REVOKED",

          title:
            "Other device sessions signed out",

          status:
            "info",

          detail:
            `All other active sessions were revoked from Security Center. ${revokedCount} session(s) were affected.`,

          sessionId:
            currentSessionId,

          req,
        });
      } catch (
        eventError
      ) {
        console.error(
          "REVOKE OTHER SESSIONS EVENT ERROR:",
          eventError
        );
      }

      res.status(200).json({
        success: true,

        revokedCount,

        message:
          revokedCount > 0
            ? `${revokedCount} other device session(s) have been logged out.`
            : "No other active device sessions were found.",
      });
    } catch (
      error
    ) {
      console.error(
        "LOGOUT OTHER SESSIONS ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to log out other devices.",
      });
    }
  };