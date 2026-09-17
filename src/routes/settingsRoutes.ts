import express from "express";

import {
  deleteUserAccount,
  exportUserSettings,
  getCurrentSession,
  getUserSettings,
  logoutAllDevices,
  updateSettingsProfile,
  updateUserPreferences,
} from "../controllers/settingsController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

const router =
  express.Router();

/* =========================================================
   USER SETTINGS
========================================================= */

router.get(
  "/",
  protect,
  getUserSettings
);

router.patch(
  "/preferences",
  protect,
  updateUserPreferences
);

router.patch(
  "/profile",
  protect,
  updateSettingsProfile
);

/* =========================================================
   SESSION
========================================================= */

router.get(
  "/session",
  protect,
  getCurrentSession
);

router.post(
  "/logout-all",
  protect,
  logoutAllDevices
);

/* =========================================================
   EXPORT
========================================================= */

router.get(
  "/export",
  protect,
  exportUserSettings
);

/* =========================================================
   ACCOUNT DELETION
========================================================= */

router.delete(
  "/account",
  protect,
  deleteUserAccount
);

export default router;
