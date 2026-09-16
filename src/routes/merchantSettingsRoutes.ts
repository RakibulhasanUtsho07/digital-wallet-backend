import {
  Router,
} from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireMerchant,
} from "../middlewares/adminAuthorization.js";

import {
  securityReadLimiter,
  securitySensitiveLimiter,
} from "../middlewares/securityRateLimiters.js";

import {
  getMerchantSettingsController,
  updateMerchantBrandingSettingsController,
  updateMerchantBusinessSettingsController,
  updateMerchantCheckoutSettingsController,
  updateMerchantGeneralSettingsController,
  updateMerchantNotificationSettingsController,
  updateMerchantSecuritySettingsController,
} from "../controllers/merchantSettingsController.js";

import {
  getMerchantThemeController,
  resetMerchantThemeController,
  updateMerchantThemeController,
} from "../controllers/merchantThemeController.js";

const router =
  Router();

/* =========================================================
   MERCHANT SETTINGS

   Mounted at:

   /api/merchants
========================================================= */

/* =========================================================
   FULL SETTINGS
========================================================= */

router.get(
  "/settings",

  protect,

  requireMerchant,

  securityReadLimiter,

  getMerchantSettingsController,
);

/* =========================================================
   GENERAL
========================================================= */

router.patch(
  "/settings/general",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  updateMerchantGeneralSettingsController,
);

/* =========================================================
   BUSINESS
========================================================= */

router.patch(
  "/settings/business",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  updateMerchantBusinessSettingsController,
);

/* =========================================================
   CHECKOUT
========================================================= */

router.patch(
  "/settings/checkout",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  updateMerchantCheckoutSettingsController,
);

/* =========================================================
   BRANDING
========================================================= */

router.patch(
  "/settings/branding",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  updateMerchantBrandingSettingsController,
);

/* =========================================================
   THEME

   Dedicated lightweight routes so the dashboard shell can
   load appearance without requesting every settings section.
========================================================= */

router.get(
  "/settings/theme",

  protect,

  requireMerchant,

  securityReadLimiter,

  getMerchantThemeController,
);

router.patch(
  "/settings/theme",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  updateMerchantThemeController,
);

router.post(
  "/settings/theme/reset",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  resetMerchantThemeController,
);

/* =========================================================
   NOTIFICATIONS
========================================================= */

router.patch(
  "/settings/notifications",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  updateMerchantNotificationSettingsController,
);

/* =========================================================
   SECURITY
========================================================= */

router.patch(
  "/settings/security",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  updateMerchantSecuritySettingsController,
);

/* =========================================================
   EXPORT
========================================================= */

export default router;