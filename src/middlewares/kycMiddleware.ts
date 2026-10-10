import { Response, NextFunction } from "express";
import { AuthRequest } from "./authMiddleware.js";
import { User } from "../models/User.js";
import { syncWalletWithEKYC } from "../services/identityVerificationService.js";

export const requireVerifiedKYC = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({
        success: false,
        message: "Not authorized",
      });
      return;
    }

    const user = await User.findById(
      req.user._id
    ).select("_id accountStatus deletedAt");

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const kycStatus = await syncWalletWithEKYC(String(user._id));
    if (user.accountStatus === "deleted" || user.deletedAt || kycStatus !== "verified") {
      res.status(403).json({
        success: false,
        message:
          "KYC verification is required for this action.",
        kycStatus,
      });
      return;
    }

    next();
  } catch (error) {
    console.error(
      "KYC middleware error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "KYC verification check failed",
    });
  }
};
