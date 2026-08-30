import {
  AuthSession,
} from "../models/AuthSession.js";
import {
  SecurityEvent,
} from "../models/SecurityEvent.js";
import {
  SecurityPreferences,
} from "../models/SecurityPreferences.js";
import {
  User,
} from "../models/User.js";
import {
  WalletSecurityLock,
} from "../models/WalletSecurityLock.js";

export interface SecurityScoreResult {
  score: number;
  riskLevel:
    | "Low"
    | "Moderate"
    | "Elevated";
  checklist: {
    emailVerified: boolean;
    kycCompleted: boolean;
    strongPassword: boolean;
    twoFactorEnabled: boolean;
  };
  metrics: {
    activeSessions: number;
    failedLogins30d: number;
    enabledAlerts: number;
    walletFrozen: boolean;
  };
  lastSecurityCheckAt:
    | Date
    | null;
}

export const calculateSecurityScore =
  async (
    userId: string
  ): Promise<SecurityScoreResult> => {
    const since =
      new Date(
        Date.now() -
          30 *
            24 *
            60 *
            60 *
            1000
      );

    const [
      user,
      preferences,
      activeSessions,
      failedLogins30d,
      lock,
    ] = await Promise.all([
      User.findById(
        userId
      ).select(
        "kycStatus emailVerified passwordPolicyVersion"
      ),

      SecurityPreferences.findOne({
        userId,
      }),

      AuthSession.countDocuments({
        userId,
        revokedAt: {
          $exists: false,
        },
        expiresAt: {
          $gt:
            new Date(),
        },
      }),

      SecurityEvent.countDocuments({
        userId,
        eventType:
          "LOGIN_FAILED",
        createdAt: {
          $gte:
            since,
        },
      }),

      WalletSecurityLock.findOne({
        userId,
      }).select(
        "frozen"
      ),
    ]);

    if (!user) {
      throw new Error(
        "User not found."
      );
    }

    const alerts =
      preferences?.alerts ?? {
        newDevice: true,
        suspiciousActivity: true,
        failedLogin: true,
      };

    const enabledAlerts =
      Object.values(
        alerts
      ).filter(Boolean).length;

    const emailVerified =
      Boolean(
        user.emailVerified
      );

    const kycCompleted =
      user.kycStatus ===
      "verified";

    const strongPassword =
      Number(
        user.passwordPolicyVersion ??
          1
      ) >= 2;

    const twoFactorEnabled =
      Boolean(
        preferences?.twoFactor
          ?.enabled
      );

    let score = 0;

    if (twoFactorEnabled) {
      score += 25;
    }

    if (emailVerified) {
      score += 10;
    }

    if (kycCompleted) {
      score += 10;
    }

    if (strongPassword) {
      score += 15;
    }

    score +=
      Math.round(
        (enabledAlerts / 3) *
          15
      );

    if (
      failedLogins30d === 0
    ) {
      score += 10;
    } else if (
      failedLogins30d <= 2
    ) {
      score += 5;
    }

    if (
      activeSessions <= 3
    ) {
      score += 10;
    } else if (
      activeSessions <= 5
    ) {
      score += 5;
    }

    if (
      preferences?.lastSecurityCheckAt
    ) {
      const freshEnough =
        Date.now() -
          preferences.lastSecurityCheckAt.getTime() <
        30 *
          24 *
          60 *
          60 *
          1000;

      if (freshEnough) {
        score += 5;
      }
    }

    score = Math.max(
      0,
      Math.min(
        100,
        score
      )
    );

    const riskLevel =
      score >= 90
        ? "Low"
        : score >= 75
          ? "Moderate"
          : "Elevated";

    return {
      score,
      riskLevel,
      checklist: {
        emailVerified,
        kycCompleted,
        strongPassword,
        twoFactorEnabled,
      },
      metrics: {
        activeSessions,
        failedLogins30d,
        enabledAlerts,
        walletFrozen:
          Boolean(
            lock?.frozen
          ),
      },
      lastSecurityCheckAt:
        preferences
          ?.lastSecurityCheckAt ??
        null,
    };
  };
