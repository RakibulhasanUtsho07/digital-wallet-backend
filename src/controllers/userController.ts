import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";

// @desc    Get logged in user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id).select("-password");
    
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // ইউজারের ওয়ালেটের তথ্যও সাথে পাঠিয়ে দিচ্ছি
    const wallet = await Wallet.findOne({ userId: user._id });

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
      wallet: wallet ? {
        balance: wallet.balance,
        status: wallet.status,
      } : null
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};