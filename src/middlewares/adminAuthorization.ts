import type {
  Response,
  NextFunction,
} from "express";

import type {
  AuthRequest,
} from "./authMiddleware.js";

/* =========================================================
   TYPES
========================================================= */

export type PlatformRole =
  | "user"
  | "merchant"
  | "support"
  | "analyst"
  | "admin"
  | "super_admin";

/* =========================================================
   COMMON RESPONSE HELPERS
========================================================= */

const unauthorized = (
  res: Response
): void => {
  res.status(401).json({
    success: false,
    message: "Not authorized.",
  });
};

const forbidden = (
  res: Response,
  message: string
): void => {
  res.status(403).json({
    success: false,
    message,
  });
};

/* =========================================================
   AUTHENTICATED USER CHECK
========================================================= */

const requireAuthenticatedUser = (
  req: AuthRequest,
  res: Response
): boolean => {
  if (!req.user?._id) {
    unauthorized(res);
    return false;
  }

  return true;
};

/* =========================================================
   ROLE CHECK
========================================================= */

/*
 * Generic role middleware.
 *
 * IMPORTANT:
 * This middleware must run AFTER protect.
 *
 * Example:
 *
 * router.get(
 *   "/...",
 *   protect,
 *   requireRoles("merchant"),
 *   controller
 * );
 */

export const requireRoles =
  (
    ...allowedRoles: PlatformRole[]
  ) => {
    return (
      req: AuthRequest,
      res: Response,
      next: NextFunction
    ): void => {
      /* ===================================================
         AUTHENTICATED USER REQUIRED
      ==================================================== */

      if (
        !requireAuthenticatedUser(
          req,
          res
        )
      ) {
        return;
      }

      /* ===================================================
         ROLE CHECK
      ==================================================== */

      const userRole =
        req.user?.role as PlatformRole;

      if (
        !allowedRoles.includes(
          userRole
        )
      ) {
        forbidden(
          res,
          "You do not have permission to access this resource."
        );

        return;
      }

      /* ===================================================
         CONTINUE
      ==================================================== */

      next();
    };
  };

/* =========================================================
   REQUIRE USER
========================================================= */

/*
 * Customer / personal wallet access.
 *
 * Super Admin is intentionally NOT included.
 *
 * This keeps customer-only endpoints isolated.
 */

export const requireUser =
  requireRoles(
    "user"
  );

/* =========================================================
   REQUIRE MERCHANT
========================================================= */

export const requireMerchant =
  requireRoles(
    "merchant"
  );

/* =========================================================
   REQUIRE SUPPORT
========================================================= */

export const requireSupport =
  requireRoles(
    "support"
  );

/* =========================================================
   REQUIRE ANALYST
========================================================= */

export const requireAnalyst =
  requireRoles(
    "analyst"
  );

/* =========================================================
   REQUIRE ADMIN
========================================================= */

/*
 * Existing application behaviour:
 *
 * requireAdmin()
 *     ↓
 * admin only
 *
 * We intentionally preserve this behaviour.
 *
 * SUPER ADMIN is handled separately through
 * requireAdminOrSuperAdmin().
 */

export const requireAdmin =
  (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    /* ===================================================
       AUTHENTICATED USER REQUIRED
    ==================================================== */

    if (
      !requireAuthenticatedUser(
        req,
        res
      )
    ) {
      return;
    }

    /* ===================================================
       ADMIN ROLE REQUIRED
    ==================================================== */

    if (
      req.user?.role !==
      "admin"
    ) {
      forbidden(
        res,
        "Administrator access is required."
      );

      return;
    }

    /* ===================================================
       CONTINUE
    ==================================================== */

    next();
  };

/* =========================================================
   REQUIRE SUPER ADMIN
========================================================= */

/*
 * Super Admin has global platform control.
 *
 * Example:
 *
 * router.post(
 *   "/platform-config",
 *   protect,
 *   requireSuperAdmin,
 *   controller
 * );
 */

export const requireSuperAdmin =
  (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    /* ===================================================
       AUTHENTICATED USER REQUIRED
    ==================================================== */

    if (
      !requireAuthenticatedUser(
        req,
        res
      )
    ) {
      return;
    }

    /* ===================================================
       SUPER ADMIN ROLE REQUIRED
    ==================================================== */

    if (
      req.user?.role !==
      "super_admin"
    ) {
      forbidden(
        res,
        "Super administrator access is required."
      );

      return;
    }

    /* ===================================================
       CONTINUE
    ==================================================== */

    next();
  };

/* =========================================================
   ADMIN OR SUPER ADMIN
========================================================= */

/*
 * Use this for normal administration features
 * where both Admin and Super Admin are allowed.
 *
 * Example:
 *
 * router.get(
 *   "/users",
 *   protect,
 *   requireAdminOrSuperAdmin,
 *   controller
 * );
 */

export const requireAdminOrSuperAdmin =
  (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    /* ===================================================
       AUTHENTICATED USER REQUIRED
    ==================================================== */

    if (
      !requireAuthenticatedUser(
        req,
        res
      )
    ) {
      return;
    }

    /* ===================================================
       ADMIN ROLE CHECK
    ==================================================== */

    if (
      req.user?.role !==
        "admin" &&
      req.user?.role !==
        "super_admin"
    ) {
      forbidden(
        res,
        "Administrator access is required."
      );

      return;
    }

    /* ===================================================
       CONTINUE
    ==================================================== */

    next();
  };

/* =========================================================
   INTERNAL OPERATIONS
========================================================= */

/*
 * Analyst + Support + Admin + Super Admin.
 *
 * Useful for internal operational tools where
 * customer users and merchants should not have access.
 *
 * Example:
 *
 * router.get(
 *   "/operations/...",
 *   protect,
 *   requireInternalOperations,
 *   controller
 * );
 */

export const requireInternalOperations =
  requireRoles(
    "support",
    "analyst",
    "admin",
    "super_admin"
  );

/* =========================================================
   BACK-OFFICE ACCESS
========================================================= */

/*
 * Support + Analyst + Admin + Super Admin.
 *
 * Similar to internal operations but named separately
 * so future permission rules can be evolved independently.
 */

export const requireBackOffice =
  requireRoles(
    "support",
    "analyst",
    "admin",
    "super_admin"
  );

/* =========================================================
   FINANCIAL OPERATIONS ACCESS
========================================================= */

/*
 * Financial operational access.
 *
 * This does NOT automatically grant permission to
 * perform every financial mutation.
 *
 * Action-level permissions should still be enforced
 * inside the relevant domain/service.
 */

export const requireFinancialOperations =
  requireRoles(
    "analyst",
    "admin",
    "super_admin"
  );

/* =========================================================
   MERCHANT PLATFORM ACCESS
========================================================= */

/*
 * Merchant dashboard + platform merchant operations.
 *
 * Admin and Super Admin are included because they may
 * need to inspect/manage merchant resources.
 */

export const requireMerchantPlatformAccess =
  requireRoles(
    "merchant",
    "admin",
    "super_admin"
  );

/* =========================================================
   ANALYTICS ACCESS
========================================================= */

/*
 * Analyst + Admin + Super Admin.
 *
 * Merchant analytics should use a dedicated merchant
 * authorization layer with merchant ownership checks.
 */

export const requireAnalyticsAccess =
  requireRoles(
    "analyst",
    "admin",
    "super_admin"
  );

/* =========================================================
   SUPPORT ACCESS
========================================================= */

/*
 * Support + Admin + Super Admin.
 *
 * Admin can inspect support operations.
 */

export const requireSupportAccess =
  requireRoles(
    "support",
    "admin",
    "super_admin"
  );

/* =========================================================
   ROLE UTILITY
========================================================= */

/*
 * Small reusable helper for controllers/services.
 *
 * This does NOT replace middleware.
 *
 * Example:
 *
 * if (hasRole(req.user?.role, "super_admin")) {
 *   ...
 * }
 */

export const hasRole = (
  role:
    | PlatformRole
    | undefined,
  ...allowedRoles: PlatformRole[]
): boolean => {
  if (!role) {
    return false;
  }

  return allowedRoles.includes(
    role
  );
};

/* =========================================================
   SUPER ADMIN CHECK
========================================================= */

export const isSuperAdmin = (
  req: AuthRequest
): boolean => {
  return (
    req.user?.role ===
    "super_admin"
  );
};

/* =========================================================
   ADMIN CHECK
========================================================= */

export const isAdmin = (
  req: AuthRequest
): boolean => {
  return (
    req.user?.role ===
    "admin"
  );
};

/* =========================================================
   ADMIN FAMILY CHECK
========================================================= */

export const isAdminLevel = (
  req: AuthRequest
): boolean => {
  return (
    req.user?.role ===
      "admin" ||
    req.user?.role ===
      "super_admin"
  );
};