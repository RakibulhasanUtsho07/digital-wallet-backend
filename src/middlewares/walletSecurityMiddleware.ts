import type {
  Response,
  NextFunction,
} from "express";

import type {
  AuthRequest,
} from "./authMiddleware.js";

import {
  WalletSecurityLock,
} from "../models/WalletSecurityLock.js";
import { Wallet } from "../models/Wallet.js";
import { syncWalletWithEKYC } from "../services/identityVerificationService.js";

export async function getWalletSecurityState(
  userId: string
): Promise<{
  frozen: boolean;
  blocked: boolean;
  frozenAt?: Date;
  reason?: string;
}> {
  const [lock, wallet] = await Promise.all([
    WalletSecurityLock.findOne({ userId })
      .select("frozen reason frozenAt")
      .lean(),
    Wallet.findOne({ userId })
      .select("status")
      .lean(),
  ]);

  return {
    frozen:
      Boolean(lock?.frozen) ||
      wallet?.status === "FROZEN",
    blocked:
      wallet?.status === "BLOCKED",
    frozenAt:
      lock?.frozenAt,
    reason:
      lock?.reason,
  };
}

/* Use on every route that can create, move, debit, or credit money. */
export const requireWalletNotFrozen =
  async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized.",
        });
        return;
      }

      const identity = await syncWalletWithEKYC(String(userId));
      if (identity !== "verified") {
        res.status(403).json({
          success: false,
          code: "EKYC_REQUIRED",
          message: "Complete e-KYC before using your wallet.",
          kycStatus: identity,
        });
        return;
      }

      const state =
        await getWalletSecurityState(
          String(userId)
        );

      if (state.blocked) {
        res.status(423).json({
          success: false,
          code: "WALLET_BLOCKED",
          message:
            "This wallet is blocked. Contact support before making a transaction.",
        });
        return;
      }

      if (state.frozen) {
        res.status(423).json({
          success: false,
          code: "WALLET_FROZEN",
          message:
            "This wallet is frozen. Unfreeze it from Security Center before making any transaction.",
          frozenAt:
            state.frozenAt,
          reason:
            state.reason,
        });
        return;
      }

      next();
    } catch (error) {
      console.error(
        "WALLET SECURITY CHECK ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to verify wallet security state.",
      });
    }
  };
