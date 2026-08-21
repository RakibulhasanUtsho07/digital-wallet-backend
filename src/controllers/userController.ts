import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";

/* =========================================================
   GET LOGGED-IN USER PROFILE
   GET /api/users/profile
   Private
========================================================= */

export const getUserProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({
        success: false,
        message: "Not authorized",
      });

      return;
    }

    const user = await User.findById(req.user._id)
      .select("-password");

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });

      return;
    }

    const wallet = await Wallet.findOne({
      userId: user._id,
    });

    res.status(200).json({
      success: true,

      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        kycStatus: user.kycStatus,
        createdAt: user.createdAt,
      },

      wallet: wallet
        ? {
            balance: wallet.balance,
            status: wallet.status,
          }
        : null,
    });
  } catch (error: unknown) {
    console.error("Get profile error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get user profile",
    });
  }
};