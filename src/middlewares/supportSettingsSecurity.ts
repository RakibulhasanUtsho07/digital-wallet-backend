import {
  NextFunction,
  Response,
} from "express";

import rateLimit from "express-rate-limit";

import type {
  AuthRequest,
} from "./authMiddleware.js";

/* =========================================================
   TRUSTED ORIGINS
========================================================= */

const DEFAULT_TRUSTED_ORIGINS =
  new Set<string>([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

function getTrustedOrigins(): Set<string> {
  const envOrigins =
    (
      process.env
        .TRUSTED_FRONTEND_ORIGINS ||
      process.env.FRONTEND_URL ||
      ""
    )
      .split(",")
      .map(
        (value) =>
          value
            .trim()
            .replace(
              /\/+$/,
              ""
            )
      )
      .filter(Boolean);

  return new Set([
    ...DEFAULT_TRUSTED_ORIGINS,
    ...envOrigins,
  ]);
}

/* =========================================================
   TRUSTED ORIGIN CHECK
========================================================= */

export const requireTrustedSupportOrigin =
  (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    /*
     * Safe/read-only HTTP methods do not mutate settings.
     */
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

    const rawOrigin =
      req.get(
        "origin"
      );

    const origin =
      rawOrigin
        ?.trim()
        .replace(
          /\/+$/,
          ""
        );

    /*
     * Server-to-server requests using Bearer authorization
     * may not contain a browser Origin header.
     */
    const authorization =
      req.get(
        "authorization"
      );

    if (
      !origin &&
      authorization
        ?.trim()
        .toLowerCase()
        .startsWith(
          "bearer "
        )
    ) {
      next();
      return;
    }

    if (!origin) {
      res.status(
        403
      ).json({
        success:
          false,

        code:
          "ORIGIN_REQUIRED",

        message:
          "Request origin is required.",
      });

      return;
    }

    const trustedOrigins =
      getTrustedOrigins();

    if (
      !trustedOrigins.has(
        origin
      )
    ) {
      res.status(
        403
      ).json({
        success:
          false,

        code:
          "UNTRUSTED_ORIGIN",

        message:
          "Untrusted request origin.",
      });

      return;
    }

    next();
  };

/* =========================================================
   REQUIRE JSON FOR WRITE REQUESTS
========================================================= */

export const requireSupportSettingsJson =
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
      ].includes(
        req.method
      )
    ) {
      if (
        !req.is(
          "application/json"
        )
      ) {
        res.status(
          415
        ).json({
          success:
            false,

          code:
            "JSON_REQUIRED",

          message:
            "Content-Type application/json is required.",
        });

        return;
      }
    }

    next();
  };

/* =========================================================
   NO STORE
========================================================= */

export const noStoreSupportSettings =
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

    res.setHeader(
      "Expires",
      "0"
    );

    next();
  };

/* =========================================================
   READ RATE LIMIT
========================================================= */

export const supportSettingsReadLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    limit:
      180,

    standardHeaders:
      "draft-7",

    legacyHeaders:
      false,

    message: {
      success:
        false,

      code:
        "SUPPORT_SETTINGS_READ_RATE_LIMIT",

      message:
        "Too many support settings requests. Please try again later.",
    },
  });

/* =========================================================
   WRITE RATE LIMIT
========================================================= */

export const supportSettingsWriteLimiter =
  rateLimit({
    windowMs:
      10 *
      60 *
      1000,

    limit:
      30,

    standardHeaders:
      "draft-7",

    legacyHeaders:
      false,

    message: {
      success:
        false,

      code:
        "SUPPORT_SETTINGS_WRITE_RATE_LIMIT",

      message:
        "Too many support settings changes. Please try again later.",
    },
  });