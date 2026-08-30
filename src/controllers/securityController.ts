import crypto from "crypto";
import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  User,
} from "../models/User.js";
import {
  AuthSession,
} from "../models/AuthSession.js";
import {
  SecurityEvent,
} from "../models/SecurityEvent.js";
import {
  SecurityPreferences,
  type TwoFactorMethod,
} from "../models/SecurityPreferences.js";
import {
  WalletSecurityLock,
} from "../models/WalletSecurityLock.js";

import {
  encryptData,
  decryptData,
} from "../utils/crypto.js";
import {
  hashPassword,
  verifyPassword,
} from "../utils/password.js";



import {
  recordSecurityEvent,
} from "../services/securityEventService.js";
import { calculateSecurityScore } from "../services/securityScoreService.js";
import { getTwoFactorDeliveryAvailability } from "../services/securityDeliveryService.js";
import { issueAuthenticatedSession, revokeAllOtherSessions, revokeAllSessions, revokeSessionById } from "../services/authSessionService.js";
import { buildOtpAuthUri, generateTotpSecret, verifyTotp } from "../services/totpService.js";


const toStringValue = (
  value: unknown
): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value[0];

    return typeof first === "string"
      ? first
      : "";
  }

  return "";
};

const getUserId = (
  req: AuthRequest,
  res: Response
): string | null => {
  const userId =
    req.user?._id;

  if (!userId) {
    res.status(401).json({
      success: false,
      message:
        "Not authorized.",
    });
    return null;
  }

  return userId;
};

const ensurePreferences =
  async (
    userId: string
  ) => {
    return SecurityPreferences.findOneAndUpdate(
      {
        userId,
      },
      {
        $setOnInsert: {
          userId,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  };

const verifyCurrentPassword =
  async ({
    userId,
    password,
  }: {
    userId: string;
    password: string;
  }) => {
    const user =
      await User.findById(
        userId
      ).select(
        "+password role authVersion emailEncrypted phoneEncrypted"
      );

    if (!user) {
      return {
        ok: false as const,
        user: null,
      };
    }

    const storedPassword =
      user.get(
        "password"
      ) as
        | string
        | undefined;

    if (!storedPassword) {
      return {
        ok: false as const,
        user,
      };
    }

    const matched =
      await verifyPassword(
        storedPassword,
        password
      );

    return {
      ok: matched,
      user,
    };
  };

const getBackupHashKey =
  (): string => {
    const value =
      process.env.LOOKUP_HMAC_KEY ||
      process.env.JWT_SECRET;

    if (!value) {
      throw new Error(
        "LOOKUP_HMAC_KEY or JWT_SECRET is required for backup codes."
      );
    }

    return value;
  };

const normalizeBackupCode = (
  value: string
): string => {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
};

const hashBackupCode = (
  value: string
): string => {
  return crypto
    .createHmac(
      "sha256",
      getBackupHashKey()
    )
    .update(
      normalizeBackupCode(
        value
      )
    )
    .digest("hex");
};

const createBackupCodes = (): {
  rawCodes: string[];
  hashes: string[];
} => {
  const rawCodes =
    Array.from(
      {
        length: 10,
      },
      () => {
        const raw = crypto
          .randomBytes(5)
          .toString("hex")
          .toUpperCase();

        return `${raw.slice(
          0,
          5
        )}-${raw.slice(5)}`;
      }
    );

  return {
    rawCodes,
    hashes:
      rawCodes.map(
        hashBackupCode
      ),
  };
};

const redactMethodTarget = (
  value: string
): string => {
  if (!value) {
    return "Not available";
  }

  if (value.includes("@")) {
    const [name, domain] =
      value.split("@");

    return `${name?.slice(
      0,
      2
    ) ?? ""}***@${domain ?? ""}`;
  }

  if (value.length > 4) {
    return `***${value.slice(
      -4
    )}`;
  }

  return "***";
};

/* =========================================================
   OVERVIEW
   GET /api/security/overview
========================================================= */

export const getSecurityOverview =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const preferences =
        await ensurePreferences(
          userId
        );

      const score =
        await calculateSecurityScore(
          userId
        );

      const delivery =
        getTwoFactorDeliveryAvailability();

      res.status(200).json({
        success: true,
        security: {
          score:
            score.score,
          riskLevel:
            score.riskLevel,
          checklist:
            score.checklist,
          metrics:
            score.metrics,
          lastSecurityCheckAt:
            score.lastSecurityCheckAt,
        },
        twoFactor: {
          enabled:
            preferences.twoFactor.enabled,
          method:
            preferences.twoFactor.method,
          deliveryAvailability:
            delivery,
        },
        alerts:
          preferences.alerts,
      });
    } catch (error) {
      console.error(
        "GET SECURITY OVERVIEW ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load Security Center.",
      });
    }
  };

/* =========================================================
   SESSIONS
========================================================= */

export const getSessions =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const sessions =
        await AuthSession.find({
          userId,
          revokedAt: {
            $exists: false,
          },
          expiresAt: {
            $gt:
              new Date(),
          },
        })
          .sort({
            lastActiveAt: -1,
          })
          .lean();

      res.status(200).json({
        success: true,
        count:
          sessions.length,
        sessions:
          sessions.map(
            (session) => ({
              id:
                session.sessionId,
              device:
                session.device,
              browser:
                session.browser,
              os:
                session.os,
              location:
                session.location,
              ip:
                session.maskedIp,
              lastActiveAt:
                session.lastActiveAt,
              createdAt:
                session.createdAt,
              expiresAt:
                session.expiresAt,
              isCurrent:
                Boolean(
                  req.user
                    ?.sessionId &&
                    req.user
                      .sessionId ===
                      session.sessionId
                ),
            })
          ),
      });
    } catch (error) {
      console.error(
        "GET SECURITY SESSIONS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load active sessions.",
      });
    }
  };

export const revokeSession =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const sessionId =
        toStringValue(
          req.params.sessionId
        ).trim();

      if (!sessionId) {
        res.status(400).json({
          success: false,
          message:
            "Session id is required.",
        });
        return;
      }

      if (
        req.user?.sessionId ===
        sessionId
      ) {
        res.status(400).json({
          success: false,
          message:
            "Use the normal logout action for the current session.",
        });
        return;
      }

      const revoked =
        await revokeSessionById({
          userId,
          sessionId,
        });

      if (!revoked) {
        res.status(404).json({
          success: false,
          message:
            "Active session not found.",
        });
        return;
      }

      await recordSecurityEvent({
        userId,
        eventType:
          "SESSION_REVOKED",
        title:
          "Device session signed out",
        status:
          "info",
        detail:
          "A saved device session was revoked from Security Center.",
        sessionId:
          req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        message:
          "Session signed out successfully.",
      });
    } catch (error) {
      console.error(
        "REVOKE SESSION ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to sign out the session.",
      });
    }
  };

export const logoutOtherSessions =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const currentSessionId =
        req.user?.sessionId;

      if (!currentSessionId) {
        res.status(409).json({
          success: false,
          code:
            "LEGACY_SESSION",
          message:
            "Please sign in again before managing individual sessions.",
        });
        return;
      }

      const revokedCount =
        await revokeAllOtherSessions({
          userId,
          currentSessionId,
        });

      await recordSecurityEvent({
        userId,
        eventType:
          "OTHER_SESSIONS_REVOKED",
        title:
          "Other devices signed out",
        status:
          "info",
        detail:
          `${revokedCount} other session(s) were revoked.`,
        sessionId:
          currentSessionId,
        req,
      });

      res.status(200).json({
        success: true,
        revokedCount,
        message:
          "Other sessions signed out successfully.",
      });
    } catch (error) {
      console.error(
        "LOGOUT OTHER SESSIONS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to sign out other sessions.",
      });
    }
  };

/* =========================================================
   ACTIVITY
========================================================= */

export const getSecurityActivity =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const page = Math.max(
        1,
        Number(
          req.query.page
        ) || 1
      );

      const limit = Math.min(
        100,
        Math.max(
          1,
          Number(
            req.query.limit
          ) || 20
        )
      );

      const skip =
        (page - 1) *
        limit;

      const [
        events,
        total,
      ] = await Promise.all([
        SecurityEvent.find({
          userId,
        })
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        SecurityEvent.countDocuments({
          userId,
        }),
      ]);

      res.status(200).json({
        success: true,
        events:
          events.map(
            (event) => ({
              id:
                String(
                  event._id
                ),
              type:
                event.eventType,
              title:
                event.title,
              status:
                event.status,
              detail:
                event.detail ??
                "",
              device:
                event.device ??
                "",
              location:
                event.location ??
                "",
              ip:
                event.maskedIp ??
                "",
              createdAt:
                event.createdAt,
            })
          ),
        pagination: {
          page,
          limit,
          total,
          pages:
            Math.max(
              1,
              Math.ceil(
                total / limit
              )
            ),
        },
      });
    } catch (error) {
      console.error(
        "GET SECURITY ACTIVITY ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load security activity.",
      });
    }
  };

/* =========================================================
   SECURITY CHECK
========================================================= */

export const runSecurityCheck =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      await SecurityPreferences.findOneAndUpdate(
        {
          userId,
        },
        {
          $set: {
            lastSecurityCheckAt:
              new Date(),
          },
          $inc: {
            securityCheckCount:
              1,
          },
          $setOnInsert: {
            userId,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      const result =
        await calculateSecurityScore(
          userId
        );

      await recordSecurityEvent({
        userId,
        eventType:
          "SECURITY_CHECK_RUN",
        title:
          "Security check completed",
        status:
          result.riskLevel ===
          "Elevated"
            ? "warning"
            : "success",
        detail:
          `Security score ${result.score}/100 with ${result.riskLevel.toLowerCase()} risk.`,
        sessionId:
          req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        security:
          result,
      });
    } catch (error) {
      console.error(
        "RUN SECURITY CHECK ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Security check failed.",
      });
    }
  };

/* =========================================================
   ALERT PREFERENCES
========================================================= */

export const getAlertPreferences =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const preferences =
        await ensurePreferences(
          userId
        );

      res.status(200).json({
        success: true,
        alerts:
          preferences.alerts,
      });
    } catch (error) {
      console.error(
        "GET SECURITY ALERTS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load alert preferences.",
      });
    }
  };

export const updateAlertPreferences =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const allowed = [
        "newDevice",
        "suspiciousActivity",
        "failedLogin",
      ] as const;

      const updates:
        Record<
          string,
          boolean
        > = {};

      for (const key of allowed) {
        const value =
          req.body?.[key];

        if (
          value !== undefined
        ) {
          if (
            typeof value !==
            "boolean"
          ) {
            res.status(400).json({
              success: false,
              message:
                `${key} must be boolean.`,
            });
            return;
          }

          updates[
            `alerts.${key}`
          ] = value;
        }
      }

      if (
        Object.keys(updates)
          .length === 0
      ) {
        res.status(400).json({
          success: false,
          message:
            "No valid alert preference was provided.",
        });
        return;
      }

      const preferences =
        await SecurityPreferences.findOneAndUpdate(
          {
            userId,
          },
          {
            $set: updates,
            $setOnInsert: {
              userId,
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );

      await recordSecurityEvent({
        userId,
        eventType:
          "ALERT_PREFERENCES_UPDATED",
        title:
          "Security alert preferences updated",
        status:
          "info",
        sessionId:
          req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        message:
          "Alert preferences updated.",
        alerts:
          preferences.alerts,
      });
    } catch (error) {
      console.error(
        "UPDATE SECURITY ALERTS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to update alert preferences.",
      });
    }
  };

/* =========================================================
   2FA SETUP / MANAGEMENT
========================================================= */

export const startTwoFactorSetup =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const password =
        toStringValue(
          req.body?.password
        );

      if (!password) {
        res.status(400).json({
          success: false,
          message:
            "Current password is required to set up 2FA.",
        });
        return;
      }

      const auth =
        await verifyCurrentPassword({
          userId,
          password,
        });

      if (
        !auth.ok ||
        !auth.user
      ) {
        res.status(401).json({
          success: false,
          message:
            "Current password is incorrect.",
        });
        return;
      }

      const existing =
        await ensurePreferences(
          userId
        );

      if (
        existing.twoFactor.enabled
      ) {
        res.status(409).json({
          success: false,
          message:
            "Two-factor authentication is already enabled.",
        });
        return;
      }

      const secret =
        generateTotpSecret();

      const email =
        auth.user.emailEncrypted
          ? decryptData(
              auth.user.emailEncrypted
            )
          : auth.user._id.toString();

      existing.twoFactor.pendingSecretEncrypted =
        encryptData(secret);
      existing.twoFactor.method =
        "app";

      await existing.save();

      await recordSecurityEvent({
        userId,
        eventType:
          "TWO_FACTOR_SETUP_STARTED",
        title:
          "Two-factor setup started",
        status:
          "info",
        sessionId:
          req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        setup: {
          method:
            "app",
          secret,
          otpauthUri:
            buildOtpAuthUri({
              secret,
              accountLabel:
                email,
            }),
        },
        message:
          "Scan the otpauth URI with an authenticator app, then verify a code.",
      });
    } catch (error) {
      console.error(
        "START 2FA SETUP ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to start 2FA setup.",
      });
    }
  };

export const verifyTwoFactorSetup =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const code =
        toStringValue(
          req.body?.code
        ).trim();

      if (!code) {
        res.status(400).json({
          success: false,
          message:
            "Authenticator code is required.",
        });
        return;
      }

      const preferences =
        await SecurityPreferences.findOne({
          userId,
        }).select(
          "+twoFactor.backupCodeHashes"
        );

      const pending =
        preferences?.twoFactor
          ?.pendingSecretEncrypted;

      if (
        !preferences ||
        !pending
      ) {
        res.status(409).json({
          success: false,
          message:
            "No pending 2FA setup was found.",
        });
        return;
      }

      const secret =
        decryptData(pending);

      if (
        !verifyTotp(
          secret,
          code
        )
      ) {
        res.status(400).json({
          success: false,
          message:
            "Invalid authenticator code.",
        });
        return;
      }

      const backup =
        createBackupCodes();

      preferences.twoFactor.secretEncrypted =
        pending;
      preferences.twoFactor.pendingSecretEncrypted =
        undefined;
      preferences.twoFactor.enabled =
        true;
      preferences.twoFactor.method =
        "app";
      preferences.twoFactor.enabledAt =
        new Date();
      preferences.twoFactor.backupCodeHashes =
        backup.hashes;

      await preferences.save();

      await recordSecurityEvent({
        userId,
        eventType:
          "TWO_FACTOR_ENABLED",
        title:
          "Two-factor authentication enabled",
        status:
          "success",
        sessionId:
          req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        message:
          "Two-factor authentication enabled.",
        backupCodes:
          backup.rawCodes,
        warning:
          "These backup codes are shown once. Store them somewhere safe.",
      });
    } catch (error) {
      console.error(
        "VERIFY 2FA SETUP ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to verify 2FA setup.",
      });
    }
  };

export const disableTwoFactor =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const password =
        toStringValue(
          req.body?.password
        );

      const auth =
        await verifyCurrentPassword({
          userId,
          password,
        });

      if (
        !password ||
        !auth.ok
      ) {
        res.status(401).json({
          success: false,
          message:
            "Current password is required and must be correct.",
        });
        return;
      }

      const preferences =
        await SecurityPreferences.findOne({
          userId,
        }).select(
          "+twoFactor.backupCodeHashes"
        );

      if (
        !preferences?.twoFactor
          .enabled
      ) {
        res.status(409).json({
          success: false,
          message:
            "Two-factor authentication is not enabled.",
        });
        return;
      }

      preferences.twoFactor.enabled =
        false;
      preferences.twoFactor.method =
        "app";
      preferences.twoFactor.secretEncrypted =
        undefined;
      preferences.twoFactor.pendingSecretEncrypted =
        undefined;
      preferences.twoFactor.backupCodeHashes =
        [];
      preferences.twoFactor.enabledAt =
        undefined;

      await preferences.save();

      await recordSecurityEvent({
        userId,
        eventType:
          "TWO_FACTOR_DISABLED",
        title:
          "Two-factor authentication disabled",
        status:
          "warning",
        sessionId:
          req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        message:
          "Two-factor authentication disabled.",
      });
    } catch (error) {
      console.error(
        "DISABLE 2FA ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to disable 2FA.",
      });
    }
  };

export const updateTwoFactorMethod =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const method =
        toStringValue(
          req.body?.method
        ) as TwoFactorMethod;
      const password =
        toStringValue(
          req.body?.password
        );

      if (
        ![
          "app",
          "email",
          "sms",
        ].includes(method)
      ) {
        res.status(400).json({
          success: false,
          message:
            "Invalid 2FA method.",
        });
        return;
      }

      const auth =
        await verifyCurrentPassword({
          userId,
          password,
        });

      if (
        !password ||
        !auth.ok ||
        !auth.user
      ) {
        res.status(401).json({
          success: false,
          message:
            "Current password is required and must be correct.",
        });
        return;
      }

      const preferences =
        await ensurePreferences(
          userId
        );

      if (
        !preferences.twoFactor
          .enabled
      ) {
        res.status(409).json({
          success: false,
          message:
            "Enable 2FA before changing its primary method.",
        });
        return;
      }

      const delivery =
        getTwoFactorDeliveryAvailability();

      if (
        method === "email" &&
        !delivery.email
      ) {
        res.status(503).json({
          success: false,
          code:
            "EMAIL_2FA_NOT_CONFIGURED",
          message:
            "Email 2FA provider is not configured on the backend.",
        });
        return;
      }

      if (
        method === "sms" &&
        !delivery.sms
      ) {
        res.status(503).json({
          success: false,
          code:
            "SMS_2FA_NOT_CONFIGURED",
          message:
            "SMS 2FA provider is not configured on the backend.",
        });
        return;
      }

      if (
        method === "app" &&
        !preferences.twoFactor
          .secretEncrypted
      ) {
        res.status(409).json({
          success: false,
          message:
            "Authenticator setup is incomplete.",
        });
        return;
      }

      let target = "";

      if (
        method === "email" &&
        auth.user.emailEncrypted
      ) {
        target = decryptData(
          auth.user.emailEncrypted
        );
      }

      if (
        method === "sms" &&
        auth.user.phoneEncrypted
      ) {
        target = decryptData(
          auth.user.phoneEncrypted
        );
      }

      if (
        method !== "app" &&
        !target
      ) {
        res.status(409).json({
          success: false,
          message:
            method === "email"
              ? "No verified email is available for email 2FA."
              : "No phone number is available for SMS 2FA.",
        });
        return;
      }

      preferences.twoFactor.method =
        method;
      await preferences.save();

      await recordSecurityEvent({
        userId,
        eventType:
          "TWO_FACTOR_METHOD_CHANGED",
        title:
          "Two-factor method changed",
        status:
          "info",
        detail:
          `Primary method changed to ${method}.`,
        sessionId:
          req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        method,
        target:
          method === "app"
            ? "Authenticator app"
            : redactMethodTarget(
                target
              ),
        message:
          "Primary 2FA method updated.",
      });
    } catch (error) {
      console.error(
        "UPDATE 2FA METHOD ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to update the 2FA method.",
      });
    }
  };

export const regenerateBackupCodes =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const password =
        toStringValue(
          req.body?.password
        );

      const auth =
        await verifyCurrentPassword({
          userId,
          password,
        });

      if (
        !password ||
        !auth.ok
      ) {
        res.status(401).json({
          success: false,
          message:
            "Current password is required and must be correct.",
        });
        return;
      }

      const preferences =
        await SecurityPreferences.findOne({
          userId,
        }).select(
          "+twoFactor.backupCodeHashes"
        );

      if (
        !preferences?.twoFactor
          .enabled
      ) {
        res.status(409).json({
          success: false,
          message:
            "Enable 2FA before generating backup codes.",
        });
        return;
      }

      const backup =
        createBackupCodes();

      preferences.twoFactor.backupCodeHashes =
        backup.hashes;
      await preferences.save();

      await recordSecurityEvent({
        userId,
        eventType:
          "BACKUP_CODES_REGENERATED",
        title:
          "2FA backup codes regenerated",
        status:
          "info",
        sessionId:
          req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        backupCodes:
          backup.rawCodes,
        warning:
          "Old backup codes no longer work. New codes are shown only once.",
      });
    } catch (error) {
      console.error(
        "REGENERATE BACKUP CODES ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to regenerate backup codes.",
      });
    }
  };

/* =========================================================
   CHANGE PASSWORD
========================================================= */

export const changePassword =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const currentPassword =
        toStringValue(
          req.body?.currentPassword
        );
      const newPassword =
        toStringValue(
          req.body?.newPassword
        );

      if (
        !currentPassword ||
        !newPassword
      ) {
        res.status(400).json({
          success: false,
          message:
            "Current password and new password are required.",
        });
        return;
      }

      const strongPassword =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

      if (
        !strongPassword.test(
          newPassword
        )
      ) {
        res.status(400).json({
          success: false,
          code:
            "WEAK_PASSWORD",
          message:
            "New password must be 8-128 characters and include uppercase, lowercase and a number.",
        });
        return;
      }

      const auth =
        await verifyCurrentPassword({
          userId,
          password:
            currentPassword,
        });

      if (
        !auth.ok ||
        !auth.user
      ) {
        res.status(401).json({
          success: false,
          message:
            "Current password is incorrect.",
        });
        return;
      }

      const storedPassword =
        auth.user.get(
          "password"
        ) as string;

      const samePassword =
        await verifyPassword(
          storedPassword,
          newPassword
        );

      if (samePassword) {
        res.status(400).json({
          success: false,
          message:
            "New password must be different from the current password.",
        });
        return;
      }

      auth.user.password =
        await hashPassword(
          newPassword
        );
      auth.user.authVersion =
        (auth.user.authVersion ??
          0) + 1;
      auth.user.passwordPolicyVersion =
        2;
      auth.user.passwordChangedAt =
        new Date();

      await auth.user.save();

      await revokeAllSessions(
        userId
      );

      const session =
        await issueAuthenticatedSession({
          user:
            auth.user,
          req,
          res,
        });

      await recordSecurityEvent({
        userId,
        eventType:
          "PASSWORD_CHANGED",
        title:
          "Password changed",
        status:
          "success",
        detail:
          "All previous sessions were revoked after the password change.",
        sessionId:
          session.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        message:
          "Password changed successfully. Other sessions were signed out.",
      });
    } catch (error) {
      console.error(
        "CHANGE SECURITY PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to change password.",
      });
    }
  };

/* =========================================================
   WALLET FREEZE / UNFREEZE
========================================================= */

export const freezeWallet =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const password =
        toStringValue(
          req.body?.password
        );

      const auth =
        await verifyCurrentPassword({
          userId,
          password,
        });

      if (
        !password ||
        !auth.ok
      ) {
        res.status(401).json({
          success: false,
          message:
            "Current password is required to freeze the wallet.",
        });
        return;
      }

      const lock =
        await WalletSecurityLock.findOneAndUpdate(
          {
            userId,
          },
          {
            $set: {
              frozen: true,
              reason:
                "USER_SECURITY_FREEZE",
              frozenAt:
                new Date(),
              updatedBySessionId:
                req.user
                  ?.sessionId,
            },
            $unset: {
              unfrozenAt: 1,
            },
            $setOnInsert: {
              userId,
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );

      await recordSecurityEvent({
        userId,
        eventType:
          "WALLET_FROZEN",
        title:
          "Wallet security freeze enabled",
        status:
          "warning",
        detail:
          "Outbound wallet actions are blocked until the security freeze is removed.",
        sessionId:
          req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        wallet: {
          frozen:
            lock.frozen,
          frozenAt:
            lock.frozenAt,
        },
        message:
          "Wallet frozen successfully.",
      });
    } catch (error) {
      console.error(
        "FREEZE WALLET ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to freeze wallet.",
      });
    }
  };

export const unfreezeWallet =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        getUserId(
          req,
          res
        );

      if (!userId) return;

      const password =
        toStringValue(
          req.body?.password
        );

      const auth =
        await verifyCurrentPassword({
          userId,
          password,
        });

      if (
        !password ||
        !auth.ok
      ) {
        res.status(401).json({
          success: false,
          message:
            "Current password is required to unfreeze the wallet.",
        });
        return;
      }

      const lock =
        await WalletSecurityLock.findOne({
          userId,
        });

      if (
        !lock?.frozen
      ) {
        res.status(409).json({
          success: false,
          message:
            "Wallet is not currently frozen.",
        });
        return;
      }

      lock.frozen = false;
      lock.unfrozenAt =
        new Date();
      lock.updatedBySessionId =
        req.user?.sessionId;

      await lock.save();

      await recordSecurityEvent({
        userId,
        eventType:
          "WALLET_UNFROZEN",
        title:
          "Wallet security freeze removed",
        status:
          "success",
        sessionId:
          req.user?.sessionId,
        req,
      });

      res.status(200).json({
        success: true,
        wallet: {
          frozen: false,
          unfrozenAt:
            lock.unfrozenAt,
        },
        message:
          "Wallet unfrozen successfully.",
      });
    } catch (error) {
      console.error(
        "UNFREEZE WALLET ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to unfreeze wallet.",
      });
    }
  };
