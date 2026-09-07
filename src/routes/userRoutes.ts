import express from "express";

import {
  getUserProfile,
  getUserPreferences,
  updateUserPreferences,
} from "../controllers/userController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

const router =
  express.Router();

/* =========================================================
   PROFILE
========================================================= */

router.get(
  "/profile",
  protect,
  getUserProfile
);

/* =========================================================
   USER PREFERENCES
========================================================= */

router.get(
  "/preferences",
  protect,
  getUserPreferences
);

router.patch(
  "/preferences",
  protect,
  updateUserPreferences
);

export default router;