import type {
  Request,
  Response,
  NextFunction,
} from "express";

import {
  User,
  normalizeUserRole,
  type UserRole,
} from "../models/User.js";

import {
  AuthSession,
} from "../models/AuthSession.js";

import {
  decodeSessionToken,
  readTokenFromRequest,
} from "../services/authSessionService.js";

/* =========================================================
   AUTH REQUEST
========================================================= */

export interface AuthRequest
  extends Request {
  user?: {
    _id:
      string;

    role:
      UserRole;

    sessionId?:
      string;

    tokenIssuedAt?:
      number;
  };
}

/* =========================================================
   CONSTANT
========================================================= */

const SESSION_ACTIVITY_REFRESH_MS =
  5 *
  60 *
  1000;

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
      /* ===================================================
         TOKEN
      ==================================================== */

      const token =
        readTokenFromRequest(
          req
        );

      if (
        !token
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "Not authorized, no token provided",
        });

        return;
      }

      /* ===================================================
         VERIFY TOKEN
      ==================================================== */

      const decoded =
        decodeSessionToken(
          token
        );

      if (
        !decoded?.id
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "Not authorized, invalid token",
        });

        return;
      }

      /* ===================================================
         CURRENT DATABASE USER
      ==================================================== */

      const foundUser =
        await User.findById(
          decoded.id
        )
          .select(
            "role authVersion accountStatus"
          )
          .lean();

      if (
        !foundUser
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "Not authorized, user not found",
        });

        return;
      }

      /* ===================================================
         ACCOUNT STATUS
      ==================================================== */

      if (
        foundUser.accountStatus ===
        "deleted"
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "This account is no longer active.",
        });

        return;
      }

      /* ===================================================
         CURRENT ROLE

         MongoDB is source of truth.

         Legacy development role values are normalized:

         analist -> analyst
         Analyst -> analyst
         super-admin -> super_admin
      ==================================================== */

      const currentRole =
        normalizeUserRole(
          foundUser.role
        );

      if (
        !currentRole
      ) {
        console.error(
          "AUTH ROLE ERROR:",
          {
            userId:
              foundUser._id.toString(),

            storedRole:
              foundUser.role,
          }
        );

        res.status(
          403
        ).json({
          success:
            false,

          code:
            "INVALID_ACCOUNT_ROLE",

          message:
            "This account has an invalid platform role.",
        });

        return;
      }

      /* ===================================================
         AUTH VERSION
      ==================================================== */

      const tokenVersion =
        Number(
          decoded.authVersion ??
            0
        );

      const userVersion =
        Number(
          foundUser.authVersion ??
            0
        );

      if (
        !Number.isInteger(
          tokenVersion
        ) ||
        tokenVersion <
          0 ||
        !Number.isInteger(
          userVersion
        ) ||
        userVersion <
          0 ||
        tokenVersion !==
          userVersion
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          code:
            "AUTH_VERSION_MISMATCH",

          message:
            "Session has been revoked. Please sign in again.",
        });

        return;
      }

      /* ===================================================
         SERVER SESSION
      ==================================================== */

      let activeSession:
        | {
            _id:
              unknown;

            lastActiveAt?:
              Date;
          }
        | null =
        null;

      if (
        decoded.sid
      ) {
        activeSession =
          await AuthSession.findOne(
            {
              userId:
                foundUser._id,

              sessionId:
                decoded.sid,

              revokedAt: {
                $exists:
                  false,
              },

              expiresAt: {
                $gt:
                  new Date(),
              },
            }
          )
            .select(
              "_id lastActiveAt"
            )
            .lean();

        if (
          !activeSession
        ) {
          res.status(
            401
          ).json({
            success:
              false,

            code:
              "SESSION_REVOKED_OR_EXPIRED",

            message:
              "Session is no longer active. Please sign in again.",
          });

          return;
        }

        /* =================================================
           REFRESH ACTIVITY
        ================================================== */

        const lastActiveTime =
          activeSession
            .lastActiveAt
            instanceof Date
            ? activeSession
                .lastActiveAt
                .getTime()
            : 0;

        const activityAge =
          Date.now() -
          lastActiveTime;

        if (
          activityAge >=
          SESSION_ACTIVITY_REFRESH_MS
        ) {
          await AuthSession.updateOne(
            {
              _id:
                activeSession._id,

              userId:
                foundUser._id,

              sessionId:
                decoded.sid,

              revokedAt: {
                $exists:
                  false,
              },

              expiresAt: {
                $gt:
                  new Date(),
              },
            },

            {
              $set: {
                lastActiveAt:
                  new Date(),
              },
            }
          );
        }
      }

      /* ===================================================
         AUTH CONTEXT

         IMPORTANT:
         current DB role is used instead of trusting
         JWT role for authorization.
      ==================================================== */

      req.user = {
        _id:
          foundUser._id.toString(),

        role:
          currentRole,

        sessionId:
          decoded.sid,

        tokenIssuedAt:
          decoded.iat,
      };

      next();
    } catch (
      error:
        unknown
    ) {
      console.error(
        "AUTH MIDDLEWARE ERROR:",
        error instanceof
          Error
          ? error.message
          : error
      );

      if (
        res.headersSent
      ) {
        return;
      }

      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Not authorized, token failed",
      });
    }
  };

/* =========================================================
   GENERIC ROLE ACCESS
========================================================= */

export const requireRoles =
  (
    ...allowedRoles:
      UserRole[]
  ) =>
  (
    req:
      AuthRequest,

    res:
      Response,

    next:
      NextFunction
  ): void => {
    if (
      !req.user
    ) {
      res.status(
        401
      ).json({
        success:
          false,

        code:
          "AUTHENTICATION_REQUIRED",

        message:
          "Not authorized. Authentication is required.",
      });

      return;
    }

    if (
      !allowedRoles.includes(
        req.user.role
      )
    ) {
      res.status(
        403
      ).json({
        success:
          false,

        code:
          "FORBIDDEN",

        message:
          "You do not have permission to access this resource.",
      });

      return;
    }

    next();
  };

/* =========================================================
   SUPPORT
========================================================= */

export const requireSupport =
  requireRoles(
    "support"
  );

/* =========================================================
   SUPPORT OR ADMIN
========================================================= */

export const requireSupportOrAdmin =
  requireRoles(
    "support",
    "admin",
    "super_admin"
  );

/* =========================================================
   ADMIN FAMILY
========================================================= */

export const requireAdminOrSuperAdmin =
  requireRoles(
    "admin",
    "super_admin"
  );