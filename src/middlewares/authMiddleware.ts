import type {
  Request,
  Response,
  NextFunction,
} from "express";

import {
  User,
} from "../models/User.js";

import {
  AuthSession,
} from "../models/AuthSession.js";

import {
  decodeSessionToken,
  readTokenFromRequest,
} from "../services/authSessionService.js";

/* =========================================================
   AUTH REQUEST TYPE
========================================================= */

export interface AuthRequest
  extends Request {
  user?: {
    _id: string;

    role:
      | "user"
      | "admin";

    /*
     * Added by the session-backed authentication system.
     * Security Center controllers use this to identify the
     * browser/device session that made the request.
     */
    sessionId?: string;

    /* JWT iat value (seconds since epoch). */
    tokenIssuedAt?: number;
  };
}

/* =========================================================
   PROTECT
========================================================= */

export const protect =
  async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const token =
        readTokenFromRequest(
          req
        );

      if (!token) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized, no token provided",
        });

        return;
      }

      const decoded =
        decodeSessionToken(
          token
        );

      if (!decoded?.id) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized, invalid token",
        });

        return;
      }

      const foundUser =
        await User.findById(
          decoded.id
        ).select(
          "role authVersion accountStatus"
        );

      if (!foundUser) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized, user not found",
        });

        return;
      }

      if (
        foundUser.accountStatus ===
        "deleted"
      ) {
        res.status(401).json({
          success: false,
          message:
            "This account is no longer active.",
        });

        return;
      }

      /* =====================================================
         AUTH VERSION CHECK
      ====================================================== */

      const tokenVersion =
        decoded.authVersion ?? 0;

      const userVersion =
        foundUser.authVersion ?? 0;

      if (
        tokenVersion !==
        userVersion
      ) {
        res.status(401).json({
          success: false,
          message:
            "Session has been revoked. Please sign in again.",
        });

        return;
      }

      /* =====================================================
         SERVER-SIDE SESSION CHECK
      ====================================================== */

      /*
       * sid is present on all new security-enabled JWTs.
       * Old tokens without sid remain temporarily compatible
       * so the upgrade does not instantly sign everyone out.
       * After a fresh login, the user receives a session-backed
       * JWT and Security Center session controls become active.
       */
      if (decoded.sid) {
        const session =
          await AuthSession.findOne({
            userId:
              foundUser._id,

            sessionId:
              decoded.sid,

            revokedAt: {
              $exists: false,
            },

            expiresAt: {
              $gt:
                new Date(),
            },
          }).select(
            "lastActiveAt"
          );

        if (!session) {
          res.status(401).json({
            success: false,
            message:
              "Session is no longer active. Please sign in again.",
          });

          return;
        }

        /*
         * Do not write on every API request. Refresh activity
         * at most once every five minutes.
         */
        if (
          Date.now() -
            session.lastActiveAt.getTime() >
          5 * 60 * 1000
        ) {
          session.lastActiveAt =
            new Date();

          await session.save();
        }
      }

      /* =====================================================
         ATTACH AUTH CONTEXT
      ====================================================== */

      req.user = {
        _id:
          foundUser._id.toString(),

        role:
          foundUser.role,

        sessionId:
          decoded.sid,

        tokenIssuedAt:
          decoded.iat,
      };

      next();
    } catch (
      error: unknown
    ) {
      console.error(
        "AUTH MIDDLEWARE ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(401).json({
        success: false,
        message:
          "Not authorized, token failed",
      });
    }
  };
