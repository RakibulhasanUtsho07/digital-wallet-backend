import mongoose from "mongoose";

import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  MerchantApiKey,
  MERCHANT_API_SCOPES,
  type MerchantApiKeyEnvironment,
  type MerchantApiScope,
} from "../models/MerchantApiKey.js";

import {
  generateMerchantApiKey,
  listMerchantApiKeys,
  revokeMerchantApiKey,
  rotateMerchantApiKey,
} from "../services/merchantService.js";

/* =========================================================
   TYPES
========================================================= */

interface MerchantAccess {
  _id: mongoose.Types.ObjectId;
  status: string;
  verificationStatus: string;
  testEnabled: boolean;
  liveEnabled: boolean;
}

/* =========================================================
   HELPERS
========================================================= */

const stringValue = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

const isApiScope = (
  value: unknown
): value is MerchantApiScope => {
  return (
    typeof value === "string" &&
    (
      MERCHANT_API_SCOPES as readonly string[]
    ).includes(value)
  );
};

const parseEnvironment = (
  value: unknown
): MerchantApiKeyEnvironment => {
  if (
    value !== "test" &&
    value !== "live"
  ) {
    throw new Error(
      "API key environment must be test or live."
    );
  }

  return value;
};

const parseScopes = (
  value: unknown
): MerchantApiScope[] => {
  if (!Array.isArray(value)) {
    throw new Error(
      "API key scopes are required."
    );
  }

  const scopes = [
    ...new Set(
      value.filter(isApiScope)
    ),
  ];

  if (
    scopes.length === 0 ||
    scopes.length !== value.length
  ) {
    throw new Error(
      "One or more API key scopes are invalid."
    );
  }

  return scopes;
};

const parseOptionalExpiry = (
  value: unknown
): Date | undefined => {
  const raw =
    stringValue(value);

  if (!raw) {
    return undefined;
  }

  const date =
    new Date(raw);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      "API key expiry date is invalid."
    );
  }

  if (
    date.getTime() <=
    Date.now()
  ) {
    throw new Error(
      "API key expiry date must be in the future."
    );
  }

  const maximumExpiry =
    Date.now() +
    2 *
      365 *
      24 *
      60 *
      60 *
      1000;

  if (
    date.getTime() >
    maximumExpiry
  ) {
    throw new Error(
      "API key expiry cannot be more than two years in the future."
    );
  }

  return date;
};

const authenticatedOwnerId = (
  req: AuthRequest
): string => {
  const ownerId =
    req.user?._id;

  if (!ownerId) {
    throw new Error(
      "Authentication is required."
    );
  }

  const normalized =
    String(ownerId);

  if (
    !mongoose.isValidObjectId(
      normalized
    )
  ) {
    throw new Error(
      "Invalid merchant owner ID."
    );
  }

  return normalized;
};

const findMerchant = async (
  ownerId: string
): Promise<MerchantAccess> => {
  const merchant =
    await Merchant.findOne({
      ownerId:
        new mongoose.Types.ObjectId(
          ownerId
        ),
    })
      .select(
        "_id status verificationStatus testEnabled liveEnabled"
      )
      .lean();

  if (!merchant) {
    throw new Error(
      "Merchant account not found."
    );
  }

  return {
    _id:
      new mongoose.Types.ObjectId(
        String(merchant._id)
      ),

    status:
      merchant.status,

    verificationStatus:
      merchant.verificationStatus,

    testEnabled:
      merchant.testEnabled,

    liveEnabled:
      merchant.liveEnabled,
  };
};

const ensureEnvironmentAccess = (
  merchant: MerchantAccess,
  environment: MerchantApiKeyEnvironment
): void => {
  if (
    environment === "test" &&
    merchant.testEnabled !== true
  ) {
    throw new Error(
      "Test environment is disabled for this merchant."
    );
  }

  if (
    environment === "live" &&
    (
      merchant.status !== "active" ||
      merchant.verificationStatus !== "verified" ||
      merchant.liveEnabled !== true
    )
  ) {
    throw new Error(
      "An active, verified merchant with live access is required to create a live API key."
    );
  }
};

const statusCodeFor = (
  message: string
): number => {
  if (
    message ===
      "Authentication is required."
  ) {
    return 401;
  }

  if (
    message.includes(
      "not found"
    )
  ) {
    return 404;
  }

  if (
    message.includes(
      "live access"
    ) ||
    message.includes(
      "environment is disabled"
    )
  ) {
    return 403;
  }

  return 400;
};

const sendControllerError = (
  res: Response,
  label: string,
  error: unknown
): void => {
  console.error(
    label,
    error
  );

  const message =
    error instanceof Error
      ? error.message
      : "Unable to manage merchant API keys.";

  res.status(
    statusCodeFor(message)
  ).json({
    success: false,
    message,
  });
};

/* =========================================================
   CREATE API KEY

   POST /api/merchants/api-keys
========================================================= */

export const createMerchantApiKeyController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ownerId =
        authenticatedOwnerId(req);

      const merchant =
        await findMerchant(
          ownerId
        );

      const environment =
        parseEnvironment(
          req.body?.environment
        );

      ensureEnvironmentAccess(
        merchant,
        environment
      );

      const name =
        stringValue(
          req.body?.name
        );

      if (
        name.length > 100
      ) {
        throw new Error(
          "API key name cannot exceed 100 characters."
        );
      }

      const scopes =
        parseScopes(
          req.body?.scopes
        );

      const expiresAt =
        parseOptionalExpiry(
          req.body?.expiresAt
        );

      const generated =
        await generateMerchantApiKey({
          merchantId:
            merchant._id.toString(),

          environment,

          name:
            name ||
            undefined,

          scopes,

          expiresAt,
        });

      res.status(201).json({
        success: true,

        message:
          "API key created successfully. Copy it now because it will not be shown again.",

        apiKey: {
          ...generated,

          name:
            name ||
            undefined,

          status:
            "active" as const,
        },
      });
    } catch (error) {
      sendControllerError(
        res,
        "CREATE MERCHANT API KEY ERROR:",
        error
      );
    }
  };

/* =========================================================
   LIST API KEYS

   GET /api/merchants/api-keys
========================================================= */

export const listMerchantApiKeysController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ownerId =
        authenticatedOwnerId(req);

      const merchant =
        await findMerchant(
          ownerId
        );

      /*
       * Mark elapsed active keys before returning the list.
       * No secret or secretHash is selected or returned.
       */
      await MerchantApiKey.updateMany(
        {
          merchantId:
            merchant._id,

          status:
            "active",

          expiresAt: {
            $lte:
              new Date(),
          },
        },
        {
          $set: {
            status:
              "expired",
          },
        }
      );

      const apiKeys =
        await listMerchantApiKeys(
          merchant._id.toString()
        );

      res.status(200).json({
        success: true,

        apiKeys:
          apiKeys.map(
            (apiKey) => ({
              id:
                apiKey._id.toString(),

              keyId:
                apiKey.keyId,

              keyPrefix:
                apiKey.keyPrefix,

              name:
                apiKey.name,

              environment:
                apiKey.environment,

              scopes:
                apiKey.scopes,

              status:
                apiKey.status,

              lastUsedAt:
                apiKey.lastUsedAt,

              expiresAt:
                apiKey.expiresAt,

              revokedAt:
                apiKey.revokedAt,

              createdAt:
                apiKey.createdAt,

              updatedAt:
                apiKey.updatedAt,
            })
          ),
      });
    } catch (error) {
      sendControllerError(
        res,
        "LIST MERCHANT API KEYS ERROR:",
        error
      );
    }
  };

/* =========================================================
   REVOKE API KEY

   DELETE /api/merchants/api-keys/:keyId
========================================================= */

export const revokeMerchantApiKeyController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ownerId =
        authenticatedOwnerId(req);

      const merchant =
        await findMerchant(
          ownerId
        );

      const keyId =
        stringValue(
          req.params.keyId
        );

      if (!keyId) {
        throw new Error(
          "API key ID is required."
        );
      }

      const revoked =
        await revokeMerchantApiKey(
          merchant._id.toString(),
          keyId
        );

      if (!revoked) {
        throw new Error(
          "Active API key not found."
        );
      }

      res.status(200).json({
        success: true,

        message:
          "API key revoked successfully.",
      });
    } catch (error) {
      sendControllerError(
        res,
        "REVOKE MERCHANT API KEY ERROR:",
        error
      );
    }
  };

/* =========================================================
   ROTATE API KEY

   POST /api/merchants/api-keys/:keyId/rotate
========================================================= */

export const rotateMerchantApiKeyController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ownerId =
        authenticatedOwnerId(req);

      const merchant =
        await findMerchant(
          ownerId
        );

      const keyId =
        stringValue(
          req.params.keyId
        );

      if (!keyId) {
        throw new Error(
          "API key ID is required."
        );
      }

      const current =
        await MerchantApiKey.findOne({
          merchantId:
            merchant._id,

          keyId,

          status:
            "active",
        })
          .select(
            "environment name"
          )
          .lean();

      if (!current) {
        throw new Error(
          "Active API key not found."
        );
      }

      ensureEnvironmentAccess(
        merchant,
        current.environment
      );

      const generated =
        await rotateMerchantApiKey(
          merchant._id.toString(),
          keyId
        );

      res.status(200).json({
        success: true,

        message:
          "API key rotated successfully. The old key was revoked. Copy the new key now.",

        apiKey: {
          ...generated,

          name:
            current.name
              ? `${current.name} - Rotated`
              : undefined,

          status:
            "active" as const,
        },
      });
    } catch (error) {
      sendControllerError(
        res,
        "ROTATE MERCHANT API KEY ERROR:",
        error
      );
    }
  };
