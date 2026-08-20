import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { KYC } from "../models/KYC.js";
import { User } from "../models/User.js";

// @desc    Get all registered users
// @route   GET /api/admin/users
// @access  Private/Admin
export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: users.length, users });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all pending KYC requests
// @route   GET /api/admin/kyc/pending
// @access  Private/Admin
export const getPendingKYCs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const kycs = await KYC.find({ status: "PENDING" }).populate("userId", "name email phone");
    res.status(200).json({ success: true, count: kycs.length, kycs });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve or Reject KYC Request
// @route   PATCH /api/admin/kyc/:id/review
// @access  Private/Admin
export const reviewKYC = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, rejectionReason } = req.body;
    const { id } = req.params;

    if (!["VERIFIED", "REJECTED"].includes(status)) {
      res.status(400).json({ message: "Invalid status. Must be VERIFIED or REJECTED" });
      return;
    }

    const kyc = await KYC.findById(id);
    if (!kyc) {
      res.status(404).json({ message: "KYC record not found" });
      return;
    }

    kyc.status = status;
    kyc.rejectionReason = status === "REJECTED" ? rejectionReason || "Documents not valid" : "";
    kyc.reviewedBy = req.user?._id as any;
    await kyc.save();

    // Update user model kycStatus
    await User.findByIdAndUpdate(kyc.userId, { kycStatus: status });

    res.status(200).json({ message: `KYC request ${status.toLowerCase()} successfully`, kyc });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};