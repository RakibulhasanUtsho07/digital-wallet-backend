import crypto from "crypto";

import type {
  ClientSession,
} from "mongoose";

import {
  PlatformSettingsAudit,
  type PlatformAuditAction,
  type PlatformAuditSeverity,
} from "../models/PlatformSettingsAudit.js";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import type {
  AdminSettingsPayload,
} from "./platformSettingsTypes.js";

const getAuditKey =
  (): string => {
    const key =
      process.env
        .AUDIT_HMAC_KEY;

    if (
      !key ||
      key.length < 32
    ) {
      throw new Error(
        "AUDIT_HMAC_KEY must be configured with at least 32 characters."
      );
    }

    return key;
  };

const hmac =
  (
    value:
      string
  ): string => {
    return crypto
      .createHmac(
        "sha256",
        getAuditKey()
      )
      .update(
        value,
        "utf8"
      )
      .digest(
        "hex"
      );
  };

const canonicalSettings =
  (
    settings:
      AdminSettingsPayload
  ): string => {
    /*
     * Explicit property order makes the fingerprint stable.
     */
    return JSON.stringify({
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
    });
  };

export const fingerprintSettings =
  (
    settings:
      AdminSettingsPayload
  ): string => {
    return hmac(
      canonicalSettings(
        settings
      )
    );
  };

const hashRequestMetadata =
  (
    value:
      string | undefined
  ): string => {
    return hmac(
      value ||
        "unknown"
    );
  };

export const getRequestId =
  (
    req:
      AuthRequest
  ): string => {
    const supplied =
      req.get(
        "x-request-id"
      );

    if (
      supplied &&
      supplied.length <=
        100 &&
      /^[a-zA-Z0-9._:-]+$/.test(
        supplied
      )
    ) {
      return supplied;
    }

    return crypto
      .randomUUID();
  };

const getClientIp =
  (
    req:
      AuthRequest
  ): string => {
    const forwarded =
      req.headers[
        "x-forwarded-for"
      ];

    if (
      typeof forwarded ===
        "string"
    ) {
      return (
        forwarded
          .split(
            ","
          )[0]
          ?.trim() ||
        req.ip ||
        "unknown"
      );
    }

    return (
      req.ip ||
      "unknown"
    );
  };

export const getChangedFields =
  (
    before:
      AdminSettingsPayload,
    after:
      AdminSettingsPayload
  ): {
    sections:
      string[];

    fields:
      string[];
  } => {
    const fields:
      string[] = [];

    const compare =
      (
        path:
          string,
        left:
          unknown,
        right:
          unknown
      ) => {
        if (
          left !== right
        ) {
          fields.push(
            path
          );
        }
      };

    compare(
      "platform.maintenanceMode",
      before.platform
        .maintenanceMode,
      after.platform
        .maintenanceMode
    );

    compare(
      "platform.allowSignups",
      before.platform
        .allowSignups,
      after.platform
        .allowSignups
    );

    compare(
      "platform.defaultCurrency",
      before.platform
        .defaultCurrency,
      after.platform
        .defaultCurrency
    );

    compare(
      "risk.dailyTransferLimit",
      before.risk
        .dailyTransferLimit,
      after.risk
        .dailyTransferLimit
    );

    compare(
      "risk.reviewThreshold",
      before.risk
        .reviewThreshold,
      after.risk
        .reviewThreshold
    );

    compare(
      "risk.requireKycForHighValue",
      before.risk
        .requireKycForHighValue,
      after.risk
        .requireKycForHighValue
    );

    compare(
      "risk.velocityWindowMinutes",
      before.risk
        .velocityWindowMinutes,
      after.risk
        .velocityWindowMinutes
    );

    compare(
      "risk.maxTransfersPerWindow",
      before.risk
        .maxTransfersPerWindow,
      after.risk
        .maxTransfersPerWindow
    );

    compare(
      "security.requireMfa",
      before.security
        .requireMfa,
      after.security
        .requireMfa
    );

    compare(
      "security.sessionTimeoutMins",
      before.security
        .sessionTimeoutMins,
      after.security
        .sessionTimeoutMins
    );

    compare(
      "security.maxLoginAttempts",
      before.security
        .maxLoginAttempts,
      after.security
        .maxLoginAttempts
    );

    compare(
      "security.requireReauthForSensitiveActions",
      before.security
        .requireReauthForSensitiveActions,
      after.security
        .requireReauthForSensitiveActions
    );

    const sections =
      Array.from(
        new Set(
          fields.map(
            (
              field
            ) =>
              field.split(
                "."
              )[0] ||
              "unknown"
          )
        )
      );

    return {
      sections,
      fields,
    };
  };

export const determineAuditSeverity =
  (
    changedFields:
      string[]
  ): PlatformAuditSeverity => {
    if (
      changedFields.includes(
        "platform.maintenanceMode"
      ) ||
      changedFields.includes(
        "platform.allowSignups"
      )
    ) {
      return "critical";
    }

    if (
      changedFields.some(
        (
          field
        ) =>
          field.startsWith(
            "risk."
          ) ||
          field.startsWith(
            "security."
          )
      )
    ) {
      return "warning";
    }

    return "normal";
  };

export const appendSettingsAudit =
  async ({
    req,
    action,
    severity,
    revision,
    before,
    after,
    changedSections,
    changedFields,
    session,
  }: {
    req:
      AuthRequest;

    action:
      PlatformAuditAction;

    severity:
      PlatformAuditSeverity;

    revision:
      number;

    before:
      AdminSettingsPayload;

    after:
      AdminSettingsPayload;

    changedSections:
      string[];

    changedFields:
      string[];

    session:
      ClientSession;
  }) => {
    if (
      !req.user?._id
    ) {
      throw new Error(
        "Authenticated admin is required for audit creation."
      );
    }

    /*
     * Audit revision follows settings revision, so the
     * previous audit must correspond to revision - 1.
     * Revision 2 can legitimately have no predecessor because
     * revision 1 is the initial configuration.
     */
    const previous =
      await PlatformSettingsAudit.findOne({
        revision:
          revision - 1,
      })
        .session(
          session
        )
        .lean();

    const previousAuditHash =
      previous?.auditHash ||
      "GENESIS";

    const occurredAt =
      new Date();

    const requestId =
      getRequestId(
        req
      );

    const beforeFingerprint =
      fingerprintSettings(
        before
      );

    const afterFingerprint =
      fingerprintSettings(
        after
      );

    const sourceIpHash =
      hashRequestMetadata(
        getClientIp(
          req
        )
      );

    const userAgentHash =
      hashRequestMetadata(
        req.get(
          "user-agent"
        )
      );

    const canonicalRecord =
      JSON.stringify({
        actorId:
          req.user._id,

        actorRole:
          "admin",

        action,

        severity,

        revision,

        requestId,

        changedSections,

        changedFields,

        sourceIpHash,

        userAgentHash,

        beforeFingerprint,

        afterFingerprint,

        previousAuditHash,

        occurredAt:
          occurredAt.toISOString(),
      });

    const auditHash =
      hmac(
        canonicalRecord
      );

    const records =
      await PlatformSettingsAudit.create(
        [
          {
            actorId:
              req.user._id,

            actorRole:
              "admin",

            action,

            severity,

            revision,

            requestId,

            changedSections,

            changedFields,

            sourceIpHash,

            userAgentHash,

            beforeFingerprint,

            afterFingerprint,

            previousAuditHash,

            auditHash,

            occurredAt,
          },
        ],
        {
          session,
        }
      );

    return records[0];
  };

export const verifyAuditChain =
  async () => {
    const records =
      await PlatformSettingsAudit.find()
        .sort({
          revision:
            1,
        })
        .lean();

    let expectedPrevious =
      "GENESIS";

    for (
      let index = 0;
      index <
      records.length;
      index += 1
    ) {
      const record =
        records[index];

      if (!record) {
        continue;
      }

      if (
        index === 0
      ) {
        /*
         * First audit may be any revision >= 2.
         */
        expectedPrevious =
          "GENESIS";
      }

      if (
        record.previousAuditHash !==
        expectedPrevious
      ) {
        return {
          valid:
            false,

          checked:
            index,

          failedRevision:
            record.revision,

          reason:
            "Previous audit hash mismatch.",
        };
      }

      const canonicalRecord =
        JSON.stringify({
          actorId:
            String(
              record.actorId
            ),

          actorRole:
            record.actorRole,

          action:
            record.action,

          severity:
            record.severity,

          revision:
            record.revision,

          requestId:
            record.requestId,

          changedSections:
            record.changedSections,

          changedFields:
            record.changedFields,

          sourceIpHash:
            record.sourceIpHash,

          userAgentHash:
            record.userAgentHash,

          beforeFingerprint:
            record.beforeFingerprint,

          afterFingerprint:
            record.afterFingerprint,

          previousAuditHash:
            record.previousAuditHash,

          occurredAt:
            new Date(
              record.occurredAt
            ).toISOString(),
        });

      const expectedHash =
        hmac(
          canonicalRecord
        );

      if (
        expectedHash !==
        record.auditHash
      ) {
        return {
          valid:
            false,

          checked:
            index + 1,

          failedRevision:
            record.revision,

          reason:
            "Audit record signature mismatch.",
        };
      }

      expectedPrevious =
        record.auditHash;
    }

    return {
      valid:
        true,

      checked:
        records.length,

      failedRevision:
        null,

      reason:
        null,
    };
  };
