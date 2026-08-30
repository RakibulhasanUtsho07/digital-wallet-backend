import crypto from "crypto";
import type {
  Request,
  Response,
} from "express";

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
  sendPasswordResetEmail,
} from "../utils/email.js";

import {
  issueAuthenticatedSession,
  clearAuthCookie,
  revokeAllSessions,
  revokeCurrentSessionFromRequest,
} from "../services/authSessionService.js";
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

const toStringValue = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value
    : "";
};

interface EncryptedContactValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

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

const getChallengeHashKey =
  (): string => {
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

const normalizeBackupCode = (
  value: string
): string => {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
};

const hashOneTimeCode = (
  value: string
): string => {
  return crypto
    .createHmac(
      "sha256",
      getChallengeHashKey()
    )
    .update(
      normalizeBackupCode(
        value
      )
    )
    .digest("hex");
};

const safeEqualHex = (
  a: string,
  b: string
): boolean => {
  try {
    const left = Buffer.from(
      a,
      "hex"
    );
    const right = Buffer.from(
      b,
      "hex"
    );

    return (
      left.length ===
        right.length &&
      crypto.timingSafeEqual(
        left,
        right
      )
    );
  } catch {
    return false;
  }
};

const isStrongSecurityPassword = (
  password: string
): boolean => {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(
    password
  );
};

const maskTarget = (
  value: string
): string => {
  if (!value) {
    return "Unavailable";
  }

  if (value.includes("@")) {
    const [name, domain] =
      value.split("@");

    return `${name?.slice(0, 2) ?? ""}***@${domain ?? ""}`;
  }

  return value.length > 4
    ? `***${value.slice(-4)}`
    : "***";
};

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
    const challengeId = crypto
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
      purpose:
        "login",
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
          code:
            rawCode,
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
          code:
            rawCode,
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
      },
    });
  };

/* =========================================================
   REGISTER
   POST /api/auth/register
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

      const existing =
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
        });

      if (existing) {
        res.status(409).json({
          success: false,
          message:
            "An account with this email or phone already exists.",
        });
        return;
      }

      const user =
        await User.create({
          name:
            normalizedName,
          emailEncrypted:
            encryptData(
              normalizedEmail
            ),
          emailLookup,
          phoneEncrypted:
            normalizedPhone
              ? encryptData(
                  normalizedPhone
                )
              : undefined,
          phoneLookup,
          password:
            await hashPassword(
              normalizedPassword
            ),
          emailVerified:
            false,
          passwordPolicyVersion:
            isStrongSecurityPassword(
              normalizedPassword
            )
              ? 2
              : 1,
          passwordChangedAt:
            new Date(),
        });

      try {
        const wallet =
          await Wallet.create({
            userId:
              user._id,
            balance: 0,
          });

        user.walletId =
          wallet._id;
        await user.save();
      } catch (walletError) {
        await User.deleteOne({
          _id:
            user._id,
        });
        throw walletError;
      }

      await SecurityPreferences.create({
        userId:
          user._id,
      });

      await respondWithAuthenticatedUser({
        user,
        req,
        res,
        message:
          "User registered successfully.",
      });
    } catch (error: any) {
      console.error(
        "REGISTER ERROR:",
        error
      );

      if (
        error?.code === 11000
      ) {
        res.status(409).json({
          success: false,
          message:
            "An account with this email or phone already exists.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message:
          "Registration failed. Please try again.",
      });
    }
  };

/* =========================================================
   LOGIN
   POST /api/auth/login
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
        user.get(
          "password"
        ) as
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

      const preferences =
        await SecurityPreferences.findOne({
          userId:
            user._id,
        });

      if (
        preferences?.twoFactor
          .enabled
      ) {
        const method =
          preferences.twoFactor
            .method;

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
      ] = await Promise.all([
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
            createdAt: -1,
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

      await respondWithAuthenticatedUser({
        user,
        req,
        res,
        message:
          "Login successful.",
      });

      if (!knownDevice) {
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
          req,
        });

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
      }

      if (locationChanged) {
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
      }
    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Login failed. Please try again.",
      });
    }
  };

/* =========================================================
   VERIFY LOGIN 2FA
   POST /api/auth/verify-2fa
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
      ] = await Promise.all([
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
          .enabled
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
        preferences.twoFactor
          .backupCodeHashes as string[];

      const backupIndex =
        backupCodeHashes.findIndex(
          (hash: string) =>
            safeEqualHex(
              hash,
              backupHash
            )
        );

      if (backupIndex >= 0) {
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
          preferences.twoFactor
            .secretEncrypted;

        if (encrypted) {
          const secret =
            decryptData(
              encrypted
            );

          verified =
            verifyTotp(
              secret,
              code
            );
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

        verified = Boolean(
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

      await respondWithAuthenticatedUser({
        user,
        req,
        res,
        message:
          "Login successful.",
      });
    } catch (error) {
      console.error(
        "VERIFY LOGIN 2FA ERROR:",
        error
      );

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

      const rawToken = crypto
        .randomBytes(32)
        .toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
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
      } catch (error) {
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
    } catch (error) {
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

      const tokenHash = crypto
        .createHash("sha256")
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
    } catch (error) {
      console.error(
        "RESET PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to reset password.",
      });
    }
  };

/* =========================================================
   LOGOUT
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
      clearAuthCookie(res);

      res.status(200).json({
        success: true,
        message:
          "Logged out successfully.",
      });
    } catch (error) {
      console.error(
        "LOGOUT ERROR:",
        error
      );

      /* Still clear the browser cookie even if DB revocation failed. */
      clearAuthCookie(res);

      res.status(200).json({
        success: true,
        message:
          "Logged out.",
      });
    }
  };
