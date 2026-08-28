import {
  Request,
  Response,
  type CookieOptions,
} from "express";

import jwt from "jsonwebtoken";
import crypto from "crypto";

import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";

import {
  createLookupHash,
  encryptData,
  normalizeEmail,
  normalizePhone,
} from "../utils/crypto.js";

import {
  hashPassword,
  verifyPassword,
} from "../utils/password.js";

import {
  sendPasswordResetEmail,
} from "../utils/email.js";

/* =========================================================
   HELPERS
========================================================= */

const toStringValue = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value
    : "";
};

/* =========================================================
   ENVIRONMENT
========================================================= */

const isProductionEnvironment =
  (): boolean => {
    return (
      process.env.NODE_ENV ===
        "production" ||
      process.env.VERCEL === "1"
    );
  };

/* =========================================================
   JWT GENERATOR
========================================================= */

const generateToken = (
  id: string,
  role: "user" | "admin"
): string => {
  const secret =
    process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not defined."
    );
  }

  return jwt.sign(
    {
      id,
      role,
    },
    secret,
    {
      expiresIn: "30d",
    }
  );
};

/* =========================================================
   AUTH COOKIE OPTIONS
========================================================= */

const getAuthCookieOptions =
  (): CookieOptions => {
    const isProduction =
      isProductionEnvironment();

    return {
      /*
       * Browser JavaScript থেকে
       * auth token access করা যাবে না।
       */
      httpOnly: true,

      /*
       * Production HTTPS only.
       */
      secure:
        isProduction,

      /*
       * Local frontend/backend:
       * localhost
       *
       * Production:
       * different vercel.app origins
       */
      sameSite:
        isProduction
          ? "none"
          : "lax",

      path: "/",

      maxAge:
        30 *
        24 *
        60 *
        60 *
        1000,
    };
  };

/* =========================================================
   SET AUTH COOKIE
========================================================= */

const setAuthCookie = (
  res: Response,
  token: string
): void => {
  res.cookie(
    "access_token",
    token,
    getAuthCookieOptions()
  );
};

/* =========================================================
   CLEAR AUTH COOKIE
========================================================= */

const clearAuthCookie = (
  res: Response
): void => {
  const {
    httpOnly,
    secure,
    sameSite,
    path,
  } =
    getAuthCookieOptions();

  res.clearCookie(
    "access_token",
    {
      httpOnly,
      secure,
      sameSite,
      path,
    }
  );
};

/* =========================================================
   REGISTER USER
   POST /api/auth/register
========================================================= */

export const registerUser =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        name,
        email,
        phone,
        password,
      } = req.body;

      /* =====================================================
         NORMALIZE INPUT
      ====================================================== */

      const normalizedName =
        toStringValue(
          name
        ).trim();

      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            email
          )
        );

      const normalizedPhone =
        normalizePhone(
          toStringValue(
            phone
          )
        );

      const normalizedPassword =
        toStringValue(
          password
        );

      /* =====================================================
         REQUIRED FIELDS
      ====================================================== */

      if (
        !normalizedName ||
        !normalizedEmail ||
        !normalizedPassword
      ) {
        res.status(400).json({
          success: false,

          message:
            "Name, email and password are required.",
        });

        return;
      }

      /* =====================================================
         PASSWORD VALIDATION
      ====================================================== */

      if (
        normalizedPassword.length <
        6
      ) {
        res.status(400).json({
          success: false,

          message:
            "Password must be at least 6 characters.",
        });

        return;
      }

      /* =====================================================
         EMAIL VALIDATION
      ====================================================== */

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (
        !emailRegex.test(
          normalizedEmail
        )
      ) {
        res.status(400).json({
          success: false,

          message:
            "Please provide a valid email address.",
        });

        return;
      }

      /* =====================================================
         CREATE LOOKUP HASHES
      ====================================================== */

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      const phoneLookup =
        normalizedPhone
          ? createLookupHash(
              normalizedPhone
            )
          : undefined;

      /* =====================================================
         ENCRYPT PII
      ====================================================== */

      const emailEncrypted =
        encryptData(
          normalizedEmail
        );

      const phoneEncrypted =
        normalizedPhone
          ? encryptData(
              normalizedPhone
            )
          : undefined;

      /* =====================================================
         CHECK DUPLICATE EMAIL
      ====================================================== */

      /*
       * Temporary $or:
       *
       * email = legacy plaintext
       * emailLookup = secure lookup
       *
       * Plaintext fields remove করার পরে
       * শুধু emailLookup থাকবে।
       */
      const existingByEmail =
        await User.findOne({
          $or: [
            {
              email:
                normalizedEmail,
            },

            {
              emailLookup,
            },
          ],
        });

      if (existingByEmail) {
        res.status(409).json({
          success: false,

          message:
            "An account with this email already exists.",
        });

        return;
      }

      /* =====================================================
         CHECK DUPLICATE PHONE
      ====================================================== */

      if (
        normalizedPhone &&
        phoneLookup
      ) {
        const existingByPhone =
          await User.findOne({
            $or: [
              {
                phone:
                  normalizedPhone,
              },

              {
                phoneLookup,
              },
            ],
          });

        if (existingByPhone) {
          res.status(409).json({
            success: false,

            message:
              "An account with this phone number already exists.",
          });

          return;
        }
      }

      /* =====================================================
         HASH PASSWORD
      ====================================================== */

      const hashedPassword =
        await hashPassword(
          normalizedPassword
        );

      /* =====================================================
         CREATE USER
      ====================================================== */

      const user =
        await User.create({
          name:
            normalizedName,

          /*
           * TEMPORARY LEGACY FIELDS
           *
           * User model থেকে plaintext
           * fields remove করার আগ পর্যন্ত
           * এগুলো রাখতে হবে।
           */
          email:
            normalizedEmail,

          phone:
            normalizedPhone ||
            undefined,

          /*
           * SECURE PII
           */
          emailEncrypted,

          emailLookup,

          phoneEncrypted,

          phoneLookup,

          /*
           * PASSWORD HASH
           */
          password:
            hashedPassword,
        });

      /* =====================================================
         CREATE WALLET
      ====================================================== */

      try {
        const wallet =
          await Wallet.create({
            userId:
              user._id,

            balance:
              0,
          });

        user.walletId =
          wallet._id;

        await user.save();
      } catch (
        walletError
      ) {
        console.error(
          "WALLET CREATE ERROR:",
          walletError
        );

        /*
         * Wallet creation fail হলে
         * user rollback।
         */
        await User.deleteOne({
          _id:
            user._id,
        });

        throw new Error(
          "Wallet creation failed."
        );
      }

      /* =====================================================
         JWT
      ====================================================== */

      const token =
        generateToken(
          user._id.toString(),
          user.role
        );

      /* =====================================================
         COOKIE
      ====================================================== */

      setAuthCookie(
        res,
        token
      );

      /* =====================================================
         RESPONSE
      ====================================================== */

      res.status(201).json({
        success: true,

        message:
          "User registered successfully.",

        user: {
          _id:
            user._id.toString(),

          name:
            user.name,

          /*
           * Temporary response.
           *
           * Next privacy migration-এর পরে
           * encrypted fields decrypt করে
           * response দেওয়া হবে।
           */
          email:
            user.email,

          phone:
            user.phone,

          role:
            user.role,

          kycStatus:
            user.kycStatus,
        },
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "REGISTER ERROR:",
        error
      );

      /* =====================================================
         DUPLICATE KEY
      ====================================================== */

      if (
        typeof error ===
          "object" &&
        error !== null &&
        "code" in error &&
        (
          error as {
            code?: number;
          }
        ).code === 11000
      ) {
        res.status(409).json({
          success: false,

          message:
            "An account with this email or phone already exists.",
        });

        return;
      }

      res.status(500).json({
        success: false,

        message:
          "Registration failed. Please try again.",
      });
    }
  };

/* =========================================================
   LOGIN USER
   POST /api/auth/login
========================================================= */

export const loginUser =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        email,
        password,
      } = req.body;

      /* =====================================================
         NORMALIZE INPUT
      ====================================================== */

      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            email
          )
        );

      const normalizedPassword =
        toStringValue(
          password
        );

      /* =====================================================
         VALIDATE
      ====================================================== */

      if (
        !normalizedEmail ||
        !normalizedPassword
      ) {
        res.status(400).json({
          success: false,

          message:
            "Email and password are required.",
        });

        return;
      }

      /* =====================================================
         CREATE SECURE EMAIL LOOKUP
      ====================================================== */

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      /* =====================================================
         FIND USER USING HMAC
      ====================================================== */

      const user =
        await User.findOne({
          emailLookup,
        }).select(
          "+password"
        );

      /*
       * একই response missing user এবং
       * wrong password-এর জন্য।
       *
       * এতে account enumeration harder হয়।
       */
      if (!user) {
        res.status(401).json({
          success: false,

          message:
            "Invalid email or password.",
        });

        return;
      }

      /* =====================================================
         GET STORED PASSWORD HASH
      ====================================================== */

      const storedPassword =
        user.get(
          "password"
        ) as
          | string
          | undefined;

      if (!storedPassword) {
        res.status(401).json({
          success: false,

          message:
            "Invalid email or password.",
        });

        return;
      }

      /* =====================================================
         VERIFY PASSWORD
      ====================================================== */

      const passwordMatched =
        await verifyPassword(
          storedPassword,
          normalizedPassword
        );

      if (!passwordMatched) {
        res.status(401).json({
          success: false,

          message:
            "Invalid email or password.",
        });

        return;
      }

      /* =====================================================
         GENERATE JWT
      ====================================================== */

      const token =
        generateToken(
          user._id.toString(),
          user.role
        );

      /* =====================================================
         SET COOKIE
      ====================================================== */

      setAuthCookie(
        res,
        token
      );

      /* =====================================================
         RESPONSE
      ====================================================== */

      res.status(200).json({
        success: true,

        message:
          "Login successful.",

        user: {
          _id:
            user._id.toString(),

          name:
            user.name,

          email:
            user.email,

          phone:
            user.phone,

          role:
            user.role,

          kycStatus:
            user.kycStatus,
        },
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Login failed. Please try again.",
      });
    }
  };

/* =========================================================
   FORGOT PASSWORD
   POST /api/auth/forgot-password
========================================================= */

export const forgotPassword =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        email,
      } = req.body;

      /* =====================================================
         NORMALIZE EMAIL
      ====================================================== */

      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            email
          )
        );

      /* =====================================================
         VALIDATE
      ====================================================== */

      if (!normalizedEmail) {
        res.status(400).json({
          success: false,

          message:
            "Email address is required.",
        });

        return;
      }

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (
        !emailRegex.test(
          normalizedEmail
        )
      ) {
        res.status(400).json({
          success: false,

          message:
            "Please provide a valid email address.",
        });

        return;
      }

      /* =====================================================
         CREATE EMAIL LOOKUP
      ====================================================== */

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      /* =====================================================
         FIND USER USING HMAC LOOKUP
      ====================================================== */

      const user =
        await User.findOne({
          emailLookup,
        }).select(
          "+resetPasswordTokenHash +resetPasswordExpires"
        );

      /*
       * Account exists কিনা expose করব না।
       */
      if (!user) {
        res.status(200).json({
          success: true,

          message:
            "If an account exists for this email, a password reset link has been sent.",
        });

        return;
      }

      /* =====================================================
         GENERATE RESET TOKEN
      ====================================================== */

      const rawToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      /*
       * Raw token DB-তে save হবে না।
       *
       * DB শুধু token hash রাখবে।
       */
      const tokenHash =
        crypto
          .createHash(
            "sha256"
          )
          .update(
            rawToken
          )
          .digest("hex");

      /* =====================================================
         TOKEN EXPIRY
         15 MINUTES
      ====================================================== */

      const expiresAt =
        new Date(
          Date.now() +
            15 *
              60 *
              1000
        );

      user.resetPasswordTokenHash =
        tokenHash;

      user.resetPasswordExpires =
        expiresAt;

      await user.save();

      /* =====================================================
         RESET URL
      ====================================================== */

      const frontendUrl =
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const resetUrl =
        `${frontendUrl}/reset-password?token=${encodeURIComponent(
          rawToken
        )}&email=${encodeURIComponent(
          normalizedEmail
        )}`;

      /* =====================================================
         SEND RESET EMAIL
      ====================================================== */

      try {
        await sendPasswordResetEmail({
          email:
            normalizedEmail,

          resetUrl,
        });
      } catch (
        emailError
      ) {
        /*
         * Email send fail করলে
         * reset token clear।
         */
        user.resetPasswordTokenHash =
          undefined;

        user.resetPasswordExpires =
          undefined;

        await user.save();

        console.error(
          "PASSWORD RESET EMAIL ERROR:",
          emailError
        );

        res.status(500).json({
          success: false,

          message:
            "Unable to send the password reset email. Please try again.",
        });

        return;
      }

      /* =====================================================
         RESPONSE
      ====================================================== */

      res.status(200).json({
        success: true,

        message:
          "If an account exists for this email, a password reset link has been sent.",
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "FORGOT PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to process the password reset request.",
      });
    }
  };

/* =========================================================
   RESET PASSWORD
   POST /api/auth/reset-password
========================================================= */

export const resetPassword =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        token,
        email,
        password,
      } = req.body;

      /* =====================================================
         NORMALIZE
      ====================================================== */

      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            email
          )
        );

      const normalizedToken =
        toStringValue(
          token
        ).trim();

      const normalizedPassword =
        toStringValue(
          password
        );

      /* =====================================================
         VALIDATE
      ====================================================== */

      if (
        !normalizedEmail ||
        !normalizedToken ||
        !normalizedPassword
      ) {
        res.status(400).json({
          success: false,

          message:
            "Email, reset token and new password are required.",
        });

        return;
      }

      if (
        normalizedPassword.length <
        6
      ) {
        res.status(400).json({
          success: false,

          message:
            "Password must be at least 6 characters.",
        });

        return;
      }

      /* =====================================================
         EMAIL VALIDATION
      ====================================================== */

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (
        !emailRegex.test(
          normalizedEmail
        )
      ) {
        res.status(400).json({
          success: false,

          message:
            "Please provide a valid email address.",
        });

        return;
      }

      /* =====================================================
         CREATE SECURE EMAIL LOOKUP
      ====================================================== */

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      /* =====================================================
         HASH RESET TOKEN
      ====================================================== */

      const tokenHash =
        crypto
          .createHash(
            "sha256"
          )
          .update(
            normalizedToken
          )
          .digest("hex");

      /* =====================================================
         FIND USER

         IMPORTANT:
         এখানে plaintext email আর
         ব্যবহার করা হচ্ছে না।
      ====================================================== */

      const user =
        await User.findOne({
          emailLookup,

          resetPasswordTokenHash:
            tokenHash,

          resetPasswordExpires: {
            $gt:
              new Date(),
          },
        }).select(
          "+password +resetPasswordTokenHash +resetPasswordExpires"
        );

      if (!user) {
        res.status(400).json({
          success: false,

          message:
            "Invalid or expired password reset link.",
        });

        return;
      }

      /* =====================================================
         HASH NEW PASSWORD
      ====================================================== */

      const hashedPassword =
        await hashPassword(
          normalizedPassword
        );

      /* =====================================================
         UPDATE PASSWORD
      ====================================================== */

      user.password =
        hashedPassword;

      /*
       * Reset token one-time use।
       */
      user.resetPasswordTokenHash =
        undefined;

      user.resetPasswordExpires =
        undefined;

      await user.save();

      /* =====================================================
         CREATE NEW SESSION
      ====================================================== */

      const newToken =
        generateToken(
          user._id.toString(),
          user.role
        );

      setAuthCookie(
        res,
        newToken
      );

      /* =====================================================
         RESPONSE
      ====================================================== */

      res.status(200).json({
        success: true,

        message:
          "Password reset successfully.",

        user: {
          _id:
            user._id.toString(),

          name:
            user.name,

          email:
            user.email,

          phone:
            user.phone,

          role:
            user.role,

          kycStatus:
            user.kycStatus,
        },
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "RESET PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to reset password.",
      });
    }
  };

/* =========================================================
   LOGOUT
   POST /api/auth/logout
========================================================= */

export const logoutUser =
  async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    try {
      clearAuthCookie(
        res
      );

      res.status(200).json({
        success: true,

        message:
          "Logged out successfully.",
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "LOGOUT ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Logout failed.",
      });
    }
  };