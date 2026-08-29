import {
  Response,
  NextFunction,
} from "express";

import {
  AuthRequest,
} from "./authMiddleware.js";

/* =========================================================
   REQUIRE ADMIN
========================================================= */

/*
 * IMPORTANT:
 * This middleware must run AFTER protect.
 *
 * Correct:
 *
 * router.get(
 *   "/...",
 *   protect,
 *   requireAdmin,
 *   controller
 * );
 */

export const requireAdmin =
  (
    req:
      AuthRequest,
    res:
      Response,
    next:
      NextFunction
  ): void => {
    /* =====================================================
       AUTHENTICATED USER REQUIRED
    ====================================================== */

    if (
      !req.user?._id
    ) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Not authorized.",
      });

      return;
    }

    /* =====================================================
       ADMIN ROLE REQUIRED
    ====================================================== */

    if (
      req.user.role !==
      "admin"
    ) {
      res.status(
        403
      ).json({
        success:
          false,

        message:
          "Administrator access is required.",
      });

      return;
    }

    /* =====================================================
       CONTINUE
    ====================================================== */

    next();
  };
