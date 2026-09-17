import mongoose from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payment,
} from "../models/Payment.js";

/* =========================================================
   TYPES
========================================================= */

export interface MerchantPaymentDetailResult {
  merchant: {
    _id: string;
    businessName?: string;
    slug?: string;
    status?: string;
    verificationStatus?: string;
    defaultCurrency?: string;
    testEnabled?: boolean;
    liveEnabled?: boolean;
  };

  payment: Record<
    string,
    unknown
  >;
}

/* =========================================================
   GET MERCHANT PAYMENT DETAIL
========================================================= */

export const getMerchantPaymentDetail =
  async ({
    ownerId,
    paymentId,
  }: {
    ownerId: string;
    paymentId: string;
  }): Promise<MerchantPaymentDetailResult> => {
    /* =====================================================
       VALIDATE OWNER
    ====================================================== */

    const normalizedOwnerId =
      ownerId?.trim();

    if (!normalizedOwnerId) {
      throw new Error(
        "Authenticated merchant owner is required."
      );
    }

    if (
      !mongoose.isValidObjectId(
        normalizedOwnerId
      )
    ) {
      throw new Error(
        "Invalid merchant owner ID."
      );
    }

    /* =====================================================
       VALIDATE PAYMENT ID
    ====================================================== */

    const normalizedPaymentId =
      paymentId?.trim();

    if (!normalizedPaymentId) {
      throw new Error(
        "Payment ID is required."
      );
    }

    /* =====================================================
       FIND MERCHANT
    ====================================================== */

    const merchant =
      await Merchant.findOne({
        ownerId:
          new mongoose.Types.ObjectId(
            normalizedOwnerId
          ),
      })
        .select(
          [
            "businessName",
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
      throw new Error(
        "Merchant account not found."
      );
    }

    /* =====================================================
       FIND PAYMENT

       merchantId restriction prevents one merchant from
       viewing another merchant's payment.
    ====================================================== */

    const payment =
      await Payment.findOne({
        paymentId:
          normalizedPaymentId,

        merchantId:
          merchant._id,
      })
        .lean();

    if (!payment) {
      throw new Error(
        "Payment not found."
      );
    }

    /* =====================================================
       RESPONSE
    ====================================================== */

    return {
      merchant: {
        _id:
          String(merchant._id),

        businessName:
          merchant.businessName,

        slug:
          merchant.slug,

        status:
          merchant.status,

        verificationStatus:
          merchant.verificationStatus,

        defaultCurrency:
          merchant.defaultCurrency,

        testEnabled:
          merchant.testEnabled,

        liveEnabled:
          merchant.liveEnabled,
      },

      /*
       * Mongoose lean document does not contain a
       * Record<string, unknown> index signature.
       * Converting through unknown makes the intended
       * API response type explicit.
       */
      payment:
        payment as unknown as Record<
          string,
          unknown
        >,
    };
  };