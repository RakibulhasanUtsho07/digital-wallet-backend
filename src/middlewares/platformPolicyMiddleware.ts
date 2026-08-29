import {
  NextFunction,
  Response,
} from "express";

import type {
  AuthRequest,
} from "./authMiddleware.js";

import {
  getOrCreatePlatformSettings,
} from "../services/platformSettingsService.js";

/*
 * Put this before registerUser:
 *
 * router.post(
 *   "/register",
 *   requireSignupsOpen,
 *   registerUser
 * );
 */
export const requireSignupsOpen =
  async (
    _req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const settings =
        await getOrCreatePlatformSettings();

      if (
        settings.platform
          .maintenanceMode
      ) {
        res.status(
          503
        ).json({
          success:
            false,

          message:
            "Registration is temporarily unavailable during maintenance.",
        });

        return;
      }

      if (
        !settings.platform
          .allowSignups
      ) {
        res.status(
          403
        ).json({
          success:
            false,

          message:
            "New account registration is currently disabled.",
        });

        return;
      }

      next();
    } catch (
      error
    ) {
      console.error(
        "SIGNUP POLICY CHECK ERROR:",
        error
      );

      /*
       * Fail closed for security-sensitive platform policy.
       */
      res.status(
        503
      ).json({
        success:
          false,

        message:
          "Unable to verify registration policy.",
      });
    }
  };

/*
 * Use AFTER protect on routes that mutate wallet/platform data.
 * Admins are allowed through so they can recover the platform.
 */
export const blockUserMutationsDuringMaintenance =
  async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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

    if (
      req.user?.role ===
      "admin"
    ) {
      next();
      return;
    }

    try {
      const settings =
        await getOrCreatePlatformSettings();

      if (
        settings.platform
          .maintenanceMode
      ) {
        res.status(
          503
        ).json({
          success:
            false,

          code:
            "PLATFORM_MAINTENANCE",

          message:
            "Wallet operations are temporarily unavailable during maintenance.",
        });

        return;
      }

      next();
    } catch (
      error
    ) {
      console.error(
        "MAINTENANCE POLICY CHECK ERROR:",
        error
      );

      res.status(
        503
      ).json({
        success:
          false,

        message:
          "Unable to verify platform availability.",
      });
    }
  };
