import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import {
  hashPassword,
  verifyPassword,
} from "../utils/password.js";

/* =========================================================
   JWT
========================================================= */

const generateToken = (
  id: string,
  role: string
): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not defined in .env"
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
   REGISTER
   POST /api/auth/register
========================================================= */

export const registerUser = async (
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

    /* -----------------------------------------------------
       DEBUG
    ----------------------------------------------------- */

    console.log("REGISTER REQUEST:", {
      name,
      email,
      phone,
      passwordProvided: Boolean(password),
    });

    /* -----------------------------------------------------
       NORMALIZE INPUT
    ----------------------------------------------------- */

    const normalizedName =
      typeof name === "string"
        ? name.trim()
        : "";

    const normalizedEmail =
      typeof email === "string"
        ? email.trim().toLowerCase()
        : "";

    const normalizedPhone =
      typeof phone === "string"
        ? phone.trim()
        : "";

    const normalizedPassword =
      typeof password === "string"
        ? password
        : "";

    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

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

    if (normalizedPassword.length < 6) {
      res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters.",
      });

      return;
    }

    /* -----------------------------------------------------
       EMAIL FORMAT
    ----------------------------------------------------- */

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      res.status(400).json({
        success: false,
        message:
          "Please provide a valid email address.",
      });

      return;
    }

    /* -----------------------------------------------------
       CHECK EXISTING USER
    ----------------------------------------------------- */

    const duplicateConditions = [
      {
        email: normalizedEmail,
      },
    ];

    if (normalizedPhone) {
      duplicateConditions.push({
        phone: normalizedPhone,
      } as {
        email: string;
        phone?: string;
      });
    }

    const userExists = await User.findOne({
      $or: duplicateConditions,
    });

    if (userExists) {
      let message =
        "User already exists.";

      if (
        userExists.email ===
        normalizedEmail
      ) {
        message =
          "An account with this email already exists.";
      } else if (
        normalizedPhone &&
        userExists.phone ===
          normalizedPhone
      ) {
        message =
          "An account with this phone number already exists.";
      }

      res.status(400).json({
        success: false,
        message,
      });

      return;
    }

    /* -----------------------------------------------------
       HASH PASSWORD
    ----------------------------------------------------- */

    const hashedPassword =
      await hashPassword(
        normalizedPassword
      );

    /* -----------------------------------------------------
       CREATE USER
    ----------------------------------------------------- */

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone || undefined,
      password: hashedPassword,
    });

    /* -----------------------------------------------------
       CREATE WALLET
    ----------------------------------------------------- */

    const wallet = await Wallet.create({
      userId: user._id,
      balance: 0,
    });

    user.walletId = wallet._id;

    await user.save();

    /* -----------------------------------------------------
       TOKEN
    ----------------------------------------------------- */

    const token = generateToken(
      user._id.toString(),
      user.role
    );

    /* -----------------------------------------------------
       SUCCESS
    ----------------------------------------------------- */

    res.status(201).json({
      success: true,
      message:
        "User registered successfully.",

      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        kycStatus: user.kycStatus,
      },

      token,
    });
  } catch (error: unknown) {
    console.error(
      "REGISTER ERROR:",
      error
    );

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

export const loginUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      email,
      password,
    } = req.body;

    /* -----------------------------------------------------
       NORMALIZE
    ----------------------------------------------------- */

    const normalizedEmail =
      typeof email === "string"
        ? email.trim().toLowerCase()
        : "";

    const normalizedPassword =
      typeof password === "string"
        ? password
        : "";

    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       FIND USER + PASSWORD
    ----------------------------------------------------- */

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    if (!user) {
      res.status(401).json({
        success: false,
        message:
          "Invalid email or password.",
      });

      return;
    }

    /* -----------------------------------------------------
       PASSWORD HASH
    ----------------------------------------------------- */

    const storedPassword =
      user.get("password") as
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

    /* -----------------------------------------------------
       VERIFY ARGON2
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       JWT
    ----------------------------------------------------- */

    const token = generateToken(
      user._id.toString(),
      user.role
    );

    /* -----------------------------------------------------
       SUCCESS
    ----------------------------------------------------- */

    res.status(200).json({
      success: true,
      message: "Login successful.",

      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        kycStatus: user.kycStatus,
      },

      token,
    });
  } catch (error: unknown) {
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