import type {
  AdminSettingsPayload,
  Currency,
} from "./platformSettingsTypes.js";

const isPlainObject = (
  value: unknown
): value is Record<string, unknown> => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
};

const hasExactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[]
): boolean => {
  const actual =
    Object.keys(value).sort();

  const expected =
    [...allowed].sort();

  return (
    actual.length === expected.length &&
    actual.every(
      (key, index) =>
        key === expected[index]
    )
  );
};

const isBoolean = (
  value: unknown
): value is boolean => {
  return typeof value === "boolean";
};

const isFiniteInteger = (
  value: unknown
): value is number => {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isSafeInteger(value)
  );
};

const inRange = (
  value: number,
  min: number,
  max: number
): boolean => {
  return (
    value >= min &&
    value <= max
  );
};

const isCurrency = (
  value: unknown
): value is Currency => {
  return (
    value === "BDT" ||
    value === "USD" ||
    value === "EUR"
  );
};

export type SettingsValidationResult =
  | {
      ok: true;
      settings: AdminSettingsPayload;
    }
  | {
      ok: false;
      message: string;
    };

export const validatePlatformSettings =
  (
    value: unknown
  ): SettingsValidationResult => {
    if (
      !isPlainObject(value)
    ) {
      return {
        ok: false,
        message:
          "Settings payload must be an object.",
      };
    }

    if (
      !hasExactKeys(
        value,
        [
          "platform",
          "risk",
          "security",
        ]
      )
    ) {
      return {
        ok: false,
        message:
          "Unexpected settings fields were provided.",
      };
    }

    const platform =
      value.platform;

    const risk =
      value.risk;

    const security =
      value.security;

    /* =====================================================
       PLATFORM
    ====================================================== */

    if (
      !isPlainObject(platform) ||
      !hasExactKeys(
        platform,
        [
          "maintenanceMode",
          "allowSignups",
          "defaultCurrency",
        ]
      ) ||
      !isBoolean(
        platform.maintenanceMode
      ) ||
      !isBoolean(
        platform.allowSignups
      ) ||
      !isCurrency(
        platform.defaultCurrency
      )
    ) {
      return {
        ok: false,
        message:
          "Invalid platform settings.",
      };
    }

    /* =====================================================
       RISK
    ====================================================== */

    if (
      !isPlainObject(risk) ||
      !hasExactKeys(
        risk,
        [
          "dailyTransferLimit",
          "reviewThreshold",
          "requireKycForHighValue",
          "velocityWindowMinutes",
          "maxTransfersPerWindow",
        ]
      )
    ) {
      return {
        ok: false,
        message:
          "Invalid transaction risk settings.",
      };
    }

    if (
      !isFiniteInteger(
        risk.dailyTransferLimit
      ) ||
      !inRange(
        risk.dailyTransferLimit,
        10000,
        500000
      )
    ) {
      return {
        ok: false,
        message:
          "Daily transfer limit must be an integer between 10,000 and 500,000.",
      };
    }

    if (
      !isFiniteInteger(
        risk.reviewThreshold
      ) ||
      !inRange(
        risk.reviewThreshold,
        5000,
        100000
      )
    ) {
      return {
        ok: false,
        message:
          "Review threshold must be an integer between 5,000 and 100,000.",
      };
    }

    if (
      risk.reviewThreshold >
      risk.dailyTransferLimit
    ) {
      return {
        ok: false,
        message:
          "Review threshold cannot exceed the daily transfer limit.",
      };
    }

    if (
      !isBoolean(
        risk.requireKycForHighValue
      )
    ) {
      return {
        ok: false,
        message:
          "Invalid KYC risk policy.",
      };
    }

    if (
      !isFiniteInteger(
        risk.velocityWindowMinutes
      ) ||
      !inRange(
        risk.velocityWindowMinutes,
        5,
        120
      )
    ) {
      return {
        ok: false,
        message:
          "Velocity window must be an integer between 5 and 120 minutes.",
      };
    }

    if (
      !isFiniteInteger(
        risk.maxTransfersPerWindow
      ) ||
      !inRange(
        risk.maxTransfersPerWindow,
        2,
        30
      )
    ) {
      return {
        ok: false,
        message:
          "Transfers per velocity window must be an integer between 2 and 30.",
      };
    }

    /* =====================================================
       SECURITY
    ====================================================== */

    if (
      !isPlainObject(security) ||
      !hasExactKeys(
        security,
        [
          "requireMfa",
          "sessionTimeoutMins",
          "maxLoginAttempts",
          "requireReauthForSensitiveActions",
        ]
      )
    ) {
      return {
        ok: false,
        message:
          "Invalid security settings.",
      };
    }

    if (
      !isBoolean(
        security.requireMfa
      ) ||
      !isBoolean(
        security.requireReauthForSensitiveActions
      )
    ) {
      return {
        ok: false,
        message:
          "Invalid security boolean policy.",
      };
    }

    if (
      !isFiniteInteger(
        security.maxLoginAttempts
      ) ||
      !inRange(
        security.maxLoginAttempts,
        3,
        10
      )
    ) {
      return {
        ok: false,
        message:
          "Maximum login attempts must be an integer between 3 and 10.",
      };
    }

    if (
      !isFiniteInteger(
        security.sessionTimeoutMins
      ) ||
      ![
        15,
        30,
        60,
        240,
      ].includes(
        security.sessionTimeoutMins
      )
    ) {
      return {
        ok: false,
        message:
          "Session timeout must be 15, 30, 60, or 240 minutes.",
      };
    }

    return {
      ok: true,

      settings: {
        platform: {
          maintenanceMode:
            platform.maintenanceMode,

          allowSignups:
            platform.allowSignups,

          defaultCurrency:
            platform.defaultCurrency,
        },

        risk: {
          dailyTransferLimit:
            risk.dailyTransferLimit,

          reviewThreshold:
            risk.reviewThreshold,

          requireKycForHighValue:
            risk.requireKycForHighValue,

          velocityWindowMinutes:
            risk.velocityWindowMinutes,

          maxTransfersPerWindow:
            risk.maxTransfersPerWindow,
        },

        security: {
          requireMfa:
            security.requireMfa,

          sessionTimeoutMins:
            security.sessionTimeoutMins,

          maxLoginAttempts:
            security.maxLoginAttempts,

          requireReauthForSensitiveActions:
            security.requireReauthForSensitiveActions,
        },
      },
    };
  };
