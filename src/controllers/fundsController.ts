import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { Wallet } from "../models/Wallet.js";

/* =========================================================
   HELPERS
========================================================= */

const getAmount = (value: unknown): number => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return NaN;
  }

  return amount;
};

const validateAmount = (amount: number): string | null => {
  if (!Number.isFinite(amount)) {
    return "Amount must be a valid number";
  }

  if (amount <= 0) {
    return "Amount must be greater than 0";
  }

  return null;
};

/* =========================================================
   DEPOSIT FUNDS
   POST /api/funds/deposit
   Protected
========================================================= */

export const depositFunds = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    /* -------------------------------------------------------
       AUTH CHECK
    ------------------------------------------------------- */

    if (!req.user?._id) {
      res.status(401).json({
        success: false,
        message: "Not authorized",
      });

      return;
    }

    /* -------------------------------------------------------
       GET AMOUNT
    ------------------------------------------------------- */

    const amount = getAmount(req.body?.amount);

    const amountError = validateAmount(amount);

    if (amountError) {
      res.status(400).json({
        success: false,
        message: amountError,
      });

      return;
    }

    /* -------------------------------------------------------
       FIND WALLET
    ------------------------------------------------------- */

    const wallet = await Wallet.findOne({
      userId: req.user._id,
    });

    if (!wallet) {
      res.status(404).json({
        success: false,
        message: "Wallet not found",
      });

      return;
    }

    /* -------------------------------------------------------
       WALLET STATUS
    ------------------------------------------------------- */

    // 👉 FIX: Changed "active" to "ACTIVE"
    if (
      wallet.status &&
      wallet.status !== "ACTIVE" 
    ) {
      res.status(403).json({
        success: false,
        message: "Wallet is not active",
        walletStatus: wallet.status,
      });

      return;
    }

    /* -------------------------------------------------------
       ATOMIC UPDATE
    ------------------------------------------------------- */

    const updatedWallet =
      await Wallet.findOneAndUpdate(
        {
          userId: req.user._id,
        },
        {
          $inc: {
            balance: amount,
          },
        },
        {
          new: true,
        }
      );

    if (!updatedWallet) {
      res.status(404).json({
        success: false,
        message: "Wallet not found",
      });

      return;
    }

    /* -------------------------------------------------------
       RESPONSE
    ------------------------------------------------------- */

    res.status(200).json({
      success: true,
      message: "Funds deposited successfully",

      wallet: {
        _id: updatedWallet._id,
        balance: updatedWallet.balance,
        status: updatedWallet.status,
      },

      transaction: {
        type: "deposit",
        amount,
      },
    });
  } catch (error: unknown) {
    console.error(
      "Deposit funds error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to deposit funds",
    });
  }
};

/* =========================================================
   WITHDRAW FUNDS
   POST /api/funds/withdraw
   Protected
========================================================= */

export const withdrawFunds = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    /* -------------------------------------------------------
       AUTH CHECK
    ------------------------------------------------------- */

    if (!req.user?._id) {
      res.status(401).json({
        success: false,
        message: "Not authorized",
      });

      return;
    }

    /* -------------------------------------------------------
       GET AMOUNT
    ------------------------------------------------------- */

    const amount = getAmount(req.body?.amount);

    const amountError = validateAmount(amount);

    if (amountError) {
      res.status(400).json({
        success: false,
        message: amountError,
      });

      return;
    }

    /* -------------------------------------------------------
       CHECK WALLET
    ------------------------------------------------------- */

    const wallet = await Wallet.findOne({
      userId: req.user._id,
    });

    if (!wallet) {
      res.status(404).json({
        success: false,
        message: "Wallet not found",
      });

      return;
    }

    /* -------------------------------------------------------
       WALLET STATUS
    ------------------------------------------------------- */

    // 👉 FIX: Changed "active" to "ACTIVE"
    if (
      wallet.status &&
      wallet.status !== "ACTIVE"
    ) {
      res.status(403).json({
        success: false,
        message: "Wallet is not active",
        walletStatus: wallet.status,
      });

      return;
    }

    /* -------------------------------------------------------
       INSUFFICIENT BALANCE CHECK
    ------------------------------------------------------- */

    if (wallet.balance < amount) {
      res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",

        wallet: {
          balance: wallet.balance,
        },
      });

      return;
    }

    /* -------------------------------------------------------
       ATOMIC WITHDRAW
       
       balance >= amount ensures two concurrent
       withdrawals cannot drive the balance below zero.
    ------------------------------------------------------- */

    const updatedWallet =
      await Wallet.findOneAndUpdate(
        {
          userId: req.user._id,
          balance: {
            $gte: amount,
          },
        },
        {
          $inc: {
            balance: -amount,
          },
        },
        {
          new: true,
        }
      );

    if (!updatedWallet) {
      res.status(400).json({
        success: false,
        message:
          "Insufficient wallet balance or wallet unavailable",
      });

      return;
    }

    /* -------------------------------------------------------
       RESPONSE
    ------------------------------------------------------- */

    res.status(200).json({
      success: true,
      message: "Funds withdrawn successfully",

      wallet: {
        _id: updatedWallet._id,
        balance: updatedWallet.balance,
        status: updatedWallet.status,
      },

      transaction: {
        type: "withdraw",
        amount,
      },
    });
  } catch (error: unknown) {
    console.error(
      "Withdraw funds error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to withdraw funds",
    });
  }
};