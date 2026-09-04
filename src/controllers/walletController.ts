import type { Response } from "express";

import type { AuthRequest } from "../middlewares/authMiddleware.js";
import { Wallet } from "../models/Wallet.js";

/* =========================================================
   RESPONSE CACHE POLICY
========================================================= */

function setPrivateNoStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

/* =========================================================
   GET MY WALLET
   GET /api/wallet

   Only fields required by the authenticated wallet UI are
   returned. Receiving remains a server-controlled operation;
   this endpoint never accepts or changes a balance.
========================================================= */

export const getMyWallet = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    setPrivateNoStore(res);

    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Not authorized.",
      });
      return;
    }

    const wallet = await Wallet.findOne({ userId })
      .select(
        "_id userId balance pendingBalance currency status createdAt updatedAt"
      )
      .lean();

    if (!wallet) {
      res.status(404).json({
        success: false,
        message: "Wallet not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      wallet,
    });
  } catch (error: unknown) {
    console.error(
      "GET WALLET ERROR:",
      error instanceof Error ? error.message : error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet information.",
    });
  }
};
