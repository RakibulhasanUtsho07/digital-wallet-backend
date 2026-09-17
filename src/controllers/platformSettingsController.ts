import {
  Response,
} from "express";

import mongoose from "mongoose";

import {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  User,
} from "../models/User.js";

import {
  PlatformSettingsAudit,
} from "../models/PlatformSettingsAudit.js";

import {
  PLATFORM_DEFAULTS,
  getOrCreatePlatformSettings,
  settingsToDTO,
  updateSettingsAtomically,
} from "../services/platformSettingsService.js";

import {
  appendSettingsAudit,
  determineAuditSeverity,
  getChangedFields,
  verifyAuditChain,
} from "../services/platformSettingsAuditService.js";

import {
  validatePlatformSettings,
} from "../services/platformSettingsValidation.js";

import type {
  AdminSettingsPayload,
  Severity,
} from "../services/platformSettingsTypes.js";

import {
  verifyPassword,
} from "../utils/password.js";

const toStringValue =
  (
    value: unknown
  ): string => {
    return (
      typeof value ===
        "string"
        ? value
        : ""
    );
  };

const verifyAdminPassword =
  async (
    userId:
      string,
    password:
      string
  ): Promise<boolean> => {
    if (
      !password ||
      password.length >
        1024
    ) {
      return false;
    }

    const user =
      await User.findById(
        userId
      ).select(
        "+password role accountStatus"
      );

    if (
      !user ||
      user.role !==
        "admin"
    ) {
      return false;
    }

    if (
      user.get(
        "accountStatus"
      ) ===
        "deleted"
    ) {
      return false;
    }

    const hash =
      user.get(
        "password"
      ) as
        | string
        | undefined;

    if (!hash) {
      return false;
    }

    return verifyPassword(
      hash,
      password
    );
  };

const calculateConfigurationHealth =
  (
    settings:
      AdminSettingsPayload
  ): number => {
    let score =
      48;

    if (
      settings.security
        .requireMfa
    ) {
      score += 14;
    }

    if (
      settings.security
        .requireReauthForSensitiveActions
    ) {
      score += 12;
    }

    if (
      settings.risk
        .requireKycForHighValue
    ) {
      score += 8;
    }

    if (
      settings.security
        .maxLoginAttempts <=
      5
    ) {
      score += 6;
    }

    if (
      settings.security
        .sessionTimeoutMins <=
      60
    ) {
      score += 5;
    }

    if (
      settings.risk
        .maxTransfersPerWindow <=
      10
    ) {
      score += 4;
    }

    if (
      process.env
        .AUDIT_HMAC_KEY
    ) {
      score += 3;
    }

    return Math.min(
      score,
      100
    );
  };

const calculateRiskIndex =
  (
    settings:
      AdminSettingsPayload
  ): number => {
    const thresholdRatio =
      settings.risk
        .reviewThreshold /
      Math.max(
        settings.risk
          .dailyTransferLimit,
        1
      );

    const velocityRisk =
      settings.risk
        .maxTransfersPerWindow >
      10
        ? 22
        : settings.risk
              .maxTransfersPerWindow >
            7
          ? 12
          : 6;

    const base =
      Math.round(
        thresholdRatio *
          55
      ) +
      velocityRisk +
      (
        settings.risk
          .requireKycForHighValue
          ? 5
          : 20
      );

    return Math.min(
      Math.max(
        base,
        10
      ),
      95
    );
  };

const formatRelativeTime =
  (
    date:
      Date
  ): string => {
    const seconds =
      Math.max(
        Math.floor(
          (
            Date.now() -
            date.getTime()
          ) /
            1000
        ),
        0
      );

    if (
      seconds < 60
    ) {
      return "Just now";
    }

    const minutes =
      Math.floor(
        seconds /
          60
      );

    if (
      minutes < 60
    ) {
      return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
    }

    const hours =
      Math.floor(
        minutes /
          60
      );

    if (
      hours < 24
    ) {
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }

    const days =
      Math.floor(
        hours /
          24
      );

    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

const auditToDTO =
  (
    item: {
      _id:
        unknown;

      action:
        string;

      severity:
        Severity;

      changedSections?:
        string[];

      changedFields?:
        string[];

      sourceIpHash?:
        string;

      revision:
        number;

      occurredAt:
        Date;
    }
  ) => {
    const action =
      item.action ===
      "SETTINGS_RESET"
        ? "Platform settings reset"
        : "Platform configuration updated";

    const sections =
      item.changedSections ||
      [];

    return {
      id:
        String(
          item._id
        ),

      actor:
        "Platform Admin",

      action,

      detail:
        sections.length >
        0
          ? `Changed ${sections.join(", ")} configuration.`
          : "Platform configuration changed.",

      time:
        formatRelativeTime(
          new Date(
            item.occurredAt
          )
        ),

      severity:
        item.severity,

      /*
       * Never expose raw network identifiers.
       */
      ip:
        item.sourceIpHash
          ? `Protected • ${item.sourceIpHash.slice(-8)}`
          : "Protected",

      revision:
        item.revision,

      changedFields:
        item.changedFields ||
        [],
    };
  };

const getOverview =
  async (
    settings:
      AdminSettingsPayload
  ) => {
    const [
      activeUsers,
      adminUsers,
      pendingKyc,
    ] =
      await Promise.all([
        User.countDocuments({
          role:
            "user",

          accountStatus: {
            $ne:
              "deleted",
          },
        }),

        User.countDocuments({
          role:
            "admin",

          accountStatus: {
            $ne:
              "deleted",
          },
        }),

        User.countDocuments({
          kycStatus:
            "pending",

          accountStatus: {
            $ne:
              "deleted",
          },
        }),
      ]);

    return {
      activeUsers,
      adminUsers,
      pendingKyc,

      systemStatus:
        settings.platform
          .maintenanceMode
          ? "maintenance"
          : "operational",

      configurationHealth:
        calculateConfigurationHealth(
          settings
        ),

      riskIndex:
        calculateRiskIndex(
          settings
        ),

      services: {
        database:
          "healthy",

        api:
          "healthy",

        auth:
          process.env
              .JWT_SECRET &&
          process.env
              .AUDIT_HMAC_KEY
            ? "configured"
            : "review",
      },
    };
  };

export const getPlatformSettings =
  async (
    _req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    try {
      const settings =
        await getOrCreatePlatformSettings();

      const dto =
        settingsToDTO(
          settings
        );

      const [
        overview,
        recentAudit,
      ] =
        await Promise.all([
          getOverview(
            dto
          ),

          PlatformSettingsAudit.find()
            .sort({
              revision:
                -1,
            })
            .limit(
              20
            )
            .lean(),
        ]);

      res.status(
        200
      ).json({
        success:
          true,

        settings:
          dto,

        overview,

        auditItems:
          recentAudit.map(
            auditToDTO
          ),

        meta: {
          revision:
            settings.revision,

          updatedAt:
            settings.updatedAt,
        },
      });
    } catch (
      error
    ) {
      console.error(
        "GET PLATFORM SETTINGS ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to load platform settings.",
      });
    }
  };

export const updatePlatformSettings =
  async (
    req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    const userId =
      req.user?._id;

    if (!userId) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Not authorized.",
      });

      return;
    }

    const password =
      toStringValue(
        req.body
          ?.password
      );

    if (
      !password
    ) {
      res.status(
        400
      ).json({
        success:
          false,

        message:
          "Current admin password is required.",
      });

      return;
    }

    try {
      const validPassword =
        await verifyAdminPassword(
          userId,
          password
        );

      if (
        !validPassword
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "Current admin password is incorrect.",
        });

        return;
      }

      const validation =
        validatePlatformSettings(
          req.body
            ?.settings
        );

      if (
        !validation.ok
      ) {
        res.status(
          400
        ).json({
          success:
            false,

          message:
            validation.message,
        });

        return;
      }

      const session =
        await mongoose.startSession();

      let result:
        | {
            settings:
              AdminSettingsPayload;

            revision:
              number;

            updatedAt:
              Date;

            noChange:
              boolean;
          }
        | undefined;

      try {
        await session.withTransaction(
          async () => {
            const current =
              await getOrCreatePlatformSettings(
                session
              );

            const before =
              settingsToDTO(
                current
              );

            const after =
              validation.settings;

            const changes =
              getChangedFields(
                before,
                after
              );

            if (
              changes.fields
                .length === 0
            ) {
              result = {
                settings:
                  before,

                revision:
                  current.revision,

                updatedAt:
                  current.updatedAt,

                noChange:
                  true,
              };

              return;
            }

            const updated =
              await updateSettingsAtomically({
                currentRevision:
                  current.revision,

                nextSettings:
                  after,

                userId,

                session,
              });

            if (!updated) {
              throw new Error(
                "PLATFORM_SETTINGS_CONFLICT"
              );
            }

            const updatedDto =
              settingsToDTO(
                updated
              );

            await appendSettingsAudit({
              req,

              action:
                "SETTINGS_UPDATED",

              severity:
                determineAuditSeverity(
                  changes.fields
                ),

              revision:
                updated.revision,

              before,

              after:
                updatedDto,

              changedSections:
                changes.sections,

              changedFields:
                changes.fields,

              session,
            });

            result = {
              settings:
                updatedDto,

              revision:
                updated.revision,

              updatedAt:
                updated.updatedAt,

              noChange:
                false,
            };
          }
        );
      } finally {
        await session.endSession();
      }

      if (!result) {
        throw new Error(
          "Platform settings transaction did not return a result."
        );
      }

      res.status(
        200
      ).json({
        success:
          true,

        message:
          result.noChange
            ? "No platform setting changes were detected."
            : "Platform settings updated successfully.",

        settings:
          result.settings,

        meta: {
          revision:
            result.revision,

          updatedAt:
            result.updatedAt,
        },
      });
    } catch (
      error
    ) {
      if (
        error instanceof
          Error &&
        (
          error.message ===
            "PLATFORM_SETTINGS_CONFLICT" ||
          error.message.includes(
            "WriteConflict"
          )
        )
      ) {
        res.status(
          409
        ).json({
          success:
            false,

          code:
            "SETTINGS_CONFLICT",

          message:
            "Platform settings changed during this request. Reload the latest configuration and try again.",
        });

        return;
      }

      console.error(
        "UPDATE PLATFORM SETTINGS ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to update platform settings.",
      });
    }
  };

export const getPlatformSettingsAudit =
  async (
    req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    try {
      const severityRaw =
        toStringValue(
          req.query
            .severity
        );

      const page =
        Math.max(
          Number(
            req.query
              .page
          ) ||
            1,
          1
        );

      const limit =
        Math.min(
          Math.max(
            Number(
              req.query
                .limit
            ) ||
              25,
            1
          ),
          100
        );

      const filter:
        Record<
          string,
          unknown
        > = {};

      if (
        severityRaw ===
          "normal" ||
        severityRaw ===
          "warning" ||
        severityRaw ===
          "critical"
      ) {
        filter.severity =
          severityRaw;
      }

      const [
        total,
        records,
      ] =
        await Promise.all([
          PlatformSettingsAudit.countDocuments(
            filter
          ),

          PlatformSettingsAudit.find(
            filter
          )
            .sort({
              revision:
                -1,
            })
            .skip(
              (
                page -
                1
              ) *
                limit
            )
            .limit(
              limit
            )
            .lean(),
        ]);

      res.status(
        200
      ).json({
        success:
          true,

        count:
          records.length,

        total,

        page,

        pages:
          Math.max(
            Math.ceil(
              total /
                limit
            ),
            1
          ),

        auditItems:
          records.map(
            auditToDTO
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "GET PLATFORM SETTINGS AUDIT ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to load platform settings audit.",
      });
    }
  };

export const verifyPlatformSettingsAudit =
  async (
    _req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    try {
      const verification =
        await verifyAuditChain();

      res.status(
        verification.valid
          ? 200
          : 409
      ).json({
        success:
          verification.valid,

        audit:
          verification,
      });
    } catch (
      error
    ) {
      console.error(
        "VERIFY PLATFORM AUDIT ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to verify platform audit integrity.",
      });
    }
  };

export const resetPlatformSettings =
  async (
    req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    const userId =
      req.user?._id;

    if (!userId) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Not authorized.",
      });

      return;
    }

    const password =
      toStringValue(
        req.body
          ?.password
      );

    const confirmation =
      toStringValue(
        req.body
          ?.confirmation
      )
        .trim()
        .toUpperCase();

    if (
      confirmation !==
      "RESET"
    ) {
      res.status(
        400
      ).json({
        success:
          false,

        message:
          'Type "RESET" to confirm platform settings reset.',
      });

      return;
    }

    try {
      const validPassword =
        await verifyAdminPassword(
          userId,
          password
        );

      if (
        !validPassword
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "Current admin password is incorrect.",
        });

        return;
      }

      const session =
        await mongoose.startSession();

      let result:
        | {
            settings:
              AdminSettingsPayload;

            revision:
              number;

            updatedAt:
              Date;

            noChange:
              boolean;
          }
        | undefined;

      try {
        await session.withTransaction(
          async () => {
            const current =
              await getOrCreatePlatformSettings(
                session
              );

            const before =
              settingsToDTO(
                current
              );

            const after =
              PLATFORM_DEFAULTS;

            const changes =
              getChangedFields(
                before,
                after
              );

            if (
              changes.fields
                .length === 0
            ) {
              result = {
                settings:
                  before,

                revision:
                  current.revision,

                updatedAt:
                  current.updatedAt,

                noChange:
                  true,
              };

              return;
            }

            const updated =
              await updateSettingsAtomically({
                currentRevision:
                  current.revision,

                nextSettings:
                  after,

                userId,

                session,
              });

            if (!updated) {
              throw new Error(
                "PLATFORM_SETTINGS_CONFLICT"
              );
            }

            const updatedDto =
              settingsToDTO(
                updated
              );

            await appendSettingsAudit({
              req,

              action:
                "SETTINGS_RESET",

              severity:
                "critical",

              revision:
                updated.revision,

              before,

              after:
                updatedDto,

              changedSections:
                changes.sections,

              changedFields:
                changes.fields,

              session,
            });

            result = {
              settings:
                updatedDto,

              revision:
                updated.revision,

              updatedAt:
                updated.updatedAt,

              noChange:
                false,
            };
          }
        );
      } finally {
        await session.endSession();
      }

      if (!result) {
        throw new Error(
          "Platform settings reset transaction returned no result."
        );
      }

      res.status(
        200
      ).json({
        success:
          true,

        message:
          result.noChange
            ? "Platform settings already match backend defaults."
            : "Platform settings reset successfully.",

        settings:
          result.settings,

        meta: {
          revision:
            result.revision,

          updatedAt:
            result.updatedAt,
        },
      });
    } catch (
      error
    ) {
      if (
        error instanceof
          Error &&
        (
          error.message ===
            "PLATFORM_SETTINGS_CONFLICT" ||
          error.message.includes(
            "WriteConflict"
          )
        )
      ) {
        res.status(
          409
        ).json({
          success:
            false,

          code:
            "SETTINGS_CONFLICT",

          message:
            "Platform settings changed during reset. Reload and try again.",
        });

        return;
      }

      console.error(
        "RESET PLATFORM SETTINGS ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to reset platform settings.",
      });
    }
  };
