import {
  z,
} from "zod";

/* =========================================================
   ENVIRONMENT VALIDATION
========================================================= */

const environmentSchema =
  z.object({
    NODE_ENV:
      z
        .enum([
          "development",
          "test",
          "production",
        ])
        .default(
          "development"
        ),

    USE_MOCK_EC_PROVIDER:
      z
        .enum([
          "true",
          "false",
        ])
        .default(
          "true"
        ),

    MOCK_EC_LATENCY_MS:
      z.coerce
        .number()
        .int()
        .min(0)
        .max(10_000)
        .default(650),

    EC_GATEWAY_BASE_URL:
      z
        .string()
        .url()
        .optional(),

    EC_VERIFY_PATH:
      z
        .string()
        .default(
          "/api/v1/verifications/verify"
        ),

    EC_OCR_PATH:
      z
        .string()
        .default(
          "/api/v1/ocr/nid"
        ),

    EC_LIVENESS_PATH:
      z
        .string()
        .default(
          "/api/v1/liveness/check"
        ),

    EC_API_KEY:
      z
        .string()
        .optional(),

    EC_API_KEY_HEADER:
      z
        .string()
        .default(
          "x-api-key"
        ),

    EC_API_KEY_PREFIX:
      z
        .string()
        .default(""),

    EC_ALLOWED_ORIGINS:
      z
        .string()
        .default(""),

    EC_TIMEOUT_MS:
      z.coerce
        .number()
        .int()
        .min(1000)
        .max(5000)
        .default(5000),

    EKYC_FACE_AUTO_APPROVE_SCORE:
      z.coerce
        .number()
        .min(80)
        .max(100)
        .default(80),

    EKYC_FACE_MANUAL_REVIEW_SCORE:
      z.coerce
        .number()
        .min(0)
        .max(79)
        .default(60),

    /*
     * BFIU published applicant-name matching floor is 80%.
     * The requested product default is 85%.
     */
    EKYC_NAME_MATCH_SCORE:
      z.coerce
        .number()
        .min(80)
        .max(100)
        .default(85),

    EKYC_PASSIVE_LIVENESS_SCORE:
      z.coerce
        .number()
        .min(0)
        .max(100)
        .default(80),

    EKYC_ACTIVE_LIVENESS_SCORE:
      z.coerce
        .number()
        .min(0)
        .max(100)
        .default(80),

    EKYC_REQUIRE_ACTIVE_LIVENESS:
      z
        .enum([
          "true",
          "false",
        ])
        .default(
          "true"
        ),

    /*
     * Maximum three attempts per 24-hour window.
     * The value cannot be configured above three.
     */
    EKYC_RATE_LIMIT_ATTEMPTS:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(3)
        .default(3),

    EKYC_RATE_LIMIT_WINDOW_SECONDS:
      z.coerce
        .number()
        .int()
        .min(86_400)
        .default(
          86_400
        ),

    QDRANT_DUPLICATE_SCORE:
      z.coerce
        .number()
        .min(0.8)
        .max(1)
        .default(0.92),

    EKYC_CONFIG_REFRESH_MS:
      z.coerce
        .number()
        .int()
        .min(5000)
        .max(
          10 * 60 * 1000
        )
        .default(
          30_000
        ),

    EKYC_CONFIG_MAX_STALE_MS:
      z.coerce
        .number()
        .int()
        .min(30_000)
        .max(
          60 * 60 * 1000
        )
        .default(
          5 * 60 * 1000
        ),
  });

/* =========================================================
   CONFIG TYPES
========================================================= */

export type ApplicationEnvironment =
  | "development"
  | "test"
  | "production";

export interface EKYCProviderConfig {
  baseUrl?: string;

  verifyPath: string;
  ocrPath: string;
  livenessPath: string;

  apiKey?: string;
  apiKeyHeader: string;
  apiKeyPrefix: string;

  allowedOrigins: string[];

  timeoutMs: number;
}

export interface EKYCThresholdConfig {
  faceAutoApprove: number;
  faceManualReview: number;

  nameMatch: number;

  passiveLiveness: number;
  activeLiveness: number;

  requireActiveLiveness: boolean;

  biometricDuplicate: number;
}

export interface EKYCRateLimitConfig {
  attempts: number;
  windowSeconds: number;
}

export interface EKYCConfig {
  environment:
    ApplicationEnvironment;

  useMockProvider:
    boolean;

  mockLatencyMs:
    number;

  provider:
    EKYCProviderConfig;

  thresholds:
    EKYCThresholdConfig;

  rateLimit:
    EKYCRateLimitConfig;

  loadedAt:
    string;
}

/* =========================================================
   CONFIG SOURCE INTERFACE

   A production adapter can load configuration from:
   - AWS AppConfig
   - HashiCorp Consul
   - HashiCorp Vault
   - Azure App Configuration
   - Google Secret Manager
========================================================= */

export interface IEKYCConfigSource {
  load():
    Promise<EKYCConfig>;
}

/* =========================================================
   NORMALIZATION HELPERS
========================================================= */

function optionalString(
  value:
    string | undefined
): string | undefined {
  const normalized =
    value?.trim();

  return normalized ||
    undefined;
}

function normalizeRoutePath(
  value: string,
  fieldName: string
): string {
  const normalized =
    value.trim();

  if (
    !normalized.startsWith(
      "/"
    )
  ) {
    throw new Error(
      `${fieldName} must start with "/".`
    );
  }

  if (
    normalized.includes(
      "://"
    ) ||
    normalized.includes(
      ".."
    )
  ) {
    throw new Error(
      `${fieldName} contains an unsafe path.`
    );
  }

  if (
    normalized.length >
    300
  ) {
    throw new Error(
      `${fieldName} is too long.`
    );
  }

  return normalized;
}

function normalizeHeaderName(
  value: string
): string {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !/^[a-z0-9-]+$/.test(
      normalized
    )
  ) {
    throw new Error(
      "EC_API_KEY_HEADER contains invalid characters."
    );
  }

  return normalized;
}

function parseAllowedOrigins(
  value: string
): string[] {
  const origins =
    value
      .split(",")
      .map(
        (origin) =>
          origin.trim()
      )
      .filter(Boolean)
      .map(
        (origin) => {
          const parsed =
            new URL(
              origin
            );

          if (
            parsed.protocol !==
            "https:"
          ) {
            throw new Error(
              "Every EC allowed origin must use HTTPS."
            );
          }

          if (
            parsed.username ||
            parsed.password
          ) {
            throw new Error(
              "EC allowed origins cannot contain credentials."
            );
          }

          return parsed.origin;
        }
      );

  return [
    ...new Set(
      origins
    ),
  ];
}

/* =========================================================
   COMPLETE CONFIG VALIDATION
========================================================= */

export function validateEKYCConfig(
  config: EKYCConfig
): EKYCConfig {
  if (
    config.thresholds
      .faceManualReview >=
    config.thresholds
      .faceAutoApprove
  ) {
    throw new Error(
      "Face manual-review threshold must be lower than the auto-approve threshold."
    );
  }

  if (
    config.thresholds
      .nameMatch < 80
  ) {
    throw new Error(
      "The e-KYC name matching threshold cannot be configured below 80%."
    );
  }

  if (
    config.rateLimit
      .attempts > 3
  ) {
    throw new Error(
      "The e-KYC attempt limit cannot exceed three attempts."
    );
  }

  if (
    config.rateLimit
      .windowSeconds <
    86_400
  ) {
    throw new Error(
      "The e-KYC rate-limit window cannot be shorter than 24 hours."
    );
  }

  if (
    config.provider
      .timeoutMs > 5000
  ) {
    throw new Error(
      "The EC provider timeout cannot exceed five seconds."
    );
  }

  if (
    config.environment ===
      "production" &&
    config.useMockProvider
  ) {
    throw new Error(
      "Mock EC provider is prohibited in production."
    );
  }

  if (
    !config.useMockProvider
  ) {
    if (
      !config.provider
        .baseUrl ||
      !config.provider
        .apiKey
    ) {
      throw new Error(
        "Real EC provider requires EC_GATEWAY_BASE_URL and EC_API_KEY."
      );
    }

    const providerUrl =
      new URL(
        config.provider
          .baseUrl
      );

    if (
      providerUrl.protocol !==
      "https:"
    ) {
      throw new Error(
        "Real EC provider must use HTTPS."
      );
    }

    if (
      !config.provider
        .allowedOrigins
        .includes(
          providerUrl.origin
        )
    ) {
      throw new Error(
        "EC gateway origin must exist in EC_ALLOWED_ORIGINS."
      );
    }
  }

  return config;
}

/* =========================================================
   ENVIRONMENT CONFIG SOURCE
========================================================= */

export class EnvironmentConfigSource
  implements
    IEKYCConfigSource {
  async load():
    Promise<EKYCConfig> {
    const env =
      environmentSchema.parse(
        process.env
      );

    const baseUrl =
      optionalString(
        env
          .EC_GATEWAY_BASE_URL
      );

    const apiKey =
      optionalString(
        env.EC_API_KEY
      );

    const config:
      EKYCConfig = {
      environment:
        env.NODE_ENV,

      useMockProvider:
        env
          .USE_MOCK_EC_PROVIDER ===
        "true",

      mockLatencyMs:
        env
          .MOCK_EC_LATENCY_MS,

      provider: {
        ...(baseUrl
          ? {
              baseUrl,
            }
          : {}),

        verifyPath:
          normalizeRoutePath(
            env
              .EC_VERIFY_PATH,
            "EC_VERIFY_PATH"
          ),

        ocrPath:
          normalizeRoutePath(
            env.EC_OCR_PATH,
            "EC_OCR_PATH"
          ),

        livenessPath:
          normalizeRoutePath(
            env
              .EC_LIVENESS_PATH,
            "EC_LIVENESS_PATH"
          ),

        ...(apiKey
          ? {
              apiKey,
            }
          : {}),

        apiKeyHeader:
          normalizeHeaderName(
            env
              .EC_API_KEY_HEADER
          ),

        apiKeyPrefix:
          env
            .EC_API_KEY_PREFIX,

        allowedOrigins:
          parseAllowedOrigins(
            env
              .EC_ALLOWED_ORIGINS
          ),

        timeoutMs:
          env.EC_TIMEOUT_MS,
      },

      thresholds: {
        faceAutoApprove:
          env
            .EKYC_FACE_AUTO_APPROVE_SCORE,

        faceManualReview:
          env
            .EKYC_FACE_MANUAL_REVIEW_SCORE,

        nameMatch:
          env
            .EKYC_NAME_MATCH_SCORE,

        passiveLiveness:
          env
            .EKYC_PASSIVE_LIVENESS_SCORE,

        activeLiveness:
          env
            .EKYC_ACTIVE_LIVENESS_SCORE,

        requireActiveLiveness:
          env
            .EKYC_REQUIRE_ACTIVE_LIVENESS ===
          "true",

        biometricDuplicate:
          env
            .QDRANT_DUPLICATE_SCORE,
      },

      rateLimit: {
        attempts:
          env
            .EKYC_RATE_LIMIT_ATTEMPTS,

        windowSeconds:
          env
            .EKYC_RATE_LIMIT_WINDOW_SECONDS,
      },

      loadedAt:
        new Date()
          .toISOString(),
    };

    return validateEKYCConfig(
      config
    );
  }
}

/* =========================================================
   DYNAMIC CONFIGURATION

   Refreshes configuration without restarting the server.
   On a temporary central-store failure, it can use the
   last-known-good configuration for a limited period.
========================================================= */

export class DynamicEKYCConfig {
  private currentConfig:
    EKYCConfig | undefined;

  private loadedAtMs = 0;

  private refreshPromise:
    Promise<EKYCConfig> |
    undefined;

  constructor(
    private readonly source:
      IEKYCConfigSource =
      new EnvironmentConfigSource(),

    private readonly refreshMs =
      Number(
        process.env
          .EKYC_CONFIG_REFRESH_MS ||
          30_000
      ),

    private readonly maxStaleMs =
      Number(
        process.env
          .EKYC_CONFIG_MAX_STALE_MS ||
          5 * 60 * 1000
      )
  ) {
    if (
      !Number.isFinite(
        this.refreshMs
      ) ||
      this.refreshMs < 5000
    ) {
      throw new Error(
        "EKYC_CONFIG_REFRESH_MS must be at least 5000 milliseconds."
      );
    }

    if (
      !Number.isFinite(
        this.maxStaleMs
      ) ||
      this.maxStaleMs <
        this.refreshMs
    ) {
      throw new Error(
        "EKYC_CONFIG_MAX_STALE_MS must be greater than or equal to the refresh interval."
      );
    }
  }

  private isFresh():
    boolean {
    return Boolean(
      this.currentConfig &&
      Date.now() -
        this.loadedAtMs <
        this.refreshMs
    );
  }

  private canUseStale():
    boolean {
    return Boolean(
      this.currentConfig &&
      Date.now() -
        this.loadedAtMs <
        this.maxStaleMs
    );
  }

  private async refresh(
    allowStaleFallback:
      boolean
  ): Promise<EKYCConfig> {
    try {
      const loadedConfig =
        await this.source.load();

      const validated =
        validateEKYCConfig(
          loadedConfig
        );

      this.currentConfig =
        validated;

      this.loadedAtMs =
        Date.now();

      return validated;
    } catch (error) {
      if (
        allowStaleFallback &&
        this.canUseStale() &&
        this.currentConfig
      ) {
        /*
         * Never log the complete configuration because it
         * contains the provider API key.
         */
        console.error(
          "EKYC CONFIG REFRESH FAILED: using last-known-good configuration."
        );

        return this
          .currentConfig;
      }

      throw error;
    }
  }

  async get():
    Promise<EKYCConfig> {
    if (
      this.isFresh() &&
      this.currentConfig
    ) {
      return this
        .currentConfig;
    }

    if (
      !this.refreshPromise
    ) {
      this.refreshPromise =
        this.refresh(
          true
        ).finally(
          () => {
            this.refreshPromise =
              undefined;
          }
        );
    }

    return this
      .refreshPromise;
  }

  async forceRefresh():
    Promise<EKYCConfig> {
    /*
     * Used after an approved admin configuration change.
     * Forced refresh does not accept a stale fallback.
     */
    if (
      this.refreshPromise
    ) {
      return this
        .refreshPromise;
    }

    this.refreshPromise =
      this.refresh(
        false
      ).finally(
        () => {
          this.refreshPromise =
            undefined;
        }
      );

    return this
      .refreshPromise;
  }

  getCurrentSnapshot():
    EKYCConfig | null {
    return (
      this.currentConfig ||
      null
    );
  }
}

/* =========================================================
   DEFAULT SINGLETON
========================================================= */

export const dynamicEKYCConfig =
  new DynamicEKYCConfig();

export default dynamicEKYCConfig;