import {
  KYC,
  KYCStatus,
} from "../models/KYC.js";

/* =========================================================
   GET OR CREATE KYC
========================================================= */

export const getOrCreateKYC =
  async (
    userId: string
  ) => {
    let kyc =
      await KYC.findOne({
        userId,
      });

    if (!kyc) {
      kyc =
        await KYC.create({
          userId,
          status:
            "not_started",
          provider:
            "manual",
        });
    }

    return kyc;
  };

/* =========================================================
   UPDATE KYC STATUS
========================================================= */

export const updateKYCStatus =
  async (
    userId: string,
    status: KYCStatus,
    rejectionReason?: string
  ) => {
    const update: Record<
      string,
      unknown
    > = {
      status,
    };

    if (rejectionReason) {
      update.rejectionReason =
        rejectionReason;
    }

    if (
      status === "verified"
    ) {
      update.verifiedAt =
        new Date();

      update.rejectionReason =
        undefined;
    }

    return KYC.findOneAndUpdate(
      {
        userId,
      },

      update,

      {
        new: true,
        upsert: true,
      }
    );
  };