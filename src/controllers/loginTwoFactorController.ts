import type {
  Request,
  Response,
} from "express";

import { User } from "../models/User.js";
import { AuthSession } from "../models/AuthSession.js";
import { SecurityPreferences } from "../models/SecurityPreferences.js";
import { TwoFactorChallenge } from "../models/TwoFactorChallenge.js";
import { decryptData } from "../utils/crypto.js";
import { issueAuthenticatedSession } from "../services/authSessionService.js";
import { getSecurityRequestMetadata } from "../services/securityRequestMetadata.js";
import { recordSecurityEvent } from "../services/securityEventService.js";
import { dispatchSecurityAlert } from "../services/securityAlertService.js";
import {
  TwoFactorOtpError,
  verifyTwoFactorOtp,
} from "../services/twoFactorOtpService.js";

function value(input: unknown): string {
  return typeof input === "string"
    ? input.trim()
    : "";
}

function decryptContact(
  input:
    | Parameters<typeof decryptData>[0]
    | undefined
): string {
  if (!input) return "";

  try {
    return decryptData(input);
  } catch {
    return "";
  }
}

export const verifyLoginTwoFactor = async (
  req: Request,
  res: Response
): Promise<void> => {
  let eventUserId = "";

  try {
    const challengeId = value(
      req.body?.challengeId
    );
    const code = value(req.body?.code);

    if (!challengeId || !code) {
      res.status(400).json({
        success: false,
        message:
          "Challenge id and the 6-digit verification code are required.",
      });
      return;
    }

    const pending =
      await TwoFactorChallenge.findOne({
        challengeId,
        purpose: "login",
        consumedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      }).select("userId method deliveryProvider");

    if (!pending) {
      res.status(400).json({
        success: false,
        code: "TWO_FACTOR_CHALLENGE_EXPIRED",
        message:
          "The verification challenge is invalid or expired. Sign in again.",
      });
      return;
    }

    eventUserId = pending.userId.toString();

    const [user, preferences] =
      await Promise.all([
        User.findById(pending.userId).select(
          "+emailEncrypted +phoneEncrypted"
        ),
        SecurityPreferences.findOne({
          userId: pending.userId,
          "twoFactor.enabled": true,
        }),
      ]);

    if (!user || !preferences) {
      res.status(400).json({
        success: false,
        message:
          "Two-factor configuration is no longer valid.",
      });
      return;
    }

    const configuredMethod =
      preferences.twoFactor.method === "sms"
        ? "sms"
        : "email";

    if (pending.method !== configuredMethod) {
      res.status(409).json({
        success: false,
        code: "TWO_FACTOR_METHOD_CHANGED",
        message:
          "Your two-factor method changed. Sign in again to request a new code.",
      });
      return;
    }

    const email = decryptContact(
      user.emailEncrypted
    );
    const phone = decryptContact(
      user.phoneEncrypted
    );

    await verifyTwoFactorOtp({
      userId: user._id.toString(),
      challengeId,
      purpose: "login",
      code,
      email,
      phone,
    });

    const metadata =
      getSecurityRequestMetadata(req);

    const [knownDevice, previousSessions] =
      await Promise.all([
        AuthSession.exists({
          userId: user._id,
          userAgentHash:
            metadata.userAgentHash,
        }),
        AuthSession.find({
          userId: user._id,
        })
          .select("location")
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

    const locationChanged =
      metadata.location !==
        "Unknown location" &&
      previousSessions.length > 0 &&
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
      userId: user._id.toString(),
      eventType: "LOGIN_SUCCESS",
      title: "Successful login",
      status: "success",
      detail:
        "A new authenticated session was created after two-factor verification.",
      sessionId: session.sessionId,
      req,
    });

    if (!knownDevice) {
      await recordSecurityEvent({
        userId: user._id.toString(),
        eventType: "SUSPICIOUS_LOGIN",
        title: "New device sign-in",
        status: "info",
        detail:
          "A verified login was created from a new device fingerprint.",
        sessionId: session.sessionId,
        req,
      }).catch(() => undefined);

      await dispatchSecurityAlert({
        userId: user._id.toString(),
        kind: "newDevice",
        title: "New device signed in",
        message:
          `A new ${metadata.device} session signed in from ${metadata.location}.`,
      }).catch(() => undefined);
    }

    if (locationChanged) {
      await dispatchSecurityAlert({
        userId: user._id.toString(),
        kind: "suspiciousActivity",
        title:
          "New sign-in location detected",
        message:
          `A successful sign-in was detected from ${metadata.location}. Review your active sessions if this was not you.`,
      }).catch(() => undefined);
    }

    res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        _id: user._id.toString(),
        name: user.name,
        email,
        phone,
        role: user.role,
        kycStatus: user.kycStatus,
        avatarUrl: user.avatarUrl ?? "",
      },
    });
  } catch (error) {
    if (eventUserId) {
      await recordSecurityEvent({
        userId: eventUserId,
        eventType: "LOGIN_FAILED",
        title:
          "Failed two-factor verification",
        status: "warning",
        detail:
          "The supplied two-factor verification code was invalid.",
        req,
      }).catch(() => undefined);
    }

    if (error instanceof TwoFactorOtpError) {
      res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
      return;
    }

    console.error(
      "VERIFY LOGIN 2FA ERROR:",
      error
    );
    res.status(500).json({
      success: false,
      message:
        "Unable to verify the two-factor code.",
    });
  }
};
