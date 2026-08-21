import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import {
  KYC,
  DocumentType,
} from "../models/KYC.js";
import { User } from "../models/User.js";
import { getOrCreateKYC } from "../services/kycService.js";

/* =========================================================
   GET KYC STATUS
   GET /api/kyc/status
========================================================= */

export const getKYCStatus = async (
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

    const kyc = await getOrCreateKYC(
      req.user._id
    );

    const user = await User.findById(
      req.user._id
    ).select("kycStatus");

    res.status(200).json({
      success: true,
      kyc,
      userKycStatus:
        user?.kycStatus ?? "not_started",
    });
  } catch (error) {
    console.error(
      "Get KYC status error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to fetch KYC status",
    });
  }
};

/* =========================================================
   START / SAVE KYC
   POST /api/kyc/start
========================================================= */

export const startKYC = async (
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

    const {
      documentType,
      documentNumber,
    } = req.body as {
      documentType?: DocumentType;
      documentNumber?: string;
    };

    const allowedTypes: DocumentType[] = [
      "nid",
      "passport",
      "driving_license",
    ];

    if (
      !documentType ||
      !allowedTypes.includes(documentType)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid document type",
      });
      return;
    }

    if (!documentNumber?.trim()) {
      res.status(400).json({
        success: false,
        message:
          "Document number is required",
      });
      return;
    }

    const kyc = await KYC.findOneAndUpdate(
      {
        userId: req.user._id,
      },
      {
        userId: req.user._id,
        documentType,
        documentNumber:
          documentNumber.trim(),
        status: "pending",
        provider: "manual",
      },
      {
        new: true,
        upsert: true,
      }
    );

    await User.findByIdAndUpdate(
      req.user._id,
      {
        kycStatus: "pending",
      }
    );

    res.status(200).json({
      success: true,
      message: "KYC application started",
      kyc,
    });
  } catch (error) {
    console.error(
      "Start KYC error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to start KYC verification",
    });
  }
};

/* =========================================================
   SUBMIT KYC
   PUT /api/kyc/submit
========================================================= */

export const submitKYC = async (
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

    const kyc = await KYC.findOne({
      userId: req.user._id,
    });

    if (!kyc) {
      res.status(404).json({
        success: false,
        message:
          "KYC application not found",
      });
      return;
    }

    if (
      !kyc.documentType ||
      !kyc.documentNumber
    ) {
      res.status(400).json({
        success: false,
        message:
          "Complete identity information first",
      });
      return;
    }

    kyc.status = "under_review";
    kyc.submittedAt = new Date();

    await kyc.save();

    await User.findByIdAndUpdate(
      req.user._id,
      {
        kycStatus: "pending",
      }
    );

    res.status(200).json({
      success: true,
      message:
        "KYC submitted for review",
      kyc,
    });
  } catch (error) {
    console.error(
      "Submit KYC error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to submit KYC",
    });
  }
};