import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  MerchantSettingsValidationError,
  validateThemeSettings,
} from "../services/merchantSettingsValidation.js";

import {
  getMerchantThemeSettings,
  resetMerchantThemeSettings,
  updateMerchantThemeSettings,
} from "../services/merchantSettingsService.js";

/* =========================================================
   OWNER
========================================================= */

function ownerIdFromRequest(
  req:
    AuthRequest,
): string {
  const ownerId =
    req.user?._id;

  if (!ownerId) {
    throw new MerchantSettingsValidationError(
      "Authentication is required.",
      401,
    );
  }

  return String(
    ownerId,
  );
}

/* =========================================================
   ERROR
========================================================= */

function sendError(
  res:
    Response,

  error:
    unknown,

  fallback:
    string,
): void {
  console.error(
    fallback,
    error,
  );

  if (
    error instanceof
    MerchantSettingsValidationError
  ) {
    res.status(
      error.statusCode,
    ).json({
      success:
        false,

      message:
        error.message,
    });

    return;
  }

  if (
    error instanceof
      Error &&
    error.name ===
      "ValidationError"
  ) {
    res.status(
      400,
    ).json({
      success:
        false,

      message:
        error.message,
    });

    return;
  }

  res.status(
    500,
  ).json({
    success:
      false,

    message:
      fallback,
  });
}

/* =========================================================
   GET THEME

   GET /api/merchants/settings/theme
========================================================= */

export async function getMerchantThemeController(
  req:
    AuthRequest,

  res:
    Response,
): Promise<void> {
  try {
    const result =
      await getMerchantThemeSettings(
        ownerIdFromRequest(
          req,
        ),
      );

    res.status(
      200,
    ).json({
      success:
        true,

      ...result,
    });
  } catch (
    error:
      unknown
  ) {
    sendError(
      res,
      error,
      "Unable to load merchant theme.",
    );
  }
}

/* =========================================================
   UPDATE THEME

   PATCH /api/merchants/settings/theme
========================================================= */

export async function updateMerchantThemeController(
  req:
    AuthRequest,

  res:
    Response,
): Promise<void> {
  try {
    const input =
      validateThemeSettings(
        req.body,
      );

    const result =
      await updateMerchantThemeSettings(
        ownerIdFromRequest(
          req,
        ),
        input,
      );

    res.status(
      200,
    ).json({
      success:
        true,

      message:
        "Merchant theme updated successfully.",

      ...result,
    });
  } catch (
    error:
      unknown
  ) {
    sendError(
      res,
      error,
      "Unable to update merchant theme.",
    );
  }
}

/* =========================================================
   RESET THEME

   POST /api/merchants/settings/theme/reset
========================================================= */

export async function resetMerchantThemeController(
  req:
    AuthRequest,

  res:
    Response,
): Promise<void> {
  try {
    const result =
      await resetMerchantThemeSettings(
        ownerIdFromRequest(
          req,
        ),
      );

    res.status(
      200,
    ).json({
      success:
        true,

      message:
        "Merchant theme restored to default.",

      ...result,
    });
  } catch (
    error:
      unknown
  ) {
    sendError(
      res,
      error,
      "Unable to reset merchant theme.",
    );
  }
}