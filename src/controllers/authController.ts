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
  decryptData,
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

interface EncryptedContactValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

const decryptContactValue = (
  value:
    | EncryptedContactValue
    | undefined
): string => {
  if (!value) {
    return "";
  }

  try {
    return decryptData(value);
  } catch (error) {
    console.error(
      "CONTACT DECRYPT ERROR:",
      error
    );

    return "";
  }
};

const getUserContact = (
  user: {
    emailEncrypted?:
      EncryptedContactValue;

    phoneEncrypted?:
      EncryptedContactValue;
  }
) => {
  return {
    email:
      decryptContactValue(
        user.emailEncrypted
      ),

    phone:
      decryptContactValue(
        user.phoneEncrypted
      ),
  };
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
   JWT
========================================================= */

const generateToken = (
  id: string,
  role: "user" | "admin",
  authVersion: number = 0
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
      authVersion,
    },
    secret,
    {
      expiresIn: "30d",
    }
  );
};

/* =========================================================
   COOKIE OPTIONS
========================================================= */

const getAuthCookieOptions =
  (): CookieOptions => {
    const isProduction =
      isProductionEnvironment();

    return {
      httpOnly: true,

      secure:
        isProduction,

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
   SET COOKIE
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
   CLEAR COOKIE
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
   REGISTER
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
         NORMALIZE
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
         REQUIRED
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
         PASSWORD
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
         LOOKUP HASH
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
         DUPLICATE CHECK
      ====================================================== */

      const existingByEmail =
        await User.findOne({
          emailLookup,
        });

      if (existingByEmail) {
        res.status(409).json({
          success: false,
          message:
            "An account with this email already exists.",
        });

        return;
      }

      if (
        normalizedPhone &&
        phoneLookup
      ) {
        const existingByPhone =
          await User.findOne({
            phoneLookup,
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
         PASSWORD HASH
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

          /* Secure fields */

          emailEncrypted,
          emailLookup,

          phoneEncrypted,
          phoneLookup,

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

        await User.deleteOne({
          _id:
            user._id,
        });

        throw new Error(
          "Wallet creation failed."
        );
      }

      /* =====================================================
         AUTH
      ====================================================== */

      const token =
        generateToken(
          user._id.toString(),
          user.role,
          user.authVersion ?? 0
        );

      setAuthCookie(
        res,
        token
      );

      /* =====================================================
         RESPONSE

         Registration input already exists in memory,
         so no DB plaintext field is read here.
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

          email:
            normalizedEmail,

          phone:
            normalizedPhone,

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
   LOGIN
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
         HMAC LOOKUP
      ====================================================== */

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      const user =
        await User.findOne({
          emailLookup,
        }).select(
          "+password"
        );

      if (!user) {
        res.status(401).json({
          success: false,
          message:
            "Invalid email or password.",
        });

        return;
      }

      if (
        user.accountStatus ===
        "deleted"
      ) {
        res.status(401).json({
          success: false,
          message:
            "Invalid email or password.",
        });

        return;
      }

      /* =====================================================
         PASSWORD
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
         CONTACT DATA
      ====================================================== */

      const {
        email: decryptedEmail,
        phone: decryptedPhone,
      } =
        getUserContact(
          user
        );

      /* =====================================================
         TOKEN
      ====================================================== */

      const token =
        generateToken(
          user._id.toString(),
          user.role,
          user.authVersion ?? 0
        );

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
            decryptedEmail,

          phone:
            decryptedPhone,

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

      const normalizedEmail =
        normalizeEmail(
          toStringValue(
            email
          )
        );

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
         FIND USING HMAC
      ====================================================== */

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      const user =
        await User.findOne({
          emailLookup,
        }).select(
          "+resetPasswordTokenHash +resetPasswordExpires"
        );

      /*
       * Account enumeration protection
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
         RESET TOKEN
      ====================================================== */

      const rawToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      const tokenHash =
        crypto
          .createHash(
            "sha256"
          )
          .update(
            rawToken
          )
          .digest("hex");

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
         EMAIL
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
         EMAIL LOOKUP
      ====================================================== */

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      /* =====================================================
         TOKEN HASH
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
         PASSWORD UPDATE
      ====================================================== */

      const hashedPassword =
        await hashPassword(
          normalizedPassword
        );

      user.password =
        hashedPassword;

      user.resetPasswordTokenHash =
        undefined;

      user.resetPasswordExpires =
        undefined;

      await user.save();

      /* =====================================================
         DECRYPT CONTACT
      ====================================================== */

      const {
        email: decryptedEmail,
        phone: decryptedPhone,
      } =
        getUserContact(
          user
        );

      /* =====================================================
         NEW SESSION
      ====================================================== */

      const newToken =
        generateToken(
          user._id.toString(),
          user.role,
          user.authVersion ?? 0
        );

      setAuthCookie(
        res,
        newToken
      );

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
            decryptedEmail,

          phone:
            decryptedPhone,

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