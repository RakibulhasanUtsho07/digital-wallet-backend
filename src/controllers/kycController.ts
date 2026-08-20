import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { KYC } from "../models/KYC.js";
import { User } from "../models/User.js";

// @desc    Submit KYC verification
// @route   POST /api/kyc/submit
// @access  Private
export const submitKYC = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { documentType, documentNumber, documentUrl } = req.body;
    const userId = req.user?._id;

    if (!documentType || !documentNumber) {
      res.status(400).json({ message: "Document type and number are required" });
      return;
    }

    const existingKYC = await KYC.findOne({ userId });
    if (existingKYC) {
      if (existingKYC.status === "VERIFIED") {
        res.status(400).json({ message: "Your KYC is already verified" });
        return;
      }
      existingKYC.documentType = documentType;
      existingKYC.documentNumber = documentNumber;
      existingKYC.documentUrl = documentUrl || existingKYC.documentUrl;
      existingKYC.status = "PENDING";
      await existingKYC.save();

      await User.findByIdAndUpdate(userId, { kycStatus: "PENDING" });

      res.status(200).json({ message: "KYC resubmitted successfully", kyc: existingKYC });
      return;
    }

    const kyc = await KYC.create({
      userId,
      documentType,
      documentNumber,
      documentUrl: documentUrl || "",
      status: "PENDING",
    });

    await User.findByIdAndUpdate(userId, { kycStatus: "PENDING" });

    res.status(201).json({ message: "KYC submitted successfully", kyc });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user KYC status
// @route   GET /api/kyc/status
// @access  Private
export const getKYCStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const kyc = await KYC.findOne({ userId });

    if (!kyc) {
      res.status(200).json({ status: "NOT_SUBMITTED", message: "No KYC record found" });
      return;
    }

    res.status(200).json({ success: true, kyc });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};