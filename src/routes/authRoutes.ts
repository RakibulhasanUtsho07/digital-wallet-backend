import express from "express";

import {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";

const router =
  express.Router();

/* =========================================================
   REGISTER
   POST /api/auth/register
========================================================= */

router.post(
  "/register",
  registerUser
);

/* =========================================================
   LOGIN
   POST /api/auth/login
========================================================= */

router.post(
  "/login",
  loginUser
);

/* =========================================================
   LOGOUT
   POST /api/auth/logout
========================================================= */

router.post(
  "/logout",
  logoutUser
);

/* =========================================================
   FORGOT PASSWORD
   POST /api/auth/forgot-password
========================================================= */

router.post(
  "/forgot-password",
  forgotPassword
);

/* =========================================================
   RESET PASSWORD
   POST /api/auth/reset-password
========================================================= */

router.post(
  "/reset-password",
  resetPassword
);

export default router;