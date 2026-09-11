import crypto from "node:crypto";

import type {
  NextFunction,
  Response,
} from "express";

import type {
  AuthRequest,
} from "./authMiddleware.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  MerchantApiKey,
  type MerchantApiScope,
} from "../models/MerchantApiKey.js";

/* =========================================================
   TYPES
========================================================= */

export type MerchantApiEnvironment =
  | "test"
  | "live";

export interface MerchantAuthContext {
  _id: string;
  ownerId: string;
  businessName: string;
  businessDisplayName?: string;
  slug: string;
  status: string;
  verificationStatus: string;
  defaultCurrency: string;
  environment?: MerchantApiEnvironment;
  apiKeyId?: string;
  scopes?: MerchantApiScope[];
}

export interface MerchantAuthRequest
  extends AuthRequest {
  merchant?: MerchantAuthContext;
}

/* =========================================================
   CONSTANTS
========================================================= */

const TEST_SECRET_PREFIX =
  "sk_test_";

const LIVE_SECRET_PREFIX =
  "sk_live_";

const MAX_API_KEY_LENGTH =
  256;

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function unauthorized(
  res: Response,
  message =
    "Merchant authentication failed."
): void {
  res.status(401).json({
    success: false,
    message,
  });
}

function forbidden(
  res: Response,
  message =
    "You do not have permission to perform this action."
): void {
  res.status(403).json({
    success: false,
    message,
  });
}

/* =========================================================
   API-KEY HELPERS
========================================================= */

function hashSecret(
  secret: string
): string {
  return crypto
    .createHash("sha256")
    .update(secret, "utf8")
    .digest("hex");
}

function readApiKey(
  req: AuthRequest
): string | undefined {
  const authorization =
    req.headers.authorization;

  if (
    typeof authorization !==
    "string"
  ) {
    return undefined;
  }

  const match =
    authorization.match(
      /^Bearer\s+([^\s]+)$/i
    );

  const apiKey =
    match?.[1]?.trim();

  if (
    !apiKey ||
    apiKey.length >
      MAX_API_KEY_LENGTH
  ) {
    return undefined;
  }

  return apiKey;
}

function detectEnvironment(
  apiKey: string
): MerchantApiEnvironment | undefined {
  if (
    apiKey.startsWith(
      TEST_SECRET_PREFIX
    )
  ) {
    return "test";
  }

  if (
    apiKey.startsWith(
      LIVE_SECRET_PREFIX
    )
  ) {
    return "live";
  }

  return undefined;
}

function getKeyPrefix(
  environment: MerchantApiEnvironment
): string {
  return environment === "test"
    ? TEST_SECRET_PREFIX
    : LIVE_SECRET_PREFIX;
}

/*
 * Constant-time comparison is kept as an additional
 * verification step after the database lookup.
 */
function safeHashMatches(
  storedHash: string,
  receivedHash: string
): boolean {
  const stored =
    Buffer.from(
      storedHash,
      "utf8"
    );

  const received =
    Buffer.from(
      receivedHash,
      "utf8"
    );

  if (
    stored.length !==
    received.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    stored,
    received
  );
}

/* =========================================================
   MERCHANT API AUTHENTICATION

   Used by server-to-server merchant endpoints.

   Expected header:

   Authorization: Bearer sk_test_xxxxx
   Authorization: Bearer sk_live_xxxxx
========================================================= */

export const merchantApiAuth =
  (
    requiredScope?: MerchantApiScope
  ) => {
    return async (
      req: MerchantAuthRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        /* =================================================
           READ API KEY
        ================================================= */

        const apiKey =
          readApiKey(req);

        if (!apiKey) {
          unauthorized(
            res,
            "A valid Merchant API key is required."
          );

          return;
        }

        /* =================================================
           ENVIRONMENT
        ================================================= */

        const environment =
          detectEnvironment(
            apiKey
          );

        if (!environment) {
          unauthorized(
            res,
            "Invalid Merchant API key format."
          );

          return;
        }

        const keyPrefix =
          getKeyPrefix(
            environment
          );

        /*
         * The complete generated API key is hashed.
         * The plaintext API key is never stored.
         */
        const secretHash =
          hashSecret(
            apiKey
          );

        /* =================================================
           FIND EXACT API KEY

           Important:
           keyPrefix alone is not unique. Multiple keys can
           use sk_test_ or sk_live_. Therefore secretHash
           must be part of the query.
        ================================================= */

        const merchantKey =
          await MerchantApiKey.findOne({
            keyPrefix,
            environment,
            secretHash,
            status: "active",
          })
            .select(
              [
                "+secretHash",
                "merchantId",
                "keyId",
                "keyPrefix",
                "environment",
                "scopes",
                "status",
                "expiresAt",
                "revokedAt",
              ].join(" ")
            )
            .lean();

        if (!merchantKey) {
          unauthorized(
            res,
            "Invalid or revoked Merchant API key."
          );

          return;
        }

        /* =================================================
           DEFENCE-IN-DEPTH HASH CHECK
        ================================================= */

        if (
          !safeHashMatches(
            merchantKey.secretHash,
            secretHash
          )
        ) {
          unauthorized(
            res,
            "Invalid Merchant API key."
          );

          return;
        }

        /* =================================================
           REVOCATION
        ================================================= */

        if (
          merchantKey.revokedAt
        ) {
          unauthorized(
            res,
            "Merchant API key has been revoked."
          );

          return;
        }

        /* =================================================
           EXPIRATION
        ================================================= */

        if (
          merchantKey.expiresAt &&
          merchantKey.expiresAt.getTime() <=
            Date.now()
        ) {
          await MerchantApiKey.updateOne(
            {
              _id:
                merchantKey._id,

              status:
                "active",
            },
            {
              $set: {
                status:
                  "expired",
              },
            }
          );

          unauthorized(
            res,
            "Merchant API key has expired."
          );

          return;
        }

        /* =================================================
           LOAD MERCHANT
        ================================================= */

        const merchant =
          await Merchant.findById(
            merchantKey.merchantId
          )
            .select(
              [
                "ownerId",
                "businessName",
                "businessDisplayName",
                "slug",
                "status",
                "verificationStatus",
                "defaultCurrency",
                "testEnabled",
                "liveEnabled",
              ].join(" ")
            )
            .lean();

        if (!merchant) {
          unauthorized(
            res,
            "Merchant account not found."
          );

          return;
        }

        /* =================================================
           MERCHANT STATUS
        ================================================= */

        if (
          merchant.status !==
          "active"
        ) {
          forbidden(
            res,
            "Merchant account is not active."
          );

          return;
        }

        /* =================================================
           TEST MODE ACCESS
        ================================================= */

        if (
          environment ===
            "test" &&
          merchant.testEnabled !==
            true
        ) {
          forbidden(
            res,
            "Test mode is disabled for this merchant."
          );

          return;
        }

        /* =================================================
           LIVE MODE ACCESS
        ================================================= */

        if (
          environment ===
            "live" &&
          merchant.liveEnabled !==
            true
        ) {
          forbidden(
            res,
            "Live API access is not enabled for this merchant."
          );

          return;
        }

        /*
         * Additional live-mode protection.
         */
        if (
          environment ===
            "live" &&
          merchant.verificationStatus !==
            "verified"
        ) {
          forbidden(
            res,
            "Merchant verification is required for live API access."
          );

          return;
        }

        /* =================================================
           SCOPE VALIDATION
        ================================================= */

        const scopes =
          Array.isArray(
            merchantKey.scopes
          )
            ? merchantKey.scopes
            : [];

        if (
          requiredScope &&
          !scopes.includes(
            requiredScope
          )
        ) {
          forbidden(
            res,
            `API scope "${requiredScope}" is required.`
          );

          return;
        }

        /* =================================================
           ATTACH MERCHANT CONTEXT
        ================================================= */

        req.merchant = {
          _id:
            merchant._id.toString(),

          ownerId:
            merchant.ownerId.toString(),

          businessName:
            merchant.businessName,

          businessDisplayName:
            merchant.businessDisplayName,

          slug:
            merchant.slug,

          status:
            merchant.status,

          verificationStatus:
            merchant.verificationStatus,

          defaultCurrency:
            merchant.defaultCurrency,

          environment,

          apiKeyId:
            merchantKey.keyId,

          scopes,
        };

        /* =================================================
           UPDATE LAST USAGE

           Failure to update lastUsedAt must not interrupt
           a valid payment/order request.
        ================================================= */

        void MerchantApiKey.updateOne(
          {
            _id:
              merchantKey._id,

            status:
              "active",
          },
          {
            $set: {
              lastUsedAt:
                new Date(),
            },
          }
        ).catch(
          (
            error: unknown
          ) => {
            console.error(
              "MERCHANT API KEY USAGE UPDATE ERROR:",
              error instanceof Error
                ? error.message
                : error
            );
          }
        );

        next();
      } catch (
        error: unknown
      ) {
        console.error(
          "MERCHANT API AUTH ERROR:",
          error instanceof Error
            ? error.message
            : error
        );

        if (
          res.headersSent
        ) {
          return;
        }

        unauthorized(
          res,
          "Merchant authentication failed."
        );
      }
    };
  };

/* =========================================================
   REQUIRE MERCHANT OWNER

   Used by the logged-in Merchant Dashboard.

   This middleware does not use a Merchant API key.
   Authentication is provided by the user's session.
========================================================= */

export const requireMerchantOwner =
  async (
    req: MerchantAuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        unauthorized(
          res,
          "Authentication is required."
        );

        return;
      }

      /* ===================================================
         FIND MERCHANT OWNED BY USER
      =================================================== */

      const merchant =
        await Merchant.findOne({
          ownerId:
            userId,

          status: {
            $in: [
              "pending",
              "active",
              "suspended",
              "disabled",
            ],
          },
        })
          .select(
            [
              "ownerId",
              "businessName",
              "businessDisplayName",
              "slug",
              "status",
              "verificationStatus",
              "defaultCurrency",
              "testEnabled",
              "liveEnabled",
            ].join(" ")
          )
          .lean();

      if (!merchant) {
        res.status(404).json({
          success: false,
          message:
            "Merchant account not found.",
        });

        return;
      }

      /* ===================================================
         ATTACH DASHBOARD MERCHANT CONTEXT
      =================================================== */

      req.merchant = {
        _id:
          merchant._id.toString(),

        ownerId:
          merchant.ownerId.toString(),

        businessName:
          merchant.businessName,

        businessDisplayName:
          merchant.businessDisplayName,

        slug:
          merchant.slug,

        status:
          merchant.status,

        verificationStatus:
          merchant.verificationStatus,

        defaultCurrency:
          merchant.defaultCurrency,
      };

      next();
    } catch (
      error: unknown
    ) {
      console.error(
        "MERCHANT OWNER AUTH ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      if (
        res.headersSent
      ) {
        return;
      }

      res.status(500).json({
        success: false,
        message:
          "Unable to verify merchant account.",
      });
    }
  };