import {
  Response,
} from "express";

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

import {
  createLookupHash,
  encryptData,
} from "../utils/crypto.js";

/* =========================================================
   ALLOWED DOCUMENT TYPES
========================================================= */

const allowedDocumentTypes: DocumentType[] = [
  "nid",
  "passport",
  "driving_license",
];

/* =========================================================
   HELPER - USER ID
========================================================= */

const getUserId = (
  req: AuthRequest
): string | null => {
  if (!req.user?._id) {
    return null;
  }

  return req.user._id.toString();
};


/* =========================================================
   DOCUMENT NUMBER NORMALIZATION
========================================================= */

const normalizeDocumentNumber = (
  value: string
): string => {
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

const toSafeKYC = (
  kyc: {
    _id?: unknown;
    userId?: unknown;
    documentType?: unknown;
    provider?: unknown;
    status?: unknown;
    rejectionReason?: unknown;
    submittedAt?: unknown;
    verifiedAt?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    frontImagePublicId?: unknown;
    backImagePublicId?: unknown;
    selfieImagePublicId?: unknown;
  }
) => {
  return {
    _id:
      kyc._id,

    userId:
      kyc.userId,

    documentType:
      typeof kyc.documentType === "string"
        ? kyc.documentType
        : undefined,

    provider:
      typeof kyc.provider === "string"
        ? kyc.provider
        : undefined,

    status:
      typeof kyc.status === "string"
        ? kyc.status
        : "not_started",

    rejectionReason:
      typeof kyc.rejectionReason === "string"
        ? kyc.rejectionReason
        : undefined,

    submittedAt:
      kyc.submittedAt,

    verifiedAt:
      kyc.verifiedAt,

    createdAt:
      kyc.createdAt,

    updatedAt:
      kyc.updatedAt,

    hasFrontImage:
      Boolean(
        kyc.frontImagePublicId
      ),

    hasBackImage:
      Boolean(
        kyc.backImagePublicId
      ),

    hasSelfieImage:
      Boolean(
        kyc.selfieImagePublicId
      ),
  };
};

/* =========================================================
   GET KYC STATUS
   GET /api/kyc/status
========================================================= */

export const getKYCStatus =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /* ===============================================
         AUTH CHECK
      =============================================== */

      const userId =
        getUserId(req);

      if (!userId) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized",
        });

        return;
      }

      /* ===============================================
         GET OR CREATE KYC RECORD
      =============================================== */

      const kyc =
        await getOrCreateKYC(
          userId
        );

      /* ===============================================
         GET USER KYC STATUS
      =============================================== */

      const user =
        await User.findById(
          userId
        ).select(
          "kycStatus"
        );

      if (!user) {
        res.status(404).json({
          success: false,
          message:
            "User not found",
        });

        return;
      }

      /* ===============================================
         RESPONSE
      =============================================== */

      res.status(200).json({
        success: true,

        kyc:
          toSafeKYC(
            kyc
          ),

        userKycStatus:
          user.kycStatus ??
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
   START KYC
   POST /api/kyc/start

   IMPORTANT:
   This endpoint does NOT require:
   - documentType
   - documentNumber
   - images

   It only creates / reads the user's KYC record.
========================================================= */

export const startKYC =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /* ===============================================
         AUTH CHECK
      =============================================== */

      const userId =
        getUserId(req);

      if (!userId) {
        res.status(401).json({
          success: false,

          message:
            "Not authorized",
        });

        return;
      }

      /* ===============================================
         USER CHECK
      =============================================== */

      const user =
        await User.findById(
          userId
        ).select(
          "kycStatus"
        );

      if (!user) {
        res.status(404).json({
          success: false,

          message:
            "User not found",
        });

        return;
      }

      /* ===============================================
         GET OR CREATE KYC
      =============================================== */

      const kyc =
        await getOrCreateKYC(
          userId
        );

      /* ===============================================
         VERIFIED
      =============================================== */

      if (
        kyc.status ===
        "verified"
      ) {
        res.status(200).json({
          success: true,

          message:
            "Your identity is already verified.",

          kyc:
            toSafeKYC(
              kyc
            ),

          userKycStatus:
            user.kycStatus,
        });

        return;
      }

      /* ===============================================
         ALREADY UNDER REVIEW
      =============================================== */

      if (
        kyc.status ===
          "under_review"
      ) {
        res.status(200).json({
          success: true,

          message:
            "Your KYC application is already under review.",

          kyc:
            toSafeKYC(
              kyc
            ),

          userKycStatus:
            user.kycStatus,
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

        message:
          "KYC verification started successfully.",

        kyc:
          toSafeKYC(
            kyc
          ),

        userKycStatus:
          user.kycStatus ??
          "not_started",
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

   Content-Type:
   multipart/form-data

   Fields:
   - documentType
   - documentNumber
   - frontImage
   - backImage
   - selfieImage
========================================================= */

export const submitKYC =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /* ===============================================
         AUTH CHECK
      =============================================== */

      const userId =
        getUserId(req);

      if (!userId) {
        res.status(401).json({
          success: false,

          message:
            "Not authorized",
        });

        return;
      }

      /* ===============================================
         USER CHECK
      =============================================== */

      const user =
        await User.findById(
          userId
        ).select(
          "kycStatus"
        );

      if (!user) {
        res.status(404).json({
          success: false,

          message:
            "User not found",
        });

        return;
      }

      /* ===============================================
         GET / CREATE KYC

         Safer than requiring /start to have run first.
      =============================================== */

      const kyc =
        await getOrCreateKYC(
          userId
        );

      /* ===============================================
         PREVENT INVALID RESUBMISSION
      =============================================== */

      if (
        kyc.status ===
        "verified"
      ) {
        res.status(409).json({
          success: false,

          message:
            "Your KYC is already verified.",
        });

        return;
      }

      if (
        kyc.status ===
        "under_review"
      ) {
        res.status(409).json({
          success: false,

          message:
            "Your KYC application is already under review.",
        });

        return;
      }

      /* ===============================================
         BODY

         multipart/form-data fields are strings.
      =============================================== */

      const rawDocumentType =
        typeof req.body
          ?.documentType ===
        "string"
          ? req.body.documentType
              .trim()
              .toLowerCase()
          : "";

      const normalizedDocumentNumber =
        typeof req.body
          ?.documentNumber ===
        "string"
          ? normalizeDocumentNumber(
              req.body.documentNumber
            )
          : "";

      /* ===============================================
         DOCUMENT TYPE VALIDATION
      =============================================== */

      if (
        !rawDocumentType ||
        !allowedDocumentTypes.includes(
          rawDocumentType as DocumentType
        )
      ) {
        res.status(400).json({
          success: false,

          message:
            "Invalid document type.",
        });

        return;
      }

      const documentType =
        rawDocumentType as DocumentType;

      /* ===============================================
         DOCUMENT NUMBER VALIDATION
      =============================================== */

      if (
        !normalizedDocumentNumber
      ) {
        res.status(400).json({
          success: false,

          message:
            "Document number is required.",
        });

        return;
      }

      if (
        normalizedDocumentNumber.length <
        4
      ) {
        res.status(400).json({
          success: false,

          message:
            "Please provide a valid document number.",
        });

        return;
      }

      /* ===============================================
         FILES
      =============================================== */

      const files =
        req.files as
          | {
              [fieldname: string]:
                Express.Multer.File[];
            }
          | undefined;

      const frontImage =
        files?.frontImage?.[0];

      const backImage =
        files?.backImage?.[0];

      const selfieImage =
        files?.selfieImage?.[0];

      /* ===============================================
         FRONT IMAGE REQUIRED
      =============================================== */

      if (!frontImage) {
        res.status(400).json({
          success: false,

          message:
            "Front document image is required.",
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

      const backImageRequired =
        documentType === "nid" ||
        documentType ===
          "driving_license";

      if (
        backImageRequired &&
        !backImage
      ) {
        res.status(400).json({
          success: false,

          message:
            documentType === "nid"
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

          message:
            "Selfie image is required.",
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
        encryptData(
          normalizedDocumentNumber
        );

      kyc.documentNumberLookup =
        createLookupHash(
          normalizedDocumentNumber
        );

      kyc.provider =
        "manual";

      /* ===============================================
         CLOUDINARY UPLOAD
      =============================================== */

      console.log(
        "KYC: uploading verification images..."
      );

      /*
       * Front + selfie are always required.
       */

      const [
        frontUpload,
        selfieUpload,
      ] =
        await Promise.all([
          uploadKYCImage(
            frontImage.buffer,
            userId,
            "front"
          ),

          uploadKYCImage(
            selfieImage.buffer,
            userId,
            "selfie"
          ),
        ]);

      /* ===============================================
         BACK UPLOAD
      =============================================== */

      let backUpload:
        | Awaited<
            ReturnType<
              typeof uploadKYCImage
            >
          >
        | null = null;

      if (backImage) {
        backUpload =
          await uploadKYCImage(
            backImage.buffer,
            userId,
            "back"
          );
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
      } else {
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

      await User.findByIdAndUpdate(
        userId,
        {
          kycStatus:
            "pending",
        }
      );

      /* ===============================================
         RESPONSE
      =============================================== */

      res.status(200).json({
        success: true,

        message:
          "KYC submitted successfully and is now under review.",

        kyc: {
          _id:
            kyc._id,

          userId:
            kyc.userId,

          documentType:
            kyc.documentType,

          status:
            kyc.status,

          provider:
            kyc.provider,

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