"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitKYC = exports.startKYC = exports.getKYCStatus = void 0;
const User_js_1 = require("../models/User.js");
const kycService_js_1 = require("../services/kycService.js");
const cloudinaryService_js_1 = require("../services/cloudinaryService.js");
const crypto_js_1 = require("../utils/crypto.js");
const kycAIReviewService_js_1 = require("../services/kycAIReviewService.js");
/* =========================================================
   ALLOWED DOCUMENT TYPES
========================================================= */
const allowedDocumentTypes = [
    "nid",
    "passport",
    "driving_license",
];
/* =========================================================
   HELPER - USER ID
========================================================= */
const getUserId = (req) => {
    if (!req.user?._id) {
        return null;
    }
    return req.user._id.toString();
};
/* =========================================================
   DOCUMENT NUMBER NORMALIZATION
========================================================= */
const normalizeDocumentNumber = (value) => {
    return value
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "");
};
/* =========================================================
   SAFE KYC DTO

   Never expose:
   - documentNumberEncrypted
   - documentNumberLookup
   - Cloudinary private public IDs
========================================================= */
const toSafeKYC = (kyc) => {
    return {
        _id: kyc._id,
        userId: kyc.userId,
        documentType: typeof kyc.documentType === "string"
            ? kyc.documentType
            : undefined,
        provider: typeof kyc.provider === "string"
            ? kyc.provider
            : undefined,
        status: typeof kyc.status === "string"
            ? kyc.status
            : "not_started",
        rejectionReason: typeof kyc.rejectionReason === "string"
            ? kyc.rejectionReason
            : undefined,
        submittedAt: kyc.submittedAt,
        verifiedAt: kyc.verifiedAt,
        createdAt: kyc.createdAt,
        updatedAt: kyc.updatedAt,
        hasFrontImage: Boolean(kyc.frontImagePublicId),
        hasBackImage: Boolean(kyc.backImagePublicId),
        hasSelfieImage: Boolean(kyc.selfieImagePublicId),
    };
};
/* =========================================================
   GET KYC STATUS
   GET /api/kyc/status
========================================================= */
const getKYCStatus = async (req, res) => {
    try {
        /* ===============================================
           AUTH CHECK
        =============================================== */
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        /* ===============================================
           GET OR CREATE KYC RECORD
        =============================================== */
        const kyc = await (0, kycService_js_1.getOrCreateKYC)(userId);
        /* ===============================================
           GET USER KYC STATUS
        =============================================== */
        const user = await User_js_1.User.findById(userId).select("kycStatus");
        if (!user) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }
        /* ===============================================
           RESPONSE
        =============================================== */
        res.status(200).json({
            success: true,
            kyc: toSafeKYC(kyc),
            userKycStatus: user.kycStatus ??
                "not_started",
        });
    }
    catch (error) {
        console.error("Get KYC status error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch KYC status",
        });
    }
};
exports.getKYCStatus = getKYCStatus;
/* =========================================================
   START KYC
   POST /api/kyc/start

   IMPORTANT:
   This endpoint does NOT require:
   - documentType
   - documentNumber
   - images

   It only creates / reads the user's KYC record.
========================================================= */
const startKYC = async (req, res) => {
    try {
        /* ===============================================
           AUTH CHECK
        =============================================== */
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        /* ===============================================
           USER CHECK
        =============================================== */
        const user = await User_js_1.User.findById(userId).select("kycStatus");
        if (!user) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }
        /* ===============================================
           GET OR CREATE KYC
        =============================================== */
        const kyc = await (0, kycService_js_1.getOrCreateKYC)(userId);
        /* ===============================================
           VERIFIED
        =============================================== */
        if (kyc.status ===
            "verified") {
            res.status(200).json({
                success: true,
                message: "Your identity is already verified.",
                kyc: toSafeKYC(kyc),
                userKycStatus: user.kycStatus,
            });
            return;
        }
        /* ===============================================
           ALREADY UNDER REVIEW
        =============================================== */
        if (kyc.status ===
            "under_review") {
            res.status(200).json({
                success: true,
                message: "Your KYC application is already under review.",
                kyc: toSafeKYC(kyc),
                userKycStatus: user.kycStatus,
            });
            return;
        }
        /* ===============================================
           READY
  
           No document validation here.
           Frontend can now open step 1.
        =============================================== */
        res.status(200).json({
            success: true,
            message: "KYC verification started successfully.",
            kyc: toSafeKYC(kyc),
            userKycStatus: user.kycStatus ??
                "not_started",
        });
    }
    catch (error) {
        console.error("Start KYC error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to start KYC verification",
        });
    }
};
exports.startKYC = startKYC;
/* =========================================================
   SUBMIT KYC
   PUT /api/kyc/submit

   Content-Type:
   multipart/form-data

   Fields:
   - documentType
   - documentNumber
   - frontImage
   - backImage
   - selfieImage
========================================================= */
const submitKYC = async (req, res) => {
    try {
        /* ===============================================
           AUTH CHECK
        =============================================== */
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        /* ===============================================
           USER CHECK
        =============================================== */
        const user = await User_js_1.User.findById(userId).select("kycStatus");
        if (!user) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }
        /* ===============================================
           GET / CREATE KYC
  
           Safer than requiring /start to have run first.
        =============================================== */
        const kyc = await (0, kycService_js_1.getOrCreateKYC)(userId);
        /* ===============================================
           PREVENT INVALID RESUBMISSION
        =============================================== */
        if (kyc.status ===
            "verified") {
            res.status(409).json({
                success: false,
                message: "Your KYC is already verified.",
            });
            return;
        }
        if (kyc.status ===
            "under_review") {
            res.status(409).json({
                success: false,
                message: "Your KYC application is already under review.",
            });
            return;
        }
        /* ===============================================
           BODY
  
           multipart/form-data fields are strings.
        =============================================== */
        const rawDocumentType = typeof req.body
            ?.documentType ===
            "string"
            ? req.body.documentType
                .trim()
                .toLowerCase()
            : "";
        const normalizedDocumentNumber = typeof req.body
            ?.documentNumber ===
            "string"
            ? normalizeDocumentNumber(req.body.documentNumber)
            : "";
        /* ===============================================
           DOCUMENT TYPE VALIDATION
        =============================================== */
        if (!rawDocumentType ||
            !allowedDocumentTypes.includes(rawDocumentType)) {
            res.status(400).json({
                success: false,
                message: "Invalid document type.",
            });
            return;
        }
        const documentType = rawDocumentType;
        /* ===============================================
           DOCUMENT NUMBER VALIDATION
        =============================================== */
        if (!normalizedDocumentNumber) {
            res.status(400).json({
                success: false,
                message: "Document number is required.",
            });
            return;
        }
        if (normalizedDocumentNumber.length <
            4) {
            res.status(400).json({
                success: false,
                message: "Please provide a valid document number.",
            });
            return;
        }
        /* ===============================================
           FILES
        =============================================== */
        const files = req.files;
        const frontImage = files?.frontImage?.[0];
        const backImage = files?.backImage?.[0];
        const selfieImage = files?.selfieImage?.[0];
        /* ===============================================
           FRONT IMAGE REQUIRED
        =============================================== */
        if (!frontImage) {
            res.status(400).json({
                success: false,
                message: "Front document image is required.",
            });
            return;
        }
        /* ===============================================
           BACK IMAGE
  
           Required for:
           - NID
           - Driving License
  
           Passport can submit without back image.
        =============================================== */
        const backImageRequired = documentType === "nid" ||
            documentType ===
                "driving_license";
        if (backImageRequired &&
            !backImage) {
            res.status(400).json({
                success: false,
                message: documentType === "nid"
                    ? "Back document image is required for NID."
                    : "Back document image is required for driving license.",
            });
            return;
        }
        /* ===============================================
           SELFIE REQUIRED
        =============================================== */
        if (!selfieImage) {
            res.status(400).json({
                success: false,
                message: "Selfie image is required.",
            });
            return;
        }
        /* ===============================================
           SAVE IDENTITY INFO BEFORE UPLOAD
        =============================================== */
        kyc.documentType =
            documentType;
        /*
         * Store the document number only as encrypted data.
         * The lookup HMAC supports future equality checks without
         * putting the original identity number in MongoDB.
         */
        kyc.documentNumberEncrypted =
            (0, crypto_js_1.encryptData)(normalizedDocumentNumber);
        kyc.documentNumberLookup =
            (0, crypto_js_1.createLookupHash)(normalizedDocumentNumber);
        kyc.provider =
            "manual";
        /* ===============================================
           CLOUDINARY UPLOAD
        =============================================== */
        console.log("KYC: uploading verification images...");
        /*
         * Front + selfie are always required.
         */
        const [frontUpload, selfieUpload,] = await Promise.all([
            (0, cloudinaryService_js_1.uploadKYCImage)(frontImage.buffer, userId, "front"),
            (0, cloudinaryService_js_1.uploadKYCImage)(selfieImage.buffer, userId, "selfie"),
        ]);
        /* ===============================================
           BACK UPLOAD
        =============================================== */
        let backUpload = null;
        if (backImage) {
            backUpload =
                await (0, cloudinaryService_js_1.uploadKYCImage)(backImage.buffer, userId, "back");
        }
        /* ===============================================
           SAVE CLOUDINARY PRIVATE PUBLIC IDS
        =============================================== */
        kyc.frontImagePublicId =
            frontUpload.public_id;
        kyc.selfieImagePublicId =
            selfieUpload.public_id;
        if (backUpload) {
            kyc.backImagePublicId =
                backUpload.public_id;
        }
        else {
            kyc.backImagePublicId =
                undefined;
        }
        /*
         * Private Cloudinary assets:
         * do not store public secure_url.
         */
        kyc.frontImageUrl =
            undefined;
        kyc.backImageUrl =
            undefined;
        kyc.selfieImageUrl =
            undefined;
        /* ===============================================
           STATUS
        =============================================== */
        kyc.status =
            "under_review";
        kyc.submittedAt =
            new Date();
        kyc.verifiedAt =
            undefined;
        kyc.rejectionReason =
            undefined;
        await kyc.save();
        /* ===============================================
           UPDATE USER KYC STATUS
  
           User model currently uses:
           not_started | pending | verified | rejected
  
           So while KYC document is under_review,
           User kycStatus remains pending.
        =============================================== */
        await User_js_1.User.findByIdAndUpdate(userId, {
            kycStatus: "pending",
        });
        /* ===============================================
           AUTOMATED KYC SCREENING
  
           IMPORTANT:
           - Best-effort only.
           - AI failure MUST NOT fail the KYC submission.
           - AI does NOT approve/reject the applicant.
           - Final decision stays in the protected admin review route.
  
           Awaiting here is intentional because post-response
           fire-and-forget work may be unreliable on serverless.
        =============================================== */
        try {
            await (0, kycAIReviewService_js_1.runKycAiReviewForKyc)({
                kycId: kyc._id.toString(),
                triggeredBy: "automatic_submission",
            });
        }
        catch (aiError) {
            console.error("AUTOMATIC KYC AI REVIEW ERROR:", aiError);
        }
        /* ===============================================
           RESPONSE
        =============================================== */
        res.status(200).json({
            success: true,
            message: "KYC submitted successfully and is now under review.",
            kyc: {
                _id: kyc._id,
                userId: kyc.userId,
                documentType: kyc.documentType,
                status: kyc.status,
                provider: kyc.provider,
                submittedAt: kyc.submittedAt,
            },
            userKycStatus: "pending",
        });
    }
    catch (error) {
        console.error("Submit KYC error:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to submit KYC",
        });
    }
};
exports.submitKYC = submitKYC;
