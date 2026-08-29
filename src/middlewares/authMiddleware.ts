import {
  Request,
  Response,
  NextFunction,
} from "express";

import jwt from "jsonwebtoken";

import {
  User,
} from "../models/User.js";

/* =========================================================
   AUTH REQUEST
========================================================= */

export interface AuthRequest
  extends Request {
  user?: {
    _id: string;

    role:
      | "user"
      | "admin";
  };
}

/* =========================================================
   JWT PAYLOAD
========================================================= */

interface DecodedToken {
  id: string;

  role:
    | "user"
    | "admin";

  /*
   * Optional for backward compatibility with
   * JWTs created before authVersion existed.
   */
  authVersion?:
    number;

  iat?: number;
  exp?: number;
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
      let token:
        | string
        | undefined;

      /* =====================================================
         1. BEARER TOKEN
      ====================================================== */

      const authorization =
        req.headers.authorization;

      if (
        authorization &&
        authorization.startsWith(
          "Bearer "
        )
      ) {
        token =
          authorization
            .split(" ")[1]
            ?.trim();
      }

      /* =====================================================
         2. HTTPONLY COOKIE
      ====================================================== */

      if (
        !token &&
        req.cookies?.access_token
      ) {
        token =
          req.cookies.access_token;
      }

      if (!token) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized, no token provided",
        });

        return;
      }

      const jwtSecret =
        process.env.JWT_SECRET;

      if (!jwtSecret) {
        console.error(
          "JWT_SECRET is missing"
        );

        res.status(
          500
        ).json({
          success: false,
          message:
            "Authentication service is not configured.",
        });

        return;
      }

      const decoded =
        jwt.verify(
          token,
          jwtSecret
        ) as DecodedToken;

      if (
        !decoded?.id
      ) {
        res.status(
          401
        ).json({
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
        res.status(
          401
        ).json({
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
        res.status(
          401
        ).json({
          success: false,
          message:
            "This account is no longer active.",
        });

        return;
      }

      /*
       * JWTs created before authVersion existed
       * behave as version 0. This avoids forcing an
       * immediate logout during the migration.
       */
      const tokenVersion =
        decoded.authVersion ??
        0;

      const userVersion =
        foundUser.authVersion ??
        0;

      if (
        tokenVersion !==
        userVersion
      ) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Session has been revoked. Please sign in again.",
        });

        return;
      }

      req.user = {
        _id:
          foundUser._id.toString(),

        role:
          foundUser.role,
      };

      next();
    } catch (
      error
    ) {
      console.error(
        "AUTH MIDDLEWARE ERROR:",
        error instanceof
          Error
          ? error.message
          : error
      );

      res.status(
        401
      ).json({
        success: false,
        message:
          "Not authorized, token failed",
      });
    }
  };
