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
  createMerchant,
  generateMerchantApiKey,
  listMerchantApiKeys,
  revokeMerchantApiKey,
  rotateMerchantApiKey,
} from "../services/merchantService.js";

/* =========================================================
   HELPERS
========================================================= */

/*
 * Express route params can be typed as string | string[]
 * depending on the Express/Node type definitions.
 *
 * Merchant API operations require exactly one string keyId.
 */
const getRouteParamString = (
  value: string | string[] | undefined
): string | null => {
  if (
    typeof value ===
    "string"
  ) {
    const normalized =
      value.trim();

    return normalized
      ? normalized
      : null;
  }

  /*
   * Reject arrays instead of silently selecting
   * an unexpected value.
   */
  return null;
};

/* =========================================================
   CREATE MERCHANT
========================================================= */

export const createMerchantController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /* ===================================================
         AUTHENTICATION
      ==================================================== */

      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      /* ===================================================
         CREATE MERCHANT
      ==================================================== */

      const merchant =
        await createMerchant({
          ownerId:
            req.user._id,

          businessName:
            req.body?.businessName,

          businessDisplayName:
            req.body?.businessDisplayName,

          businessType:
            req.body?.businessType,

          slug:
            req.body?.slug,

          businessEmail:
            req.body?.businessEmail,

          businessPhone:
            req.body?.businessPhone,

          websiteUrl:
            req.body?.websiteUrl,

          description:
            req.body?.description,

          country:
            req.body?.country,

          countryCode:
            req.body?.countryCode,

          defaultCurrency:
            req.body?.defaultCurrency,
        });

      /* ===================================================
         RESPONSE
      ==================================================== */

      res.status(201).json({
        success: true,

        message:
          "Merchant account created successfully. Verification is pending.",

        merchant,
      });
    } catch (
      error: unknown
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to create merchant account.";

      res.status(400).json({
        success: false,
        message,
      });
    }
  };

/* =========================================================
   GET MY MERCHANT
========================================================= */

export const getMyMerchantController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /* ===================================================
         AUTHENTICATION
      ==================================================== */

      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      /* ===================================================
         FIND MERCHANT
      ==================================================== */

      const merchant =
        await Merchant.findOne({
          ownerId:
            req.user._id,
        }).lean();

      if (!merchant) {
        res.status(404).json({
          success: false,
          message:
            "Merchant account not found.",
        });

        return;
      }

      /* ===================================================
         RESPONSE
      ==================================================== */

      res.status(200).json({
        success: true,
        merchant,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "GET MERCHANT ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load merchant account.",
      });
    }
  };

/* =========================================================
   CREATE API KEY
========================================================= */

export const createMerchantApiKeyController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /* ===================================================
         AUTHENTICATION
      ==================================================== */

      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      /* ===================================================
         FIND MERCHANT
      ==================================================== */

      const merchant =
        await Merchant.findOne({
          ownerId:
            req.user._id,
        }).lean();

      if (!merchant) {
        res.status(404).json({
          success: false,
          message:
            "Merchant account not found.",
        });

        return;
      }

      /* ===================================================
         GENERATE API KEY
      ==================================================== */

      const result =
        await generateMerchantApiKey({
          merchantId:
            merchant._id.toString(),

          environment:
            req.body?.environment ||
            "test",

          name:
            req.body?.name,

          scopes:
            req.body?.scopes,

          expiresAt:
            req.body?.expiresAt
              ? new Date(
                  req.body.expiresAt
                )
              : undefined,
        });

      /* ===================================================
         RESPONSE
      ==================================================== */

      res.status(201).json({
        success: true,

        message:
          "Merchant API key created. Store the secret securely; it will not be shown again.",

        apiKey:
          result,
      });
    } catch (
      error: unknown
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to create API key.";

      res.status(400).json({
        success: false,
        message,
      });
    }
  };

/* =========================================================
   LIST API KEYS
========================================================= */

export const listMerchantApiKeysController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /* ===================================================
         AUTHENTICATION
      ==================================================== */

      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      /* ===================================================
         FIND MERCHANT
      ==================================================== */

      const merchant =
        await Merchant.findOne({
          ownerId:
            req.user._id,
        }).lean();

      if (!merchant) {
        res.status(404).json({
          success: false,
          message:
            "Merchant account not found.",
        });

        return;
      }

      /* ===================================================
         LOAD API KEYS
      ==================================================== */

      const apiKeys =
        await listMerchantApiKeys(
          merchant._id.toString()
        );

      /* ===================================================
         RESPONSE
      ==================================================== */

      res.status(200).json({
        success: true,
        apiKeys,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "LIST MERCHANT API KEYS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load merchant API keys.",
      });
    }
  };

/* =========================================================
   REVOKE API KEY
========================================================= */

export const revokeMerchantApiKeyController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /* ===================================================
         AUTHENTICATION
      ==================================================== */

      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      /* ===================================================
         VALIDATE KEY ID
      ==================================================== */

      const keyId =
        getRouteParamString(
          req.params.keyId
        );

      if (!keyId) {
        res.status(400).json({
          success: false,
          message:
            "A valid API key ID is required.",
        });

        return;
      }

      /* ===================================================
         FIND MERCHANT
      ==================================================== */

      const merchant =
        await Merchant.findOne({
          ownerId:
            req.user._id,
        }).lean();

      if (!merchant) {
        res.status(404).json({
          success: false,
          message:
            "Merchant account not found.",
        });

        return;
      }

      /* ===================================================
         REVOKE KEY
      ==================================================== */

      const revoked =
        await revokeMerchantApiKey(
          merchant._id.toString(),
          keyId
        );

      if (!revoked) {
        res.status(404).json({
          success: false,
          message:
            "Active API key not found.",
        });

        return;
      }

      /* ===================================================
         RESPONSE
      ==================================================== */

      res.status(200).json({
        success: true,

        message:
          "Merchant API key revoked successfully.",
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "REVOKE MERCHANT API KEY ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to revoke API key.",
      });
    }
  };

/* =========================================================
   ROTATE API KEY
========================================================= */

export const rotateMerchantApiKeyController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /* ===================================================
         AUTHENTICATION
      ==================================================== */

      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      /* ===================================================
         VALIDATE KEY ID
      ==================================================== */

      const keyId =
        getRouteParamString(
          req.params.keyId
        );

      if (!keyId) {
        res.status(400).json({
          success: false,
          message:
            "A valid API key ID is required.",
        });

        return;
      }

      /* ===================================================
         FIND MERCHANT
      ==================================================== */

      const merchant =
        await Merchant.findOne({
          ownerId:
            req.user._id,
        }).lean();

      if (!merchant) {
        res.status(404).json({
          success: false,
          message:
            "Merchant account not found.",
        });

        return;
      }

      /* ===================================================
         ROTATE KEY
      ==================================================== */

      const result =
        await rotateMerchantApiKey(
          merchant._id.toString(),
          keyId
        );

      /* ===================================================
         RESPONSE
      ==================================================== */

      res.status(201).json({
        success: true,

        message:
          "Merchant API key rotated successfully. Store the new secret securely.",

        apiKey:
          result,
      });
    } catch (
      error: unknown
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to rotate API key.";

      res.status(400).json({
        success: false,
        message,
      });
    }
  };