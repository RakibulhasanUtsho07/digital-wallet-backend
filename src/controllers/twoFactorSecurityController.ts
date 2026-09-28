import type { Response } from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";
import { User } from "../models/User.js";
import {
  SecurityPreferences,
  type OtpTwoFactorMethod as TwoFactorMethod,
} from "../models/SecurityPreferences.js";
import { decryptData } from "../utils/crypto.js";
import { verifyPassword } from "../utils/password.js";
import { recordSecurityEvent } from "../services/securityEventService.js";
import {
  requestTwoFactorOtp,
  TwoFactorOtpError,
  verifyTwoFactorOtp,
} from "../services/twoFactorOtpService.js";

function stringValue(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function methodValue(
  value: unknown
): TwoFactorMethod | null {
  return value === "email" || value === "sms"
    ? value
    : null;
}

function userIdFromRequest(
  req: AuthRequest,
  res: Response
): string | null {
  const userId = req.user?._id;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Not authorized.",
    });
    return null;
  }

  return userId;
}

async function authenticatedUser(
  userId: string,
  password: string
) {
  const user = await User.findById(userId).select(
    "+password +emailEncrypted +phoneEncrypted +emailVerified +emailVerifiedAt +accountStatus"
  );

  if (!user || user.accountStatus === "deleted") {
    return null;
  }

  const passwordHash = user.get("password") as
    | string
    | undefined;

  if (
    !password ||
    !passwordHash ||
    !(await verifyPassword(passwordHash, password))
  ) {
    return null;
  }

  return user;
}

type EncryptedContact =
  Parameters<typeof decryptData>[0];

type ContactBearingUser = {
  emailEncrypted?: EncryptedContact;
  phoneEncrypted?: EncryptedContact;
  get?: (path: string) => unknown;
};

function encryptedContact(
  user: ContactBearingUser,
  path: "emailEncrypted" | "phoneEncrypted"
): EncryptedContact | undefined {
  const selectedValue =
    typeof user.get === "function"
      ? user.get(path)
      : undefined;

  const value =
    selectedValue ?? user[path];

  if (
    !value ||
    typeof value !== "object"
  ) {
    return undefined;
  }

  const encrypted =
    value as EncryptedContact;

  if (
    !encrypted.encrypted ||
    !encrypted.iv ||
    !encrypted.authTag
  ) {
    return undefined;
  }

  return encrypted;
}

function contactsOf(
  user: ContactBearingUser
) {
  const emailEncrypted =
    encryptedContact(
      user,
      "emailEncrypted"
    );

  const phoneEncrypted =
    encryptedContact(
      user,
      "phoneEncrypted"
    );

  return {
    email: emailEncrypted
      ? decryptData(emailEncrypted)
      : "",
    phone: phoneEncrypted
      ? decryptData(phoneEncrypted)
      : "",
  };
}

function handleOtpError(
  error: unknown,
  res: Response,
  fallback: string
): void {
  if (error instanceof TwoFactorOtpError) {
    res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  console.error(fallback, error);
  res.status(500).json({
    success: false,
    message: fallback,
  });
}

export const startTwoFactorSetup = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = userIdFromRequest(req, res);
    if (!userId) return;

    const method = methodValue(req.body?.method);
    const password = stringValue(req.body?.password);

    if (!method) {
      res.status(400).json({
        success: false,
        message: "Choose email or SMS verification.",
      });
      return;
    }

    const user = await authenticatedUser(
      userId,
      password
    );

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
      return;
    }

    const preferences =
      await SecurityPreferences.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId } },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

    if (preferences.twoFactor.enabled) {
      res.status(409).json({
        success: false,
        message: "Two-factor authentication is already enabled.",
      });
      return;
    }

    if (method === "email" && !user.emailVerified) {
      res.status(409).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your account email before using email 2FA.",
      });
      return;
    }

    const challenge = await requestTwoFactorOtp({
      userId,
      purpose: "setup",
      method,
      ...contactsOf(user),
    });

    await recordSecurityEvent({
      userId,
      eventType: "TWO_FACTOR_SETUP_STARTED",
      title: "Two-factor setup started",
      status: "info",
      detail: `${method.toUpperCase()} verification selected.`,
      sessionId: req.user?.sessionId,
      req,
    });

    res.status(200).json({
      success: true,
      challenge,
      message: `A verification code was sent to ${challenge.target}.`,
    });
  } catch (error) {
    handleOtpError(
      error,
      res,
      "Failed to start 2FA setup."
    );
  }
};

export const verifyTwoFactorSetup = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = userIdFromRequest(req, res);
    if (!userId) return;

    const challengeId = stringValue(
      req.body?.challengeId
    );
    const code = stringValue(req.body?.code);

    if (!challengeId) {
      res.status(400).json({
        success: false,
        message: "A 2FA challenge id is required.",
      });
      return;
    }

    const user = await User.findById(userId).select(
      "+emailEncrypted +phoneEncrypted +emailVerified +emailVerifiedAt +accountStatus"
    );

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User account was not found.",
      });
      return;
    }

    const verified = await verifyTwoFactorOtp({
      userId,
      challengeId,
      purpose: "setup",
      code,
      ...contactsOf(user),
    });

    const preferences =
      await SecurityPreferences.findOneAndUpdate(
        { userId },
        {
          $set: {
            "twoFactor.enabled": true,
            "twoFactor.method": verified.method,
            "twoFactor.enabledAt": new Date(),
            "twoFactor.backupCodeHashes": [],
          },
          $unset: {
            "twoFactor.secretEncrypted": 1,
            "twoFactor.pendingSecretEncrypted": 1,
          },
        },
        { new: true, upsert: true }
      );

    await recordSecurityEvent({
      userId,
      eventType: "TWO_FACTOR_ENABLED",
      title: "Two-factor authentication enabled",
      status: "success",
      detail: `${verified.method.toUpperCase()} OTP is now required at every login.`,
      sessionId: req.user?.sessionId,
      req,
    });

    res.status(200).json({
      success: true,
      method: preferences.twoFactor.method,
      message: "Two-factor authentication is enabled.",
    });
  } catch (error) {
    handleOtpError(
      error,
      res,
      "Failed to verify 2FA setup."
    );
  }
};

export const disableTwoFactor = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = userIdFromRequest(req, res);
    if (!userId) return;

    const password = stringValue(req.body?.password);
    const user = await authenticatedUser(
      userId,
      password
    );

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
      return;
    }

    const result = await SecurityPreferences.updateOne(
      {
        userId,
        "twoFactor.enabled": true,
      },
      {
        $set: {
          "twoFactor.enabled": false,
          "twoFactor.method": "email",
          "twoFactor.backupCodeHashes": [],
        },
        $unset: {
          "twoFactor.enabledAt": 1,
          "twoFactor.secretEncrypted": 1,
          "twoFactor.pendingSecretEncrypted": 1,
        },
      }
    );

    if (result.modifiedCount !== 1) {
      res.status(409).json({
        success: false,
        message: "Two-factor authentication is not enabled.",
      });
      return;
    }

    await recordSecurityEvent({
      userId,
      eventType: "TWO_FACTOR_DISABLED",
      title: "Two-factor authentication disabled",
      status: "warning",
      sessionId: req.user?.sessionId,
      req,
    });

    res.status(200).json({
      success: true,
      message: "Two-factor authentication is disabled.",
    });
  } catch (error) {
    console.error("DISABLE 2FA ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Failed to disable 2FA.",
    });
  }
};

export const updateTwoFactorMethod = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = userIdFromRequest(req, res);
    if (!userId) return;

    const challengeId = stringValue(
      req.body?.challengeId
    );
    const code = stringValue(req.body?.code);

    const user = await User.findById(userId).select(
      "+password +emailEncrypted +phoneEncrypted +emailVerified +emailVerifiedAt +accountStatus"
    );

    if (!user || user.accountStatus === "deleted") {
      res.status(404).json({
        success: false,
        message: "User account was not found.",
      });
      return;
    }

    const preferences = await SecurityPreferences.findOne({
      userId,
      "twoFactor.enabled": true,
    });

    if (!preferences) {
      res.status(409).json({
        success: false,
        message: "Enable 2FA before changing its method.",
      });
      return;
    }

    if (challengeId) {
      const verified = await verifyTwoFactorOtp({
        userId,
        challengeId,
        purpose: "method_change",
        code,
        ...contactsOf(user),
      });

      preferences.twoFactor.method =
        verified.method;
      await preferences.save();

      await recordSecurityEvent({
        userId,
        eventType: "TWO_FACTOR_METHOD_CHANGED",
        title: "Two-factor method changed",
        status: "info",
        detail: `Primary method changed to ${verified.method}.`,
        sessionId: req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        method: verified.method,
        message: "Primary 2FA method updated.",
      });
      return;
    }

    const method = methodValue(req.body?.method);
    const password = stringValue(req.body?.password);

    if (!method) {
      res.status(400).json({
        success: false,
        message: "Choose email or SMS verification.",
      });
      return;
    }

    const passwordHash = user.get("password") as
      | string
      | undefined;

    if (
      !password ||
      !passwordHash ||
      !(await verifyPassword(passwordHash, password))
    ) {
      res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
      return;
    }

    if (method === "email" && !user.emailVerified) {
      res.status(409).json({
        success: false,
        message: "Verify your account email before using email 2FA.",
      });
      return;
    }

    const challenge = await requestTwoFactorOtp({
      userId,
      purpose: "method_change",
      method,
      ...contactsOf(user),
    });

    res.status(200).json({
      success: true,
      verificationRequired: true,
      challenge,
      message: `A verification code was sent to ${challenge.target}.`,
    });
  } catch (error) {
    handleOtpError(
      error,
      res,
      "Failed to update the 2FA method."
    );
  }
};

export const regenerateBackupCodes = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  res.status(410).json({
    success: false,
    code: "BACKUP_CODES_REMOVED",
    message:
      "Backup codes are not used by email/SMS OTP two-factor authentication.",
  });
};
