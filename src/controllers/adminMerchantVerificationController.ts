import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  approveMerchantVerification,
  getAdminMerchantVerification,
  listAdminMerchantVerifications,
  MerchantVerificationError,
  rejectMerchantVerification,
} from "../services/merchantVerificationService.js";

/* =========================================================
   HELPERS
========================================================= */

function adminIdOf(
  req: AuthRequest
): string {
  const adminId =
    req.user?._id;

  if (!adminId) {
    throw new MerchantVerificationError(
      "Authentication is required.",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  return String(adminId);
}

function stringValue(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function numberValue(
  value: unknown,
  fallback: number
): number {
  const parsed =
    typeof value === "string"
      ? Number(value)
      : Number.NaN;

  return Number.isInteger(
    parsed
  )
    ? parsed
    : fallback;
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

  res.status(500).json({
    success: false,
    message:
      "Unable to process the merchant verification review.",
  });
}

/* =========================================================
   LIST REVIEW QUEUE

   GET /api/admin/merchant-verifications
========================================================= */

export const listAdminMerchantVerificationsController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const result =
        await listAdminMerchantVerifications({
          status:
            stringValue(
              req.query.status
            ),

          search:
            stringValue(
              req.query.search
            ),

          page:
            numberValue(
              req.query.page,
              1
            ),

          limit:
            numberValue(
              req.query.limit,
              20
            ),
        });

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
        "LIST ADMIN MERCHANT VERIFICATIONS ERROR:",
        error
      );
    }
  };

/* =========================================================
   DETAILS WITH SHORT-LIVED PRIVATE DOCUMENT URLS

   GET /api/admin/merchant-verifications/:verificationId
========================================================= */

export const getAdminMerchantVerificationController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const result =
        await getAdminMerchantVerification(
          stringValue(
            req.params
              .verificationId
          )
        );

      res.setHeader(
        "Cache-Control",
        "no-store, private"
      );

      res.status(200).json({
        success: true,
        verification:
          result,
      });
    } catch (error) {
      sendError(
        res,
        "GET ADMIN MERCHANT VERIFICATION ERROR:",
        error
      );
    }
  };

/* =========================================================
   APPROVE

   POST /api/admin/merchant-verifications/:verificationId/approve
========================================================= */

export const approveMerchantVerificationController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const verification =
        await approveMerchantVerification({
          verificationId:
            stringValue(
              req.params
                .verificationId
            ),

          adminId:
            adminIdOf(req),

          internalNote:
            req.body
              ?.internalNote,
        });

      res.status(200).json({
        success: true,

        message:
          "Merchant verified. Live API access is now enabled.",

        verification,
      });
    } catch (error) {
      sendError(
        res,
        "APPROVE MERCHANT VERIFICATION ERROR:",
        error
      );
    }
  };

/* =========================================================
   REJECT

   POST /api/admin/merchant-verifications/:verificationId/reject
========================================================= */

export const rejectMerchantVerificationController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const verification =
        await rejectMerchantVerification({
          verificationId:
            stringValue(
              req.params
                .verificationId
            ),

          adminId:
            adminIdOf(req),

          reason:
            req.body?.reason,

          internalNote:
            req.body
              ?.internalNote,
        });

      res.status(200).json({
        success: true,

        message:
          "Merchant verification rejected. Live API access remains disabled.",

        verification,
      });
    } catch (error) {
      sendError(
        res,
        "REJECT MERCHANT VERIFICATION ERROR:",
        error
      );
    }
  };

