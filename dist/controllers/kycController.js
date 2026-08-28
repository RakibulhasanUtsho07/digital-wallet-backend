"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitKYC = exports.startKYC = exports.getKYCStatus = void 0;
const KYC_js_1 = require("../models/KYC.js");
const User_js_1 = require("../models/User.js");
const kycService_js_1 = require("../services/kycService.js");
const cloudinaryService_js_1 = require("../services/cloudinaryService.js");
/* =========================================================
   ALLOWED DOCUMENT TYPES
========================================================= */
const allowedDocumentTypes = [
    "nid",
    "passport",
    "driving_license",
];
/* =========================================================
   GET KYC STATUS
   GET /api/kyc/status
========================================================= */
const getKYCStatus = async (req, res) => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const kyc = await (0, kycService_js_1.getOrCreateKYC)(req.user._id);
        const user = await User_js_1.User.findById(req.user._id).select("kycStatus");
        res.status(200).json({
            success: true,
            kyc,
            userKycStatus: user?.kycStatus ??
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
   START / SAVE KYC
   POST /api/kyc/start
========================================================= */
const startKYC = async (req, res) => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const { documentType, documentNumber, } = req.body;
        /* =====================================================
           DOCUMENT TYPE
        ====================================================== */
        if (!documentType ||
            !allowedDocumentTypes.includes(documentType)) {
            res.status(400).json({
                success: false,
                message: "Invalid document type",
            });
            return;
        }
        /* =====================================================
           DOCUMENT NUMBER
        ====================================================== */
        const normalizedDocumentNumber = typeof documentNumber === "string"
            ? documentNumber.trim()
            : "";
        if (!normalizedDocumentNumber) {
            res.status(400).json({
                success: false,
                message: "Document number is required",
            });
            return;
        }
        /* =====================================================
           CREATE / UPDATE KYC
        ====================================================== */
        const kyc = await KYC_js_1.KYC.findOneAndUpdate({
            userId: req.user._id,
        }, {
            userId: req.user._id,
            documentType,
            documentNumber: normalizedDocumentNumber,
            provider: "manual",
            status: "pending",
            rejectionReason: undefined,
        }, {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        });
        /* =====================================================
           UPDATE USER KYC STATUS
        ====================================================== */
        await User_js_1.User.findByIdAndUpdate(req.user._id, {
            kycStatus: "pending",
        });
        res.status(200).json({
            success: true,
            message: "KYC application started",
            kyc,
            userKycStatus: "pending",
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
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        /* =====================================================
           FIND KYC
        ====================================================== */
        const kyc = await KYC_js_1.KYC.findOne({
            userId: req.user._id,
        });
        if (!kyc) {
            res.status(404).json({
                success: false,
                message: "KYC application not found",
            });
            return;
        }
        /* =====================================================
           PREVENT INVALID RESUBMISSION
        ====================================================== */
        if (kyc.status === "verified") {
            res.status(400).json({
                success: false,
                message: "Your KYC is already verified.",
            });
            return;
        }
        if (kyc.status === "under_review") {
            res.status(400).json({
                success: false,
                message: "Your KYC is already under review.",
            });
            return;
        }
        /* =====================================================
           BODY
        ====================================================== */
        const { documentType, documentNumber, } = req.body;
        /* =====================================================
           DOCUMENT TYPE
        ====================================================== */
        if (documentType) {
            if (!allowedDocumentTypes.includes(documentType)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid document type",
                });
                return;
            }
            kyc.documentType =
                documentType;
        }
        /* =====================================================
           DOCUMENT NUMBER
        ====================================================== */
        if (typeof documentNumber ===
            "string" &&
            documentNumber.trim()) {
            kyc.documentNumber =
                documentNumber.trim();
        }
        /* =====================================================
           VALIDATE DOCUMENT INFORMATION
        ====================================================== */
        if (!kyc.documentType ||
            !kyc.documentNumber) {
            res.status(400).json({
                success: false,
                message: "Complete identity information first",
            });
            return;
        }
        /* =====================================================
           FILES
        ====================================================== */
        const files = req.files;
        const frontImage = files?.frontImage?.[0];
        const backImage = files?.backImage?.[0];
        const selfieImage = files?.selfieImage?.[0];
        /* =====================================================
           REQUIRED FRONT
        ====================================================== */
        if (!frontImage) {
            res.status(400).json({
                success: false,
                message: "Front document image is required",
            });
            return;
        }
        /* =====================================================
           REQUIRED BACK FOR NID
        ====================================================== */
        if (kyc.documentType === "nid" &&
            !backImage) {
            res.status(400).json({
                success: false,
                message: "Back document image is required for NID",
            });
            return;
        }
        /* =====================================================
           REQUIRED SELFIE
        ====================================================== */
        if (!selfieImage) {
            res.status(400).json({
                success: false,
                message: "Selfie image is required",
            });
            return;
        }
        /* =====================================================
           CLOUDINARY UPLOAD
        ====================================================== */
        console.log("KYC: uploading front image...");
        const frontUpload = await (0, cloudinaryService_js_1.uploadKYCImage)(frontImage.buffer, req.user._id, "front");
        console.log("KYC: front uploaded:", frontUpload.public_id);
        console.log("KYC: uploading selfie...");
        const selfieUpload = await (0, cloudinaryService_js_1.uploadKYCImage)(selfieImage.buffer, req.user._id, "selfie");
        console.log("KYC: selfie uploaded:", selfieUpload.public_id);
        let backUpload = null;
        if (backImage) {
            console.log("KYC: uploading back image...");
            backUpload =
                await (0, cloudinaryService_js_1.uploadKYCImage)(backImage.buffer, req.user._id, "back");
            console.log("KYC: back uploaded:", backUpload.public_id);
        }
        /* =====================================================
           SAVE CLOUDINARY PUBLIC IDS
        ====================================================== */
        kyc.frontImagePublicId =
            frontUpload.public_id;
        kyc.selfieImagePublicId =
            selfieUpload.public_id;
        if (backUpload) {
            kyc.backImagePublicId =
                backUpload.public_id;
        }
        /*
         * We intentionally do NOT save Cloudinary secure_url
         * into the KYC document for private assets.
         */
        kyc.frontImageUrl =
            undefined;
        kyc.backImageUrl =
            undefined;
        kyc.selfieImageUrl =
            undefined;
        /* =====================================================
           UPDATE STATUS
        ====================================================== */
        kyc.status =
            "under_review";
        kyc.submittedAt =
            new Date();
        kyc.provider =
            "manual";
        kyc.rejectionReason =
            undefined;
        await kyc.save();
        /* =====================================================
           UPDATE USER STATUS
        ====================================================== */
        await User_js_1.User.findByIdAndUpdate(req.user._id, {
            kycStatus: "pending",
        });
        /* =====================================================
           RESPONSE
        ====================================================== */
        res.status(200).json({
            success: true,
            message: "KYC submitted for review",
            kyc: {
                _id: kyc._id,
                userId: kyc.userId,
                documentType: kyc.documentType,
                /*
                 * Do not return document number or
                 * private Cloudinary IDs unnecessarily.
                 */
                status: kyc.status,
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
