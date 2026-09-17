import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  KYC,
} from "../models/KYC.js";

import {
  KYCAIReview,
} from "../models/KYCAIReview.js";

const startOfToday = (): Date => {
  const now =
    new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
};

interface VerifiedDurationItem {
  submittedAt?: Date;
  verifiedAt?: Date;
}

export const getAdminKycOverviewController =
  async (
    _req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const today =
        startOfToday();

      const [
        pending,
        underReview,
        verified,
        rejected,
        approvedToday,
        rejectedToday,
        totalSubmitted,
        highRisk,
        aiReviewed,
        needsManualReview,
        verifiedDurations,
      ] =
        await Promise.all([
          KYC.countDocuments({
            status:
              "pending",
          }),

          KYC.countDocuments({
            status:
              "under_review",
          }),

          KYC.countDocuments({
            status:
              "verified",
          }),

          KYC.countDocuments({
            status:
              "rejected",
          }),

          KYC.countDocuments({
            status:
              "verified",

            verifiedAt: {
              $gte:
                today,
            },
          }),

          /*
           * Current KYC schema has verifiedAt but no dedicated rejectedAt.
           * updatedAt is used only as an operational approximation for
           * same-day records whose current state is rejected.
           */
          KYC.countDocuments({
            status:
              "rejected",

            updatedAt: {
              $gte:
                today,
            },
          }),

          KYC.countDocuments({
            status: {
              $ne:
                "not_started",
            },
          }),

          KYCAIReview.countDocuments({
            status:
              "completed",

            riskLevel: {
              $in: [
                "High",
                "Critical",
              ],
            },
          }),

          KYCAIReview.countDocuments({
            status:
              "completed",
          }),

          KYCAIReview.countDocuments({
            status:
              "completed",

            recommendation:
              "manual_review",
          }),

          KYC.find({
            status:
              "verified",

            submittedAt: {
              $type:
                "date",
            },

            verifiedAt: {
              $type:
                "date",
            },
          })
            .select(
              "submittedAt verifiedAt"
            )
            .sort({
              verifiedAt:
                -1,
            })
            .limit(
              250
            )
            .lean<VerifiedDurationItem[]>(),
        ]);

      const durations =
        verifiedDurations
          .map(
            (
              item
            ) => {
              const submittedAt =
                item.submittedAt;

              const verifiedAt =
                item.verifiedAt;

              if (
                !(submittedAt instanceof Date) ||
                !(verifiedAt instanceof Date)
              ) {
                return null;
              }

              const start =
                submittedAt.getTime();

              const end =
                verifiedAt.getTime();

              if (
                !Number.isFinite(start) ||
                !Number.isFinite(end) ||
                end < start
              ) {
                return null;
              }

              return (
                end -
                start
              ) /
                (
                  60 *
                  1000
                );
            }
          )
          .filter(
            (
              value
            ): value is number =>
              typeof value === "number" &&
              Number.isFinite(
                value
              )
          );

      const averageReviewMinutes =
        durations.length > 0
          ? Number(
              (
                durations.reduce(
                  (
                    total,
                    value
                  ) =>
                    total + value,
                  0
                ) /
                durations.length
              ).toFixed(
                2
              )
            )
          : null;

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.status(200).json({
        success: true,

        overview: {
          pending,
          underReview,
          approvedToday,
          rejectedToday,
          highRisk,
          averageReviewMinutes,
          totalSubmitted,
          verified,
          rejected,
          aiReviewed,
          needsManualReview,
        },
      });
    } catch (error) {
      console.error(
        "GET ADMIN KYC OVERVIEW ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load KYC overview.",
      });
    }
  };
