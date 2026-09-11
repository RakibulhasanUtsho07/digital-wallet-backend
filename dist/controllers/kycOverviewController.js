"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminKycOverviewController = void 0;
const KYC_js_1 = require("../models/KYC.js");
const KYCAIReview_js_1 = require("../models/KYCAIReview.js");
const startOfToday = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
};
const getAdminKycOverviewController = async (_req, res) => {
    try {
        const today = startOfToday();
        const [pending, underReview, verified, rejected, approvedToday, rejectedToday, totalSubmitted, highRisk, aiReviewed, needsManualReview, verifiedDurations,] = await Promise.all([
            KYC_js_1.KYC.countDocuments({
                status: "pending",
            }),
            KYC_js_1.KYC.countDocuments({
                status: "under_review",
            }),
            KYC_js_1.KYC.countDocuments({
                status: "verified",
            }),
            KYC_js_1.KYC.countDocuments({
                status: "rejected",
            }),
            KYC_js_1.KYC.countDocuments({
                status: "verified",
                verifiedAt: {
                    $gte: today,
                },
            }),
            /*
             * Current KYC schema has verifiedAt but no dedicated rejectedAt.
             * updatedAt is used only as an operational approximation for
             * same-day records whose current state is rejected.
             */
            KYC_js_1.KYC.countDocuments({
                status: "rejected",
                updatedAt: {
                    $gte: today,
                },
            }),
            KYC_js_1.KYC.countDocuments({
                status: {
                    $ne: "not_started",
                },
            }),
            KYCAIReview_js_1.KYCAIReview.countDocuments({
                status: "completed",
                riskLevel: {
                    $in: [
                        "High",
                        "Critical",
                    ],
                },
            }),
            KYCAIReview_js_1.KYCAIReview.countDocuments({
                status: "completed",
            }),
            KYCAIReview_js_1.KYCAIReview.countDocuments({
                status: "completed",
                recommendation: "manual_review",
            }),
            KYC_js_1.KYC.find({
                status: "verified",
                submittedAt: {
                    $type: "date",
                },
                verifiedAt: {
                    $type: "date",
                },
            })
                .select("submittedAt verifiedAt")
                .sort({
                verifiedAt: -1,
            })
                .limit(250)
                .lean(),
        ]);
        const durations = verifiedDurations
            .map((item) => {
            const submittedAt = item.submittedAt;
            const verifiedAt = item.verifiedAt;
            if (!(submittedAt instanceof Date) ||
                !(verifiedAt instanceof Date)) {
                return null;
            }
            const start = submittedAt.getTime();
            const end = verifiedAt.getTime();
            if (!Number.isFinite(start) ||
                !Number.isFinite(end) ||
                end < start) {
                return null;
            }
            return (end -
                start) /
                (60 *
                    1000);
        })
            .filter((value) => typeof value === "number" &&
            Number.isFinite(value));
        const averageReviewMinutes = durations.length > 0
            ? Number((durations.reduce((total, value) => total + value, 0) /
                durations.length).toFixed(2))
            : null;
        res.setHeader("Cache-Control", "no-store");
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
    }
    catch (error) {
        console.error("GET ADMIN KYC OVERVIEW ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to load KYC overview.",
        });
    }
};
exports.getAdminKycOverviewController = getAdminKycOverviewController;
