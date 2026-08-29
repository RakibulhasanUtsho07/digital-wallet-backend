import mongoose, {
  type ClientSession,
} from "mongoose";

import {
  PlatformSettings,
} from "../models/PlatformSettings.js";

import type {
  AdminSettingsPayload,
} from "./platformSettingsTypes.js";

/* =========================================================
   PLATFORM DEFAULTS
========================================================= */

export const PLATFORM_DEFAULTS:
  AdminSettingsPayload = {
  platform: {
    maintenanceMode: false,
    allowSignups: true,
    defaultCurrency: "BDT",
  },

  risk: {
    dailyTransferLimit: 50000,
    reviewThreshold: 25000,
    requireKycForHighValue: true,
    velocityWindowMinutes: 30,
    maxTransfersPerWindow: 8,
  },

  security: {
    requireMfa: true,
    sessionTimeoutMins: 30,
    maxLoginAttempts: 5,
    requireReauthForSensitiveActions: true,
  },
};

/* =========================================================
   GET OR CREATE SINGLETON SETTINGS
========================================================= */

export const getOrCreatePlatformSettings =
  async (
    session?: ClientSession
  ) => {
    const query =
      PlatformSettings.findOne({
        key: "global",
      });

    if (session) {
      query.session(session);
    }

    const existing =
      await query;

    if (existing) {
      return existing;
    }

    try {
      const created =
        await PlatformSettings.create(
          [
            {
              key: "global",
              ...PLATFORM_DEFAULTS,
            },
          ],
          session
            ? {
                session,
              }
            : undefined
        );

      const settings =
        created[0];

      if (!settings) {
        throw new Error(
          "Failed to create platform settings."
        );
      }

      return settings;
    } catch (
      error: unknown
    ) {
      /*
       * If two first requests race to create the
       * singleton document, one can get duplicate-key.
       * Read the winner instead of failing.
       */
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (
          error as {
            code?: number;
          }
        ).code === 11000
      ) {
        const retry =
          PlatformSettings.findOne({
            key: "global",
          });

        if (session) {
          retry.session(session);
        }

        const created =
          await retry;

        if (created) {
          return created;
        }
      }

      throw error;
    }
  };

/* =========================================================
   SAFE DTO
========================================================= */

export const settingsToDTO =
  (
    settings: {
      platform: {
        maintenanceMode: boolean;
        allowSignups: boolean;
        defaultCurrency:
          | "BDT"
          | "USD"
          | "EUR";
      };

      risk: {
        dailyTransferLimit: number;
        reviewThreshold: number;
        requireKycForHighValue: boolean;
        velocityWindowMinutes: number;
        maxTransfersPerWindow: number;
      };

      security: {
        requireMfa: boolean;
        sessionTimeoutMins: number;
        maxLoginAttempts: number;
        requireReauthForSensitiveActions: boolean;
      };
    }
  ): AdminSettingsPayload => {
    return {
      platform: {
        maintenanceMode:
          settings.platform
            .maintenanceMode,

        allowSignups:
          settings.platform
            .allowSignups,

        defaultCurrency:
          settings.platform
            .defaultCurrency,
      },

      risk: {
        dailyTransferLimit:
          settings.risk
            .dailyTransferLimit,

        reviewThreshold:
          settings.risk
            .reviewThreshold,

        requireKycForHighValue:
          settings.risk
            .requireKycForHighValue,

        velocityWindowMinutes:
          settings.risk
            .velocityWindowMinutes,

        maxTransfersPerWindow:
          settings.risk
            .maxTransfersPerWindow,
      },

      security: {
        requireMfa:
          settings.security
            .requireMfa,

        sessionTimeoutMins:
          settings.security
            .sessionTimeoutMins,

        maxLoginAttempts:
          settings.security
            .maxLoginAttempts,

        requireReauthForSensitiveActions:
          settings.security
            .requireReauthForSensitiveActions,
      },
    };
  };

/* =========================================================
   ATOMIC SETTINGS UPDATE
========================================================= */

export const updateSettingsAtomically =
  async ({
    currentRevision,
    nextSettings,
    userId,
    session,
  }: {
    currentRevision: number;
    nextSettings: AdminSettingsPayload;
    userId: string;
    session: ClientSession;
  }) => {
    /*
     * revision in the query gives optimistic concurrency.
     * If another admin already changed the configuration,
     * this update returns null instead of overwriting it.
     */
    return PlatformSettings.findOneAndUpdate(
      {
        key: "global",
        revision:
          currentRevision,
      },
      {
        $set: {
          platform:
            nextSettings.platform,

          risk:
            nextSettings.risk,

          security:
            nextSettings.security,

          updatedBy:
            new mongoose.Types.ObjectId(
              userId
            ),
        },

        $inc: {
          revision: 1,
        },
      },
      {
        new: true,
        runValidators: true,
        session,
      }
    );
  };
