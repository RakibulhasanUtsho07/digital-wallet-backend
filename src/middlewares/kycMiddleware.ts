import { Response, NextFunction } from "express";
import { AuthRequest } from "./authMiddleware.js";
import { User } from "../models/User.js";

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
    ).select("kycStatus");

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    if (user.kycStatus !== "verified") {
      res.status(403).json({
        success: false,
        message:
          "KYC verification is required for this action.",
        kycStatus: user.kycStatus,
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