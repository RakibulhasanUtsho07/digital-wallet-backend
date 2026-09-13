import type {
  Request,
  Response,
  NextFunction,
} from "express";

import {
  User,
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
   AUTH REQUEST TYPE
========================================================= */

export interface AuthRequest
  extends Request {
  user?: {
    _id: string;

    /*
     * Must stay synchronized with UserRole.
     */
    role: UserRole;

    /*
     * Server-side authentication session ID.
     *
     * Used by:
     * - Security Center
     * - Active Sessions
     * - Current session detection
     * - Logout specific session
     * - Logout other sessions
     */
    sessionId?: string;

    /*
     * JWT issued-at timestamp.
     * Seconds since Unix epoch.
     */
    tokenIssuedAt?: number;
  };
}

/* =========================================================
   CONSTANTS
========================================================= */

/*
 * Avoid updating lastActiveAt on every API request.
 * A session activity update is performed at most once
 * every 5 minutes.
 */
const SESSION_ACTIVITY_REFRESH_MS =
  5 * 60 * 1000;

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
         READ TOKEN
      ==================================================== */

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

      /* ===================================================
         VERIFY JWT
      ==================================================== */

      const decoded =
        decodeSessionToken(
          token
        );

      if (
        !decoded ||
        !decoded.id
      ) {
        res.status(401).json({
          success: false,

          message:
            "Not authorized, invalid token",
        });

        return;
      }

      /* ===================================================
         LOAD USER
      ==================================================== */

      const foundUser =
        await User.findById(
          decoded.id
        )
          .select(
            "role authVersion accountStatus"
          )
          .lean();

      if (!foundUser) {
        res.status(401).json({
          success: false,

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
        res.status(401).json({
          success: false,

          message:
            "This account is no longer active.",
        });

        return;
      }

      /* ===================================================
         AUTH VERSION
      ==================================================== */

      const tokenVersion =
        Number(
          decoded.authVersion ?? 0
        );

      const userVersion =
        Number(
          foundUser.authVersion ?? 0
        );

      /*
       * authVersion is incremented when:
       * - password is reset
       * - sessions are globally revoked
       * - other security events require JWT invalidation
       */
      if (
        !Number.isInteger(
          tokenVersion
        ) ||
        tokenVersion < 0 ||
        !Number.isInteger(
          userVersion
        ) ||
        userVersion < 0 ||
        tokenVersion !==
          userVersion
      ) {
        res.status(401).json({
          success: false,

          code:
            "AUTH_VERSION_MISMATCH",

          message:
            "Session has been revoked. Please sign in again.",
        });

        return;
      }

      /* ===================================================
         SERVER-SIDE SESSION VALIDATION
      ==================================================== */

      /*
       * New security-enabled JWTs always contain `sid`.
       *
       * The sid connects:
       *
       * Browser
       *   ↓
       * JWT
       *   ↓
       * AuthSession
       *
       * This makes individual device/session revocation
       * possible without revoking every session.
       */

      let activeSession:
        | {
            _id: unknown;
            lastActiveAt?: Date;
          }
        | null = null;

      if (decoded.sid) {
        activeSession =
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
          })
            .select(
              "_id lastActiveAt"
            )
            .lean();

        if (!activeSession) {
          res.status(401).json({
            success: false,

            code:
              "SESSION_REVOKED_OR_EXPIRED",

            message:
              "Session is no longer active. Please sign in again.",
          });

          return;
        }

        /* =================================================
           REFRESH SESSION ACTIVITY
        ================================================== */

        const lastActiveTime =
          activeSession.lastActiveAt
            instanceof Date
            ? activeSession.lastActiveAt.getTime()
            : 0;

        const sessionActivityAge =
          Date.now() -
          lastActiveTime;

        if (
          sessionActivityAge >=
          SESSION_ACTIVITY_REFRESH_MS
        ) {
          /*
           * Update conditionally so a revoked/expired
           * session cannot accidentally be refreshed.
           */
          await AuthSession.updateOne(
            {
              _id:
                activeSession._id,

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
         ATTACH AUTH CONTEXT
      ==================================================== */

      req.user = {
        _id:
          foundUser._id.toString(),

        role:
          foundUser.role,

        /*
         * Important:
         * This comes from the verified JWT.
         *
         * Security Center can now use:
         * req.user.sessionId
         */
        sessionId:
          decoded.sid,

        tokenIssuedAt:
          decoded.iat,
      };

      /* ===================================================
         CONTINUE
      ==================================================== */

      next();
    } catch (
      error: unknown
    ) {
      /*
       * Never expose internal JWT, database,
       * crypto, or authentication implementation details.
       */
      console.error(
        "AUTH MIDDLEWARE ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      if (
        res.headersSent
      ) {
        return;
      }

      res.status(401).json({
        success: false,

        message:
          "Not authorized, token failed",
      });
    }
  };


  /* =========================================================
   ROLE-BASED ACCESS CONTROL
========================================================= */

/*
 * Allows only the supplied application roles.
 *
 * Important:
 * - `protect` must run before this middleware.
 * - This middleware never authenticates the user.
 * - It only checks the role already attached by `protect`.
 */
export const requireRoles =
  (...allowedRoles: UserRole[]) =>
  (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    /* =====================================================
       AUTHENTICATION CHECK
    ====================================================== */

    if (!req.user) {
      res.status(401).json({
        success: false,

        code: "AUTHENTICATION_REQUIRED",

        message:
          "Not authorized. Authentication is required.",
      });

      return;
    }

    /* =====================================================
       ROLE CHECK
    ====================================================== */

    if (
      !allowedRoles.includes(
        req.user.role
      )
    ) {
      res.status(403).json({
        success: false,

        code: "FORBIDDEN",

        message:
          "You do not have permission to access this resource.",
      });

      return;
    }

    /* =====================================================
       ACCESS GRANTED
    ====================================================== */

    next();
  };

/* =========================================================
   SUPPORT ROLE
========================================================= */

/*
 * Dedicated Support Agent access.
 *
 * Support agents are intentionally separated from:
 * - normal users
 * - merchants
 * - analysts
 * - admins
 * - super admins
 */
export const requireSupport =
  requireRoles("support");

/* =========================================================
   SUPPORT + ADMIN ACCESS
========================================================= */

/*
 * Used for shared support infrastructure where:
 *
 * Support Agent
 *     OR
 * Admin
 *     OR
 * Super Admin
 *
 * may access the resource.
 *
 * Existing Admin/Super Admin functionality remains intact.
 */
export const requireSupportOrAdmin =
  requireRoles(
    "support",
    "admin",
    "super_admin"
  );

/* =========================================================
   ADMIN + SUPER ADMIN ACCESS
========================================================= */

/*
 * Optional reusable replacement for duplicated
 * admin role checks.
 *
 * This does NOT replace any existing requireAdmin
 * middleware yet. It simply provides a compatible
 * role-based helper for future migration.
 */
export const requireAdminOrSuperAdmin =
  requireRoles(
    "admin",
    "super_admin"
  );