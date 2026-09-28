import express from "express";

import { protect, type AuthRequest } from "../middlewares/authMiddleware.js";
import { currentEKYCStatus } from "../services/identityVerificationService.js";

const router =
  express.Router();

/* =========================================================
   GET KYC STATUS
========================================================= */

router.get("/status", protect, async (req, res, next) => {
  try {
    const id = (req as AuthRequest).user?._id;
    if (!id) { res.status(401).json({ success: false, message: "Not authorized." }); return; }
    const status = await currentEKYCStatus(String(id));
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, kyc: { status }, userKycStatus: status });
  } catch (error) { next(error); }
});

/* =========================================================
   START KYC
========================================================= */

router.post("/start", protect, (_req, res) => {
  res.status(410).json({ success: false, message: "Use the e-KYC verification flow." });
});

/* =========================================================
   SUBMIT KYC
========================================================= */

router.put("/submit", protect, (_req, res) => {
  res.status(410).json({ success: false, message: "Use the e-KYC verification flow." });
});

export default router;
