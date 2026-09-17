import express from "express";

import {
  getKYCStatus,
  startKYC,
  submitKYC,
} from "../controllers/kycController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  kycUpload,
} from "../middlewares/kycUploadMiddleware.js";

const router =
  express.Router();

/* =========================================================
   GET KYC STATUS
========================================================= */

router.get(
  "/status",
  protect,
  getKYCStatus
);

/* =========================================================
   START KYC
========================================================= */

router.post(
  "/start",
  protect,
  startKYC
);

/* =========================================================
   SUBMIT KYC
========================================================= */

router.put(
  "/submit",
  protect,

  kycUpload.fields([
    {
      name: "frontImage",
      maxCount: 1,
    },

    {
      name: "backImage",
      maxCount: 1,
    },

    {
      name: "selfieImage",
      maxCount: 1,
    },
  ]),

  submitKYC
);

export default router;