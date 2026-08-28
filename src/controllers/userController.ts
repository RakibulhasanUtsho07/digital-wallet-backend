import { Response } from "express";

import {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  User,
} from "../models/User.js";

import {
  Wallet,
} from "../models/Wallet.js";

import {
  decryptData,
} from "../utils/crypto.js";

/* =========================================================
   SAFE DECRYPT
========================================================= */

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

const safeDecrypt = (
  value:
    | EncryptedValue
    | undefined
): string => {
  if (!value) {
    return "";
  }

  try {
    return decryptData(
      value
    );
  } catch (error) {
    console.error(
      "PROFILE CONTACT DECRYPT ERROR:",
      error
    );

    return "";
  }
};

/* =========================================================
   GET LOGGED-IN USER PROFILE
   GET /api/users/profile
   Private
========================================================= */

export const getUserProfile =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /* =====================================================
         AUTH
      ====================================================== */

      if (!req.user?._id) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized",
        });

        return;
      }

      /* =====================================================
         USER
      ====================================================== */

      const user =
        await User.findById(
          req.user._id
        ).select(
          "-password"
        );

      if (!user) {
        res.status(404).json({
          success: false,
          message:
            "User not found",
        });

        return;
      }

      /* =====================================================
         DECRYPT CONTACT DATA
      ====================================================== */

      const email =
        safeDecrypt(
          user.emailEncrypted
        );

      const phone =
        safeDecrypt(
          user.phoneEncrypted
        );

      /* =====================================================
         WALLET
      ====================================================== */

      const wallet =
        await Wallet.findOne({
          userId:
            user._id,
        });

      /* =====================================================
         RESPONSE
      ====================================================== */

      res.status(200).json({
        success: true,

        user: {
          _id:
            user._id,

          name:
            user.name,

          email,

          phone,

          role:
            user.role,

          kycStatus:
            user.kycStatus,

          createdAt:
            user.createdAt,
        },

        wallet:
          wallet
            ? {
                balance:
                  wallet.balance,

                status:
                  wallet.status,
              }
            : null,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "GET PROFILE ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get user profile",
      });
    }
  };