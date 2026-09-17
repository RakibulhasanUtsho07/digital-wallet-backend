import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  MerchantDocumentError,
  type MerchantVerificationFiles,
} from "../services/merchantVerificationMediaService.js";

import {
  getMerchantVerificationStatus,
  MerchantVerificationError,
  submitMerchantVerification,
} from "../services/merchantVerificationService.js";

/* =========================================================
   HELPERS
========================================================= */

function ownerIdOf(
  req: AuthRequest
): string {
  const ownerId =
    req.user?._id;

  if (!ownerId) {
    throw new MerchantVerificationError(
      "Authentication is required.",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  return String(ownerId);
}

function uploadedFilesOf(
  req: AuthRequest
): MerchantVerificationFiles {
  const files =
    req.files as
      | Record<
          string,
          Express.Multer.File[]
        >
      | undefined;

  const registration =
    files
      ?.registrationDocument
      ?.[0];

  const tax =
    files
      ?.taxDocument
      ?.[0];

  const bank =
    files
      ?.bankDocument
      ?.[0];

  if (!registration) {
    throw new MerchantVerificationError(
      "A business registration document is required.",
      400,
      "INVALID_REQUEST"
    );
  }

  return {
    registration,
    tax,
    bank,
  };
}

function sendError(
  res: Response,
  label: string,
  error: unknown
): void {
  console.error(
    label,
    error
  );

  if (
    error instanceof
    MerchantVerificationError
  ) {
    res.status(
      error.statusCode
    ).json({
      success: false,
      code:
        error.code,
      message:
        error.message,
    });

    return;
  }

  if (
    error instanceof
    MerchantDocumentError
  ) {
    res.status(
      error.statusCode
    ).json({
      success: false,
      code:
        "INVALID_DOCUMENT",
      message:
        error.message,
    });

    return;
  }

  res.status(500).json({
    success: false,
    message:
      "Unable to process merchant verification.",
  });
}

/* =========================================================
   GET STATUS

   GET /api/merchants/verification
========================================================= */

export const getMerchantVerificationController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const result =
        await getMerchantVerificationStatus(
          ownerIdOf(req)
        );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      sendError(
        res,
        "GET MERCHANT VERIFICATION ERROR:",
        error
      );
    }
  };

/* =========================================================
   SUBMIT

   POST /api/merchants/verification/submit
========================================================= */

export const submitMerchantVerificationController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const result =
        await submitMerchantVerification({
          ownerId:
            ownerIdOf(req),

          legalBusinessName:
            req.body
              ?.legalBusinessName,

          registrationType:
            req.body
              ?.registrationType,

          registrationNumber:
            req.body
              ?.registrationNumber,

          businessAddress:
            req.body
              ?.businessAddress,

          files:
            uploadedFilesOf(req),
        });

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.status(201).json({
        success: true,

        message:
          "Business documents submitted for merchant verification.",

        data: result,
      });
    } catch (error) {
      sendError(
        res,
        "SUBMIT MERCHANT VERIFICATION ERROR:",
        error
      );
    }
  };

