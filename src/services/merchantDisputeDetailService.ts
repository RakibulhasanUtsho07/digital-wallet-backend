import mongoose from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Dispute,
} from "../models/Dispute.js";

import {
  Payment,
} from "../models/Payment.js";

import {
  User,
} from "../models/User.js";

/* =========================================================
   TYPES
========================================================= */

export interface MerchantDisputeDetailResult {
  merchant: {
    id: string;
    businessName: string;
    defaultCurrency?: string;
  };

  dispute: {
    disputeId: string;
    paymentId: string;
    customerId: string | null;

    amount: string;
    currency: string;

    reason: string;
    description: string | null;

    status: string;

    merchantResponse: string | null;
    resolutionNote: string | null;

    resolvedAt: Date | null;

    createdAt: Date;
    updatedAt: Date;

    evidence: Array<{
      title: string;
      description: string | null;
      url: string | null;
      submittedAt: Date;
    }>;
  };

  customer: {
    customerId: string;
    name: string;
    avatarUrl?: string;
    accountStatus?: string;
    kycStatus?: string;
  } | null;

  payment: {
    paymentId: string;
    amount: string;
    currency: string;
    status: string;
    provider: string;
    sourceType: string;
    mode: string;
    merchantReference: string | null;
    providerPaymentId: string | null;
    orderId: string | null;
    createdAt: Date;
    completedAt: Date | null;
  } | null;
}

/* =========================================================
   HELPERS
========================================================= */

function decimalToString(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "0";
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value);
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value
  ) {
    return String(
      (
        value as {
          toString: () => string;
        }
      ).toString(),
    );
  }

  return "0";
}

/* =========================================================
   GET MERCHANT DISPUTE DETAIL
========================================================= */

export const getMerchantDisputeDetail =
  async ({
    ownerId,
    disputeId,
  }: {
    ownerId: string;
    disputeId: string;
  }): Promise<MerchantDisputeDetailResult> => {
    /* =======================================================
       VALIDATION
    ======================================================== */

    if (!ownerId) {
      throw new Error(
        "Authenticated merchant owner is required.",
      );
    }

    if (
      !mongoose.isValidObjectId(
        ownerId,
      )
    ) {
      throw new Error(
        "Invalid merchant owner ID.",
      );
    }

    const normalizedDisputeId =
      disputeId.trim();

    if (!normalizedDisputeId) {
      throw new Error(
        "Dispute ID is required.",
      );
    }

    /* =======================================================
       MERCHANT
    ======================================================== */

    const merchant =
      await Merchant.findOne({
        ownerId:
          new mongoose.Types.ObjectId(
            ownerId,
          ),
      })
        .select(
          "_id businessName displayName businessDisplayName defaultCurrency",
        )
        .lean();

    if (!merchant) {
      throw new Error(
        "Merchant account not found.",
      );
    }

    /* =======================================================
       DISPUTE
    ======================================================== */

    const dispute =
      await Dispute.findOne({
        disputeId:
          normalizedDisputeId,

        merchantId:
          merchant._id,
      })
        .lean();

    if (!dispute) {
      throw new Error(
        "Dispute not found.",
      );
    }

    /* =======================================================
       CUSTOMER
    ======================================================== */

    let customer:
      | MerchantDisputeDetailResult["customer"]
      | null = null;

    if (dispute.customerId) {
      const customerRecord =
        await User.findById(
          dispute.customerId,
        )
          .select(
            "_id name avatarUrl accountStatus kycStatus",
          )
          .lean();

      if (customerRecord) {
        customer = {
          customerId:
            String(
              customerRecord._id,
            ),

          name:
            customerRecord.name,

          avatarUrl:
            customerRecord.avatarUrl,

          accountStatus:
            customerRecord.accountStatus,

          kycStatus:
            customerRecord.kycStatus,
        };
      }
    }

    /* =======================================================
       PAYMENT
    ======================================================== */

    const payment =
      await Payment.findOne({
        _id:
          dispute.paymentId,

        merchantId:
          merchant._id,
      })
        .select(
          [
            "paymentId",
            "amount",
            "currency",
            "status",
            "provider",
            "sourceType",
            "mode",
            "merchantReference",
            "providerPaymentId",
            "orderId",
            "createdAt",
            "completedAt",
          ].join(" "),
        )
        .lean();

    /* =======================================================
       RESPONSE
    ======================================================== */

    const merchantRaw =
      merchant as unknown as Record<
        string,
        unknown
      >;

    const businessName =
      typeof merchantRaw.businessDisplayName ===
        "string" &&
      merchantRaw.businessDisplayName.trim()
        ? merchantRaw.businessDisplayName
        : typeof merchantRaw.displayName ===
            "string" &&
          merchantRaw.displayName.trim()
          ? merchantRaw.displayName
          : typeof merchantRaw.businessName ===
              "string"
            ? merchantRaw.businessName
            : "Merchant";

    return {
      merchant: {
        id:
          String(
            merchant._id,
          ),

        businessName,

        defaultCurrency:
          merchant.defaultCurrency,
      },

      dispute: {
        disputeId:
          dispute.disputeId,

        paymentId:
          String(
            dispute.paymentId,
          ),

        customerId:
          dispute.customerId
            ? String(
                dispute.customerId,
              )
            : null,

        amount:
          decimalToString(
            dispute.amount,
          ),

        currency:
          dispute.currency,

        reason:
          dispute.reason,

        description:
          dispute.description ??
          null,

        status:
          dispute.status,

        merchantResponse:
          dispute.merchantResponse ??
          null,

        resolutionNote:
          dispute.resolutionNote ??
          null,

        resolvedAt:
          dispute.resolvedAt ??
          null,

        createdAt:
          dispute.createdAt,

        updatedAt:
          dispute.updatedAt,

        evidence:
          Array.isArray(
            dispute.evidence,
          )
            ? dispute.evidence.map(
                (item) => ({
                  title:
                    item.title,

                  description:
                    item.description ??
                    null,

                  url:
                    item.url ??
                    null,

                  submittedAt:
                    item.submittedAt,
                }),
              )
            : [],
      },

      customer,

      payment: payment
        ? {
            paymentId:
              payment.paymentId,

            amount:
              decimalToString(
                payment.amount,
              ),

            currency:
              payment.currency,

            status:
              payment.status,

            provider:
              payment.provider,

            sourceType:
              payment.sourceType,

            mode:
              payment.mode,

            merchantReference:
              payment.merchantReference ??
              null,

            providerPaymentId:
              payment.providerPaymentId ??
              null,

            orderId:
              payment.orderId
                ? String(
                    payment.orderId,
                  )
                : null,

            createdAt:
              payment.createdAt,

            completedAt:
              payment.completedAt ??
              null,
          }
        : null,
    };
  };