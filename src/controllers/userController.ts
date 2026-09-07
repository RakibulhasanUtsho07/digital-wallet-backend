import {
  Request,
  Response,
} from "express";

import {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  User,
  type ThemeMode,
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
   THEME VALIDATION
========================================================= */

const VALID_THEMES: readonly ThemeMode[] = [
  "light",
  "dark",
  "eye-care",
  "ocean",
  "forest",
];

const isValidTheme = (
  value: unknown
): value is ThemeMode => {
  return (
    typeof value === "string" &&
    VALID_THEMES.includes(
      value as ThemeMode
    )
  );
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

          preferences: {
            theme:
              user.preferences
                ?.theme ??
              "light",
          },
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

/* =========================================================
   GET USER PREFERENCES
   GET /api/users/preferences
   Private
========================================================= */

export const getUserPreferences =
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
          "preferences"
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
         RESPONSE
      ====================================================== */

      res.status(200).json({
        success: true,

        preferences: {
          theme:
            user.preferences
              ?.theme ??
            "light",
        },
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "GET USER PREFERENCES ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get user preferences",
      });
    }
  };

/* =========================================================
   UPDATE USER PREFERENCES
   PATCH /api/users/preferences
   Private
========================================================= */

export const updateUserPreferences =
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
         INPUT
      ====================================================== */

      const {
        theme,
      }: {
        theme?: unknown;
      } = req.body ?? {};

      /* =====================================================
         VALIDATE THEME
      ====================================================== */

      if (
        theme !==
        undefined &&
        !isValidTheme(theme)
      ) {
        res.status(400).json({
          success: false,
          message:
            "Invalid theme. Allowed themes are light, dark, eye-care, ocean and forest.",
        });

        return;
      }

      /*
       * At least one supported preference must
       * be provided.
       */
      if (
        theme === undefined
      ) {
        res.status(400).json({
          success: false,
          message:
            "No valid preference was provided.",
        });

        return;
      }

      /* =====================================================
         UPDATE
      ====================================================== */

      const updatedUser =
        await User.findByIdAndUpdate(
          req.user._id,
          {
            $set: {
              "preferences.theme":
                theme,
            },
          },
          {
            new: true,
            runValidators: true,
          }
        ).select(
          "preferences"
        );

      if (!updatedUser) {
        res.status(404).json({
          success: false,
          message:
            "User not found",
        });

        return;
      }

      /* =====================================================
         RESPONSE
      ====================================================== */

      res.status(200).json({
        success: true,

        message:
          "User preferences updated successfully.",

        preferences: {
          theme:
            updatedUser
              .preferences
              ?.theme ??
            "light",
        },
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "UPDATE USER PREFERENCES ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to update user preferences",
      });
    }
  };