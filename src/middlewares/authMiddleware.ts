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

      /* =====================================================
         NO TOKEN
      ====================================================== */

      if (!token) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized, no token provided",
        });

        return;
      }

      /* =====================================================
         JWT SECRET
      ====================================================== */

      const jwtSecret =
        process.env.JWT_SECRET;

      if (!jwtSecret) {
        console.error(
          "JWT_SECRET is missing"
        );

        res.status(500).json({
          success: false,
          message:
            "Authentication service is not configured.",
        });

        return;
      }

      /* =====================================================
         VERIFY JWT
      ====================================================== */

      const decoded =
        jwt.verify(
          token,
          jwtSecret
        ) as DecodedToken;

      if (!decoded?.id) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized, invalid token",
        });

        return;
      }

      /* =====================================================
         FIND USER
      ====================================================== */

      const foundUser =
        await User.findById(
          decoded.id
        ).select(
          "-password"
        );

      if (!foundUser) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized, user not found",
        });

        return;
      }

      /* =====================================================
         ATTACH USER
      ====================================================== */

      req.user = {
        _id:
          foundUser._id.toString(),

        role:
          foundUser.role,
      };

      next();
    } catch (error) {
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