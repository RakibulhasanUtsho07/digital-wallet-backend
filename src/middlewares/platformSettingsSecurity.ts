import {
  NextFunction,
  Response,
} from "express";

import rateLimit from "express-rate-limit";

import type {
  AuthRequest,
} from "./authMiddleware.js";

const defaultTrustedOrigins =
  new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://digital-payment-system-web.vercel.app",
  ]);

const getTrustedOrigins =
  (): Set<string> => {
    const fromEnv =
      (
        process.env
          .TRUSTED_FRONTEND_ORIGINS ||
        ""
      )
        .split(
          ","
        )
        .map(
          (
            value
          ) =>
            value.trim()
        )
        .filter(
          Boolean
        );

    return new Set([
      ...defaultTrustedOrigins,
      ...fromEnv,
    ]);
  };

/*
 * Extra CSRF-style defense for privileged cookie-authenticated
 * mutations. CORS alone is not treated as authorization.
 */
export const requireTrustedAdminOrigin =
  (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (
      [
        "GET",
        "HEAD",
        "OPTIONS",
      ].includes(
        req.method
      )
    ) {
      next();
      return;
    }

    const origin =
      req.get(
        "origin"
      );

    const authorization =
      req.get(
        "authorization"
      );

    /*
     * Non-browser Bearer-token clients may omit Origin.
     */
    if (
      !origin &&
      authorization?.startsWith(
        "Bearer "
      )
    ) {
      next();
      return;
    }

    if (
      !origin ||
      !getTrustedOrigins().has(
        origin
      )
    ) {
      res.status(
        403
      ).json({
        success:
          false,

        message:
          "Untrusted request origin.",
      });

      return;
    }

    next();
  };

export const requireJsonMutation =
  (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (
      [
        "PATCH",
        "POST",
        "PUT",
        "DELETE",
      ].includes(
        req.method
      ) &&
      !req.is(
        "application/json"
      )
    ) {
      res.status(
        415
      ).json({
        success:
          false,

        message:
          "Content-Type application/json is required.",
      });

      return;
    }

    next();
  };

export const noStoreAdminResponse =
  (
    _req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    res.setHeader(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    next();
  };

export const adminSettingsReadLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    max:
      120,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many platform settings requests. Please try again later.",
    },
  });

export const adminSettingsWriteLimiter =
  rateLimit({
    windowMs:
      10 *
      60 *
      1000,

    max:
      12,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many privileged configuration changes. Please try again later.",
    },
  });
