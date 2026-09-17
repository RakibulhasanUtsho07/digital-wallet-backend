/* =========================================================
   MERCHANT PAYMENT CONTEXT SERVICE
   ---------------------------------------------------------
   Responsibilities:
   - Resolve authenticated user -> Merchant
   - Validate merchant ownership
   - Validate merchant status
   - Validate payment environment
   - Return safe merchant payment context
========================================================= */

import {
  Merchant,
} from "../../../models/Merchant.js";

/* =========================================================
   TYPES
========================================================= */

export type MerchantPaymentEnvironment =
  | "test"
  | "live";

export interface MerchantPaymentContext {
  merchantId: string;

  ownerId: string;

  businessName: string;

  environment:
    MerchantPaymentEnvironment;

  status: string;

  verificationStatus: string;
}

/* =========================================================
   HELPERS
========================================================= */

const toIdString = (
  value: unknown,
): string => {
  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return String(value);
  }

  return "";
};

/* =========================================================
   RESOLVE MERCHANT PAYMENT CONTEXT
========================================================= */

export const resolveMerchantPaymentContext =
  async (
    ownerId: string,

    environment?:
      MerchantPaymentEnvironment,
  ): Promise<MerchantPaymentContext> => {
    const normalizedOwnerId =
      ownerId.trim();

    if (!normalizedOwnerId) {
      throw new Error(
        "Authenticated user ID is required.",
      );
    }

    const requestedEnvironment =
      environment ?? "test";

    /* =====================================================
       FIND MERCHANT
    ====================================================== */

    const merchant =
      await Merchant.findOne({
        ownerId:
          normalizedOwnerId,
      });

    if (!merchant) {
      throw new Error(
        "No merchant account was found for the authenticated user.",
      );
    }

    /* =====================================================
       MERCHANT STATUS
    ====================================================== */

    if (
      merchant.status !==
      "active"
    ) {
      throw new Error(
        `Merchant account is not active. Current status: ${merchant.status}.`,
      );
    }

    /* =====================================================
       TEST ENVIRONMENT
    ====================================================== */

    if (
      requestedEnvironment ===
      "test"
    ) {
      if (
        merchant.testEnabled !==
        true
      ) {
        throw new Error(
          "PayPal test payments are not enabled for this merchant.",
        );
      }
    }

    /* =====================================================
       LIVE ENVIRONMENT
    ====================================================== */

    if (
      requestedEnvironment ===
      "live"
    ) {
      if (
        merchant.liveEnabled !==
        true
      ) {
        throw new Error(
          "Live payments are not enabled for this merchant.",
        );
      }

      if (
        merchant.verificationStatus !==
        "verified"
      ) {
        throw new Error(
          "Merchant verification is required before live payments can be processed.",
        );
      }
    }

    /* =====================================================
       RESOLVE IDS
    ====================================================== */

    const merchantId =
      toIdString(
        merchant._id,
      );

    const resolvedOwnerId =
      toIdString(
        merchant.ownerId,
      );

    if (!merchantId) {
      throw new Error(
        "Merchant ID could not be resolved.",
      );
    }

    if (!resolvedOwnerId) {
      throw new Error(
        "Merchant owner ID could not be resolved.",
      );
    }

    /* =====================================================
       RETURN CONTEXT
    ====================================================== */

    return {
      merchantId,

      ownerId:
        resolvedOwnerId,

      businessName:
        merchant.businessName,

      environment:
        requestedEnvironment,

      status:
        merchant.status,

      verificationStatus:
        merchant.verificationStatus,
    };
  };

/* =========================================================
   GET MERCHANT BY OWNER
========================================================= */

export const getMerchantByOwnerId =
  async (
    ownerId: string,
  ) => {
    const normalizedOwnerId =
      ownerId.trim();

    if (!normalizedOwnerId) {
      throw new Error(
        "Owner ID is required.",
      );
    }

    return Merchant.findOne({
      ownerId:
        normalizedOwnerId,
    });
  };

/* =========================================================
   GET MERCHANT BY ID
========================================================= */

export const getMerchantById =
  async (
    merchantId: string,
  ) => {
    const normalizedMerchantId =
      merchantId.trim();

    if (!normalizedMerchantId) {
      throw new Error(
        "Merchant ID is required.",
      );
    }

    return Merchant.findById(
      normalizedMerchantId,
    );
  };

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  resolveMerchantPaymentContext,

  getMerchantByOwnerId,

  getMerchantById,
};