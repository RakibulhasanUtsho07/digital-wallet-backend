import {
  randomUUID,
} from "node:crypto";

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  z,
} from "zod";

import {
  EKYCVerification,
} from "../models/EKYCVerification.js";

import {
  EKYCRateLimitError,
} from "../rate-limit/EKYCRateLimiter.js";

import {
  EKYCAlreadyVerifiedError,
  type EKYCOrchestrator,
} from "../services/EKYCOrchestrator.js";

import {
  InputValidationError,
} from "../validation.js";

/* =========================================================
   REQUEST SCHEMA
========================================================= */

const submissionSchema =
  z
    .object({
      nid:
        z
          .string()
          .trim()
          .min(10)
          .max(24),

      dateOfBirth:
        z
          .string()
          .trim()
          .length(10),

      claimedName:
        z
          .string()
          .trim()
          .min(2)
          .max(160),

      media:
        z
          .object({
            nidFrontObjectRef:
              z
                .string()
                .trim()
                .min(8)
                .max(500),

            nidBackObjectRef:
              z
                .string()
                .trim()
                .min(8)
                .max(500),

            selfieObjectRef:
              z
                .string()
                .trim()
                .min(8)
                .max(500),
          })
          .strict(),
    })
    .strict();

/* =========================================================
   AUTH CONTEXT
========================================================= */

export interface EKYCAuthContext {
  userId: string;

  /*
   * This must be a verified, server-issued and signed
   * device identifier. Do not trust a raw client header.
   */
  deviceId: string;
}

type GetAuthContext = (
  request: Request
) => EKYCAuthContext;

/* =========================================================
   ROUTER FACTORY
========================================================= */

export function createEKYCRouter(
  orchestrator:
    EKYCOrchestrator,

  getAuthContext:
    GetAuthContext
): express.Router {
  const router =
    express.Router();

  /* -------------------------------------------------------
     CREATE VERIFICATION
  ------------------------------------------------------- */

  router.post(
    "/verifications",

    async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const body =
          submissionSchema.parse(
            req.body
          );

        const auth =
          getAuthContext(req);

        const forwardedCorrelationId =
          req.get(
            "x-correlation-id"
          );

        const correlationId =
          (
            forwardedCorrelationId ||
            randomUUID()
          )
            .replace(
              /[^A-Za-z0-9_.:-]/g,
              ""
            )
            .slice(0, 120);

        const result =
          await orchestrator.submit({
            userId:
              auth.userId,

            nid:
              body.nid,

            dateOfBirth:
              body.dateOfBirth,

            claimedName:
              body.claimedName,

            media:
              body.media,

            ipAddress:
              req.ip ||
              req.socket
                .remoteAddress ||
              "unknown",

            deviceId:
              auth.deviceId,

            correlationId,
          });

        res.setHeader(
          "Cache-Control",
          "no-store"
        );

        res.status(202).json({
          success: true,
          message:
            result.status ===
            "QUEUED"
              ? "e-KYC verification has been queued."
              : "e-KYC verification requires manual review.",

          ...result,
        });
      } catch (error) {
        if (
          error instanceof
          z.ZodError
        ) {
          res
            .status(400)
            .json({
              success: false,

              message:
                error
                  .issues[0]
                  ?.message ||
                "Invalid e-KYC request.",
            });

          return;
        }

        if (
          error instanceof
          InputValidationError
        ) {
          res
            .status(400)
            .json({
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
          EKYCRateLimitError
        ) {
          res
            .status(429)
            .json({
              success: false,
              message:
                error.message,
            });

          return;
        }

        if (
          error instanceof
          EKYCAlreadyVerifiedError
        ) {
          res
            .status(409)
            .json({
              success: false,
              message:
                error.message,
            });

          return;
        }

        next(error);
      }
    }
  );

  /* -------------------------------------------------------
     GET VERIFICATION STATUS
  ------------------------------------------------------- */

  router.get(
    "/verifications/:id",

    async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const auth =
          getAuthContext(req);

        const verificationId =
          String(
            req.params.id
          );

        if (
          !/^[a-f\d]{24}$/i.test(
            verificationId
          )
        ) {
          res
            .status(400)
            .json({
              success: false,
              message:
                "Invalid verification ID.",
            });

          return;
        }

        const verification =
          await EKYCVerification
            .findOne({
              _id:
                verificationId,

              userId:
                auth.userId,
            })
            .select(
              [
                "status",
                "reasonCodes",
                "faceScore",
                "nameScore",
                "livenessPassed",
                "submittedAt",
                "decidedAt",
                "createdAt",
                "updatedAt",
              ].join(" ")
            )
            .lean();

        if (!verification) {
          res
            .status(404)
            .json({
              success: false,
              message:
                "e-KYC verification was not found.",
            });

          return;
        }

        res.setHeader(
          "Cache-Control",
          "no-store"
        );

        res
          .status(200)
          .json({
            success: true,
            verification,
          });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createEKYCRouter;