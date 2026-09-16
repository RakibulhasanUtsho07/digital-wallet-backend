import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  MerchantSettingsValidationError,
  validateBrandingSettings,
  validateBusinessSettings,
  validateCheckoutSettings,
  validateGeneralSettings,
  validateNotificationSettings,
  validateSecuritySettings,
} from "../services/merchantSettingsValidation.js";

import {
  getMerchantSettings,
  updateMerchantBrandingSettings,
  updateMerchantBusinessSettings,
  updateMerchantCheckoutSettings,
  updateMerchantGeneralSettings,
  updateMerchantNotificationSettings,
  updateMerchantSecuritySettings,
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
   GET ALL
========================================================= */

export async function getMerchantSettingsController(
  req:
    AuthRequest,

  res:
    Response,
): Promise<void> {
  try {
    const data =
      await getMerchantSettings(
        ownerIdFromRequest(
          req,
        ),
      );

    res.status(
      200,
    ).json({
      success:
        true,

      data,
    });
  } catch (
    error:
      unknown
  ) {
    sendError(
      res,
      error,
      "Unable to load merchant settings.",
    );
  }
}

/* =========================================================
   GENERAL
========================================================= */

export async function updateMerchantGeneralSettingsController(
  req:
    AuthRequest,

  res:
    Response,
): Promise<void> {
  try {
    const input =
      validateGeneralSettings(
        req.body,
      );

    const settings =
      await updateMerchantGeneralSettings(
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
        "General settings updated successfully.",

      settings:
        settings.general,

      revision:
        settings.revision,

      updatedAt:
        settings.updatedAt,
    });
  } catch (
    error:
      unknown
  ) {
    sendError(
      res,
      error,
      "Unable to update general settings.",
    );
  }
}

/* =========================================================
   BUSINESS
========================================================= */

export async function updateMerchantBusinessSettingsController(
  req:
    AuthRequest,

  res:
    Response,
): Promise<void> {
  try {
    const input =
      validateBusinessSettings(
        req.body,
      );

    const settings =
      await updateMerchantBusinessSettings(
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
        "Business settings updated successfully.",

      settings:
        settings.business,

      revision:
        settings.revision,

      updatedAt:
        settings.updatedAt,
    });
  } catch (
    error:
      unknown
  ) {
    sendError(
      res,
      error,
      "Unable to update business settings.",
    );
  }
}

/* =========================================================
   CHECKOUT
========================================================= */

export async function updateMerchantCheckoutSettingsController(
  req:
    AuthRequest,

  res:
    Response,
): Promise<void> {
  try {
    const input =
      validateCheckoutSettings(
        req.body,
      );

    const settings =
      await updateMerchantCheckoutSettings(
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
        "Checkout settings updated successfully.",

      settings:
        settings.checkout,

      revision:
        settings.revision,

      updatedAt:
        settings.updatedAt,
    });
  } catch (
    error:
      unknown
  ) {
    sendError(
      res,
      error,
      "Unable to update checkout settings.",
    );
  }
}

/* =========================================================
   BRANDING
========================================================= */

export async function updateMerchantBrandingSettingsController(
  req:
    AuthRequest,

  res:
    Response,
): Promise<void> {
  try {
    const input =
      validateBrandingSettings(
        req.body,
      );

    const settings =
      await updateMerchantBrandingSettings(
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
        "Branding settings updated successfully.",

      settings:
        settings.branding,

      revision:
        settings.revision,

      updatedAt:
        settings.updatedAt,
    });
  } catch (
    error:
      unknown
  ) {
    sendError(
      res,
      error,
      "Unable to update branding settings.",
    );
  }
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

export async function updateMerchantNotificationSettingsController(
  req:
    AuthRequest,

  res:
    Response,
): Promise<void> {
  try {
    const input =
      validateNotificationSettings(
        req.body,
      );

    const settings =
      await updateMerchantNotificationSettings(
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
        "Notification preferences updated successfully.",

      settings:
        settings.notifications,

      revision:
        settings.revision,

      updatedAt:
        settings.updatedAt,
    });
  } catch (
    error:
      unknown
  ) {
    sendError(
      res,
      error,
      "Unable to update notification settings.",
    );
  }
}

/* =========================================================
   SECURITY
========================================================= */

export async function updateMerchantSecuritySettingsController(
  req:
    AuthRequest,

  res:
    Response,
): Promise<void> {
  try {
    const input =
      validateSecuritySettings(
        req.body,
      );

    const settings =
      await updateMerchantSecuritySettings(
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
        "Security preferences updated successfully.",

      settings:
        settings.security,

      revision:
        settings.revision,

      updatedAt:
        settings.updatedAt,
    });
  } catch (
    error:
      unknown
  ) {
    sendError(
      res,
      error,
      "Unable to update security settings.",
    );
  }
}