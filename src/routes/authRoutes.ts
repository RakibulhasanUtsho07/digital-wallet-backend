import express from "express";

import {
  registerUser,
  loginUser,
  logoutUser,
} from "../controllers/authController.js";

const router = express.Router();

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

export default router;