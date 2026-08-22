import { Response } from "express";

import {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  KYC,
  DocumentType,
} from "../models/KYC.js";

import {
  User,
} from "../models/User.js";

import {
  getOrCreateKYC,
} from "../services/kycService.js";

import {
  uploadKYCImage,
} from "../services/cloudinaryService.js";

/* =========================================================
   ALLOWED DOCUMENT TYPES
========================================================= */

const allowedDocumentTypes: DocumentType[] = [
  "nid",
  "passport",
  "driving_license",
];

/* =========================================================
   GET KYC STATUS
   GET /api/kyc/status
========================================================= */

export const getKYCStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({
        success: false,
        message: "Not authorized",
      });

      return;
    }

    const kyc =
      await getOrCreateKYC(
        req.user._id
      );

    const user =
      await User.findById(
        req.user._id
      ).select("kycStatus");

    res.status(200).json({
      success: true,
      kyc,
      userKycStatus:
        user?.kycStatus ??
        "not_started",
    });
  } catch (error) {
    console.error(
      "Get KYC status error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to fetch KYC status",
    });
  }
};

/* =========================================================
   START / SAVE KYC
   POST /api/kyc/start
========================================================= */

export const startKYC = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({
        success: false,
        message: "Not authorized",
      });

      return;
    }

    const {
      documentType,
      documentNumber,
    } =
      req.body as {
        documentType?: DocumentType;
        documentNumber?: string;
      };

    /* =====================================================
       DOCUMENT TYPE
    ====================================================== */

    if (
      !documentType ||
      !allowedDocumentTypes.includes(
        documentType
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "Invalid document type",
      });

      return;
    }

    /* =====================================================
       DOCUMENT NUMBER
    ====================================================== */

    const normalizedDocumentNumber =
      typeof documentNumber === "string"
        ? documentNumber.trim()
        : "";

    if (!normalizedDocumentNumber) {
      res.status(400).json({
        success: false,
        message:
          "Document number is required",
      });

      return;
    }

    /* =====================================================
       CREATE / UPDATE KYC
    ====================================================== */

    const kyc =
      await KYC.findOneAndUpdate(
        {
          userId:
            req.user._id,
        },
        {
          userId:
            req.user._id,

          documentType,

          documentNumber:
            normalizedDocumentNumber,

          provider:
            "manual",

          status:
            "pending",

          rejectionReason:
            undefined,
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert:
            true,
        }
      );

    /* =====================================================
       UPDATE USER KYC STATUS
    ====================================================== */

    await User.findByIdAndUpdate(
      req.user._id,
      {
        kycStatus:
          "pending",
      }
    );

    res.status(200).json({
      success: true,
      message:
        "KYC application started",
      kyc,
      userKycStatus:
        "pending",
    });
  } catch (error) {
    console.error(
      "Start KYC error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to start KYC verification",
    });
  }
};

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

export const submitKYC = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
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

    const kyc =
      await KYC.findOne({
        userId:
          req.user._id,
      });

    if (!kyc) {
      res.status(404).json({
        success: false,
        message:
          "KYC application not found",
      });

      return;
    }

    /* =====================================================
       PREVENT INVALID RESUBMISSION
    ====================================================== */

    if (
      kyc.status === "verified"
    ) {
      res.status(400).json({
        success: false,
        message:
          "Your KYC is already verified.",
      });

      return;
    }

    if (
      kyc.status === "under_review"
    ) {
      res.status(400).json({
        success: false,
        message:
          "Your KYC is already under review.",
      });

      return;
    }

    /* =====================================================
       BODY
    ====================================================== */

    const {
      documentType,
      documentNumber,
    } =
      req.body as {
        documentType?: DocumentType;
        documentNumber?: string;
      };

    /* =====================================================
       DOCUMENT TYPE
    ====================================================== */

    if (documentType) {
      if (
        !allowedDocumentTypes.includes(
          documentType
        )
      ) {
        res.status(400).json({
          success: false,
          message:
            "Invalid document type",
        });

        return;
      }

      kyc.documentType =
        documentType;
    }

    /* =====================================================
       DOCUMENT NUMBER
    ====================================================== */

    if (
      typeof documentNumber ===
        "string" &&
      documentNumber.trim()
    ) {
      kyc.documentNumber =
        documentNumber.trim();
    }

    /* =====================================================
       VALIDATE DOCUMENT INFORMATION
    ====================================================== */

    if (
      !kyc.documentType ||
      !kyc.documentNumber
    ) {
      res.status(400).json({
        success: false,
        message:
          "Complete identity information first",
      });

      return;
    }

    /* =====================================================
       FILES
    ====================================================== */

    const files =
      req.files as
        | {
            [
              fieldname: string
            ]: Express.Multer.File[];
          }
        | undefined;

    const frontImage =
      files?.frontImage?.[0];

    const backImage =
      files?.backImage?.[0];

    const selfieImage =
      files?.selfieImage?.[0];

    /* =====================================================
       REQUIRED FRONT
    ====================================================== */

    if (!frontImage) {
      res.status(400).json({
        success: false,
        message:
          "Front document image is required",
      });

      return;
    }

    /* =====================================================
       REQUIRED BACK FOR NID
    ====================================================== */

    if (
      kyc.documentType === "nid" &&
      !backImage
    ) {
      res.status(400).json({
        success: false,
        message:
          "Back document image is required for NID",
      });

      return;
    }

    /* =====================================================
       REQUIRED SELFIE
    ====================================================== */

    if (!selfieImage) {
      res.status(400).json({
        success: false,
        message:
          "Selfie image is required",
      });

      return;
    }

    /* =====================================================
       CLOUDINARY UPLOAD
    ====================================================== */

    console.log(
      "KYC: uploading front image..."
    );

    const frontUpload =
      await uploadKYCImage(
        frontImage.buffer,
        req.user._id,
        "front"
      );

    console.log(
      "KYC: front uploaded:",
      frontUpload.public_id
    );

    console.log(
      "KYC: uploading selfie..."
    );

    const selfieUpload =
      await uploadKYCImage(
        selfieImage.buffer,
        req.user._id,
        "selfie"
      );

    console.log(
      "KYC: selfie uploaded:",
      selfieUpload.public_id
    );

    let backUpload:
      | Awaited<
          ReturnType<typeof uploadKYCImage>
        >
      | null = null;

    if (backImage) {
      console.log(
        "KYC: uploading back image..."
      );

      backUpload =
        await uploadKYCImage(
          backImage.buffer,
          req.user._id,
          "back"
        );

      console.log(
        "KYC: back uploaded:",
        backUpload.public_id
      );
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

    await User.findByIdAndUpdate(
      req.user._id,
      {
        kycStatus:
          "pending",
      }
    );

    /* =====================================================
       RESPONSE
    ====================================================== */

    res.status(200).json({
      success: true,

      message:
        "KYC submitted for review",

      kyc: {
        _id: kyc._id,
        userId: kyc.userId,
        documentType:
          kyc.documentType,

        /*
         * Do not return document number or
         * private Cloudinary IDs unnecessarily.
         */

        status: kyc.status,

        submittedAt:
          kyc.submittedAt,
      },

      userKycStatus:
        "pending",
    });
  } catch (error: unknown) {
    console.error(
      "Submit KYC error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to submit KYC",
    });
  }
};