import type {
  Response,
  NextFunction,
} from "express";

import type {
  AuthRequest,
} from "./authMiddleware.js";

import type {
  UserRole,
} from "../models/User.js";

/* =========================================================
   RESPONSE HELPERS
========================================================= */

const unauthorized = (
  res:
    Response
): void => {
  res.status(
    401
  ).json({
    success:
      false,

    code:
      "AUTHENTICATION_REQUIRED",

    message:
      "Not authorized.",
  });
};

const forbidden = (
  res:
    Response,

  message:
    string
): void => {
  res.status(
    403
  ).json({
    success:
      false,

    code:
      "FORBIDDEN",

    message,
  });
};

/* =========================================================
   AUTH CHECK
========================================================= */

const requireAuthenticatedUser =
  (
    req:
      AuthRequest,

    res:
      Response
  ): boolean => {
    if (
      !req.user?._id
    ) {
      unauthorized(
        res
      );

      return false;
    }

    return true;
  };

/* =========================================================
   GENERIC ROLE MIDDLEWARE

   IMPORTANT:
   protect MUST run before this middleware.

   protect already normalizes the MongoDB role and stores
   the canonical value in req.user.role.
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
      !requireAuthenticatedUser(
        req,
        res
      )
    ) {
      return;
    }

    const userRole =
      req.user!.role;

    if (
      !allowedRoles.includes(
        userRole
      )
    ) {
      console.warn(
        "RBAC ACCESS DENIED:",
        {
          path:
            req.originalUrl,

          userId:
            req.user?._id,

          currentRole:
            userRole,

          allowedRoles,
        }
      );

      forbidden(
        res,
        "You do not have permission to access this resource."
      );

      return;
    }

    next();
  };

/* =========================================================
   NORMAL USER
========================================================= */

export const requireUser =
  requireRoles(
    "user"
  );

/* =========================================================
   MERCHANT
========================================================= */

export const requireMerchant =
  requireRoles(
    "merchant"
  );

/* =========================================================
   SUPPORT
========================================================= */

export const requireSupport =
  requireRoles(
    "support"
  );

/* =========================================================
   ANALYST
========================================================= */

export const requireAnalyst =
  requireRoles(
    "analyst"
  );

/* =========================================================
   ADMIN ONLY
========================================================= */

export const requireAdmin =
  (
    req:
      AuthRequest,

    res:
      Response,

    next:
      NextFunction
  ): void => {
    if (
      !requireAuthenticatedUser(
        req,
        res
      )
    ) {
      return;
    }

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

    next();
  };

/* =========================================================
   SUPER ADMIN ONLY
========================================================= */

export const requireSuperAdmin =
  (
    req:
      AuthRequest,

    res:
      Response,

    next:
      NextFunction
  ): void => {
    if (
      !requireAuthenticatedUser(
        req,
        res
      )
    ) {
      return;
    }

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

    next();
  };

/* =========================================================
   ADMIN OR SUPER ADMIN
========================================================= */

export const requireAdminOrSuperAdmin =
  requireRoles(
    "admin",
    "super_admin"
  );

/* =========================================================
   INTERNAL OPERATIONS
========================================================= */

export const requireInternalOperations =
  requireRoles(
    "support",
    "analyst",
    "admin",
    "super_admin"
  );

/* =========================================================
   BACK OFFICE
========================================================= */

export const requireBackOffice =
  requireRoles(
    "support",
    "analyst",
    "admin",
    "super_admin"
  );

/* =========================================================
   FINANCIAL OPERATIONS
========================================================= */

export const requireFinancialOperations =
  requireRoles(
    "analyst",
    "admin",
    "super_admin"
  );

/* =========================================================
   MERCHANT PLATFORM
========================================================= */

export const requireMerchantPlatformAccess =
  requireRoles(
    "merchant",
    "admin",
    "super_admin"
  );

/* =========================================================
   ANALYTICS

   Analyst dashboard APIs:

   analyst
   admin
   super_admin

   Normal users, merchants and support agents are NOT
   automatically granted analyst access.
========================================================= */

export const requireAnalyticsAccess =
  requireRoles(
    "analyst",
    "admin",
    "super_admin"
  );

/* =========================================================
   SUPPORT ACCESS
========================================================= */

export const requireSupportAccess =
  requireRoles(
    "support",
    "admin",
    "super_admin"
  );

/* =========================================================
   ROLE HELPERS
========================================================= */

export const hasRole = (
  role:
    | UserRole
    | undefined,

  ...allowedRoles:
    UserRole[]
): boolean => {
  if (
    !role
  ) {
    return false;
  }

  return allowedRoles.includes(
    role
  );
};

export const isSuperAdmin = (
  req:
    AuthRequest
): boolean => {
  return (
    req.user?.role ===
    "super_admin"
  );
};

export const isAdmin = (
  req:
    AuthRequest
): boolean => {
  return (
    req.user?.role ===
    "admin"
  );
};

export const isAdminLevel = (
  req:
    AuthRequest
): boolean => {
  return (
    req.user?.role ===
      "admin" ||
    req.user?.role ===
      "super_admin"
  );
};