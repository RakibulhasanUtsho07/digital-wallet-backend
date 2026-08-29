import express from "express";

import {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";

import {
  requireSignupsOpen,
} from "../middlewares/platformPolicyMiddleware.js";

const router =
  express.Router();

router.post(
  "/register",
  requireSignupsOpen,
  registerUser
);

router.post(
  "/login",
  loginUser
);

router.post(
  "/logout",
  logoutUser
);

router.post(
  "/forgot-password",
  forgotPassword
);

router.post(
  "/reset-password",
  resetPassword
);

export default router;
