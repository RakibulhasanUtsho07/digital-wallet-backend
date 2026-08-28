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
   ENVIRONMENT
========================================================= */

const isProductionEnvironment = (): boolean => {
  return (
    process.env.NODE_ENV === "production" ||
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
       * JavaScript থেকে token access করা যাবে না.
       */
      httpOnly: true,

      /*
       * SameSite=None ব্যবহার করতে Secure=true লাগবে।
       */
      secure: isProduction,

      /*
       * Local:
       * frontend localhost:3000
       * backend localhost:5000
       *
       * Production:
       * frontend.vercel.app
       * backend.vercel.app
       *
       * Production-এ cross-site cookie-এর জন্য "none".
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
   NORMALIZE EMAIL
========================================================= */

// const normalizeEmail = (
//   value: unknown
// ): string => {
//   return typeof value === "string"
//     ? value
//         .trim()
//         .toLowerCase()
//     : "";
// };

/* =========================================================
   REGISTER USER
   POST /api/auth/register
========================================================= */
const toStringValue = (
  value: unknown
): string => {
  return typeof value ===
    "string"
    ? value
    : "";
};
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
        typeof name ===
          "string"
          ? name.trim()
          : "";

      // const normalizedEmail =
      //   normalizeEmail(email);

      // const normalizedPhone =
      //   typeof phone ===
      //   "string"
      //     ? phone.trim()
      //     : "";

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
        typeof password ===
          "string"
          ? password
          : "";

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
         CHECK EMAIL
      ====================================================== */

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
         CHECK PHONE
      ====================================================== */

      if (normalizedPhone) {
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
     * TEMPORARY
     *
     * Migration শেষ হলে
     * এগুলো remove করব।
     */
    email:
      normalizedEmail,

    phone:
      normalizedPhone ||
      undefined,

    /*
     * SECURE FIELDS
     */
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

            balance: 0,
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
         * Rollback user if wallet creation fails.
         */
        await User.deleteOne({
          _id: user._id,
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

      /*
       * Mongo duplicate key
       */
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
         NORMALIZE
      ====================================================== */

      const normalizedEmail =
        normalizeEmail(email);

      const normalizedPassword =
        typeof password ===
          "string"
          ? password
          : "";

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
         FIND USER
      ====================================================== */

      const user =
        await User.findOne({
          email:
            normalizedEmail,
        }).select(
          "+password"
        );

      /*
       * Same message for missing user
       * and incorrect password.
       *
       * This avoids exposing which emails exist.
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
         GET HASH
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
         GENERATE TOKEN
      ====================================================== */

      const token =
        generateToken(
          user._id.toString(),
          user.role
        );

      /* =====================================================
         SET HTTPONLY COOKIE
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
// export const loginUser = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   try {
//     const {
//       email,
//       password,
//     } = req.body;

//     const normalizedEmail =
//       normalizeEmail(email);

//     const normalizedPassword =
//       typeof password === "string"
//         ? password
//         : "";

//     const isDevelopment =
//       process.env.NODE_ENV !==
//       "production";

//     console.log(
//       "\n========== LOGIN =========="
//     );

//     console.log({
//       origin:
//         req.headers.origin,
//       email:
//         normalizedEmail,
//       passwordLength:
//         normalizedPassword.length,
//       database:
//         User.db.name,
//       host:
//         User.db.host,
//     });

//     /* =========================
//        VALIDATE
//     ========================= */

//     if (
//       !normalizedEmail ||
//       !normalizedPassword
//     ) {
//       res.status(400).json({
//         success: false,
//         message:
//           "Email and password are required.",
//       });

//       return;
//     }

//     /* =========================
//        FIND USER
//     ========================= */

//     const user =
//       await User.findOne({
//         email:
//           normalizedEmail,
//       }).select(
//         "+password"
//       );

//     console.log(
//       "USER FOUND:",
//       !!user
//     );

//     if (!user) {
//       console.log(
//         "❌ LOGIN FAILED: USER_NOT_FOUND"
//       );

//       res.status(401).json({
//         success: false,

//         message:
//           "Invalid email or password.",

//         ...(isDevelopment
//           ? {
//               debugReason:
//                 "USER_NOT_FOUND",
//             }
//           : {}),
//       });

//       return;
//     }

//     /* =========================
//        PASSWORD
//     ========================= */

//     const storedPassword =
//       user.get(
//         "password"
//       ) as
//         | string
//         | undefined;

//     console.log(
//       "PASSWORD EXISTS:",
//       !!storedPassword
//     );

//     if (!storedPassword) {
//       console.log(
//         "❌ LOGIN FAILED: PASSWORD_MISSING"
//       );

//       res.status(401).json({
//         success: false,

//         message:
//           "Invalid email or password.",

//         ...(isDevelopment
//           ? {
//               debugReason:
//                 "PASSWORD_MISSING",
//             }
//           : {}),
//       });

//       return;
//     }

//     /* =========================
//        VERIFY ARGON2
//     ========================= */

//     const passwordMatched =
//       await verifyPassword(
//         storedPassword,
//         normalizedPassword
//       );

//     console.log(
//       "PASSWORD MATCHED:",
//       passwordMatched
//     );

//     if (!passwordMatched) {
//       console.log(
//         "❌ LOGIN FAILED: PASSWORD_MISMATCH"
//       );

//       res.status(401).json({
//         success: false,

//         message:
//           "Invalid email or password.",

//         ...(isDevelopment
//           ? {
//               debugReason:
//                 "PASSWORD_MISMATCH",
//             }
//           : {}),
//       });

//       return;
//     }

//     /* =========================
//        JWT
//     ========================= */

//     const token =
//       generateToken(
//         user._id.toString(),
//         user.role
//       );

//     setAuthCookie(
//       res,
//       token
//     );

//     console.log(
//       "✅ LOGIN SUCCESS:",
//       user.email
//     );

//     console.log(
//       "===========================\n"
//     );

//     res.status(200).json({
//       success: true,

//       message:
//         "Login successful.",

//       user: {
//         _id:
//           user._id.toString(),

//         name:
//           user.name,

//         email:
//           user.email,

//         phone:
//           user.phone,

//         role:
//           user.role,

//         kycStatus:
//           user.kycStatus,
//       },
//     });
//   } catch (error: unknown) {
//     console.error(
//       "LOGIN ERROR:",
//       error
//     );

//     res.status(500).json({
//       success: false,
//       message:
//         "Login failed. Please try again.",
//     });
//   }
// };

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
        normalizeEmail(email);

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
         FIND USER
      ====================================================== */

      const user =
        await User.findOne({
          email:
            normalizedEmail,
        }).select(
          "+resetPasswordTokenHash +resetPasswordExpires"
        );

      /*
       * Don't reveal whether account exists.
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
         CREATE RESET TOKEN
      ====================================================== */

      const rawToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      /*
       * Raw token is only sent through email.
       * Database stores SHA-256 hash.
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

      /*
       * Reset link expires after 15 minutes.
       */
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
         FRONTEND RESET URL
      ====================================================== */

      const frontendUrl =
        process.env
          .FRONTEND_URL ||
        "http://localhost:3000";

      const resetUrl =
        `${frontendUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(
          normalizedEmail
        )}`;

      /* =====================================================
         SEND EMAIL
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
         * Clear token if email couldn't be sent.
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
        normalizeEmail(email);

      const normalizedToken =
        typeof token ===
          "string"
          ? token.trim()
          : "";

      const normalizedPassword =
        typeof password ===
          "string"
          ? password
          : "";

      /* =====================================================
         VALIDATION
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
         FIND VALID RESET
      ====================================================== */

      const user =
        await User.findOne({
          email:
            normalizedEmail,

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
         SAVE PASSWORD
      ====================================================== */

      user.password =
        hashedPassword;

      /*
       * Reset token can only be used once.
       */
      user.resetPasswordTokenHash =
        undefined;

      user.resetPasswordExpires =
        undefined;

      await user.save();

      /* =====================================================
         NEW LOGIN SESSION
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