import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  User,
} from "../models/User.js";

import {
  createMerchant,
} from "../services/merchantService.js";

/* =========================================================
   TYPES
========================================================= */

type MerchantNextStep =
  | "create_merchant"
  | "verification"
  | "dashboard"
  | "blocked";

/* =========================================================
   HELPERS
========================================================= */

function authenticatedUserId(
  req: AuthRequest,
): string | undefined {
  const userId =
    req.user?._id;

  return userId
    ? String(userId)
    : undefined;
}

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Unable to complete merchant onboarding.";
}

function merchantNextStep(
  merchant:
    | {
        status: string;
        verificationStatus: string;
        liveEnabled: boolean;
      }
    | null,
): MerchantNextStep {
  if (!merchant) {
    return "create_merchant";
  }

  if (
    merchant.status ===
      "suspended" ||
    merchant.status ===
      "disabled"
  ) {
    return "blocked";
  }

  if (
    merchant.verificationStatus !==
      "verified" ||
    merchant.liveEnabled !==
      true
  ) {
    return "verification";
  }

  return "dashboard";
}

/* =========================================================
   GET MERCHANT ONBOARDING STATUS

   GET /api/merchants/onboarding-status

   This route intentionally requires authentication only.
   A normal user must be able to discover that merchant
   onboarding is the next required step.
========================================================= */

export async function getMerchantOnboardingStatusController(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const userId =
      authenticatedUserId(
        req,
      );

    if (!userId) {
      res.status(401).json({
        success: false,
        message:
          "Authentication is required.",
      });

      return;
    }

    const [
      user,
      merchant,
    ] =
      await Promise.all([
        User.findById(
          userId,
        )
          .select(
            "name role accountStatus emailVerified kycStatus avatarUrl",
          )
          .lean(),

        Merchant.findOne({
          ownerId:
            userId,
        }).lean(),
      ]);

    if (
      !user ||
      user.accountStatus !==
        "active"
    ) {
      res.status(401).json({
        success: false,
        message:
          "The authenticated account is unavailable.",
      });

      return;
    }

    const nextStep =
      merchantNextStep(
        merchant,
      );

    res.status(200).json({
      success: true,

      user: {
        _id:
          user._id.toString(),
        name:
          user.name,
        role:
          user.role,
        emailVerified:
          user.emailVerified,
        kycStatus:
          user.kycStatus,
        avatarUrl:
          user.avatarUrl ?? "",
      },

      hasMerchant:
        Boolean(merchant),

      nextStep,

      merchant:
        merchant
          ? {
              _id:
                merchant._id.toString(),
              businessName:
                merchant.businessName,
              businessDisplayName:
                merchant.businessDisplayName ??
                null,
              businessType:
                merchant.businessType,
              slug:
                merchant.slug,
              businessEmail:
                merchant.businessEmail,
              businessPhone:
                merchant.businessPhone ??
                null,
              websiteUrl:
                merchant.websiteUrl ??
                null,
              country:
                merchant.country,
              countryCode:
                merchant.countryCode,
              defaultCurrency:
                merchant.defaultCurrency,
              status:
                merchant.status,
              verificationStatus:
                merchant.verificationStatus,
              testEnabled:
                merchant.testEnabled,
              liveEnabled:
                merchant.liveEnabled,
            }
          : null,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "GET MERCHANT ONBOARDING STATUS ERROR:",
      error,
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to load merchant onboarding status.",
    });
  }
}

/* =========================================================
   COMPLETE MERCHANT ONBOARDING

   POST /api/merchants

   Security rules:
   - the owner comes only from the authenticated session
   - staff/admin roles cannot self-promote to merchant
   - merchant role is granted only after creation succeeds
   - test access is enabled immediately
   - live access always remains disabled until KYB approval
========================================================= */

export async function completeMerchantOnboardingController(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  let createdMerchantId:
    | string
    | undefined;

  try {
    const userId =
      authenticatedUserId(
        req,
      );

    if (!userId) {
      res.status(401).json({
        success: false,
        message:
          "Authentication is required.",
      });

      return;
    }

    const user =
      await User.findById(
        userId,
      ).select(
        "name role accountStatus emailVerified kycStatus avatarUrl",
      );

    if (
      !user ||
      user.accountStatus !==
        "active"
    ) {
      res.status(401).json({
        success: false,
        message:
          "The authenticated account is unavailable.",
      });

      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        success: false,
        message:
          "Verify your email before creating a merchant account.",
      });

      return;
    }

    if (
      user.role !== "user" &&
      user.role !== "merchant"
    ) {
      res.status(403).json({
        success: false,
        message:
          "This account role cannot create a merchant business.",
      });

      return;
    }

    const existingMerchant =
      await Merchant.findOne({
        ownerId:
          user._id,
      });

    if (existingMerchant) {
      if (
        existingMerchant.status ===
          "suspended" ||
        existingMerchant.status ===
          "disabled"
      ) {
        res.status(403).json({
          success: false,
          message:
            "Merchant access is suspended or disabled.",
        });

        return;
      }

      if (
        existingMerchant.status ===
        "pending"
      ) {
        existingMerchant.status =
          "active";
        existingMerchant.testEnabled =
          true;
        existingMerchant.activatedAt =
          existingMerchant.activatedAt ??
          new Date();

        await existingMerchant.save();
      }

      if (
        user.role !==
        "merchant"
      ) {
        user.role =
          "merchant";

        await user.save();
      }

      res.status(200).json({
        success: true,
        duplicate: true,
        message:
          "Your merchant account already exists.",

        user: {
          _id:
            user._id.toString(),
          name:
            user.name,
          role:
            "merchant",
          kycStatus:
            user.kycStatus,
          avatarUrl:
            user.avatarUrl ?? "",
        },

        merchant:
          existingMerchant,
      });

      return;
    }

    await createMerchant({
      ownerId:
        user._id.toString(),
      businessName:
        req.body?.businessName,
      businessDisplayName:
        req.body?.businessDisplayName,
      businessType:
        req.body?.businessType,
      slug:
        req.body?.slug,
      businessEmail:
        req.body?.businessEmail,
      businessPhone:
        req.body?.businessPhone,
      websiteUrl:
        req.body?.websiteUrl,
      description:
        req.body?.description,
      country:
        req.body?.country,
      countryCode:
        req.body?.countryCode,
      defaultCurrency:
        req.body?.defaultCurrency,
    });

    const createdMerchant =
      await Merchant.findOne({
        ownerId:
          user._id,
      }).select(
        "_id",
      );

    if (!createdMerchant) {
      throw new Error(
        "Merchant account could not be loaded after creation.",
      );
    }

    createdMerchantId =
      createdMerchant._id.toString();

    const merchant =
      await Merchant.findByIdAndUpdate(
        createdMerchant._id,
        {
          $set: {
            status:
              "active",
            testEnabled:
              true,
            liveEnabled:
              false,
            activatedAt:
              new Date(),
          },
        },
        {
          new: true,
          runValidators:
            true,
        },
      );

    if (!merchant) {
      throw new Error(
        "Merchant account could not be loaded after creation.",
      );
    }

    user.role =
      "merchant";

    await user.save();

    res.status(201).json({
      success: true,
      duplicate: false,
      message:
        "Merchant account created. Test mode is ready; complete business verification to unlock live payments.",

      user: {
        _id:
          user._id.toString(),
        name:
          user.name,
        role:
          user.role,
        kycStatus:
          user.kycStatus,
        avatarUrl:
          user.avatarUrl ?? "",
      },

      merchant,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "COMPLETE MERCHANT ONBOARDING ERROR:",
      error,
    );

    if (createdMerchantId) {
      await Merchant.deleteOne({
        _id:
          createdMerchantId,
      }).catch(
        (
          cleanupError: unknown,
        ) => {
          console.error(
            "MERCHANT ONBOARDING CLEANUP ERROR:",
            cleanupError,
          );
        },
      );
    }

    const message =
      errorMessage(
        error,
      );

    const status =
      message.includes(
        "already",
      )
        ? 409
        : message.includes(
              "required",
            ) ||
            message.includes(
              "Invalid",
            ) ||
            message.includes(
              "must",
            )
          ? 400
          : 500;

    res.status(status).json({
      success: false,
      message,
    });
  }
}
