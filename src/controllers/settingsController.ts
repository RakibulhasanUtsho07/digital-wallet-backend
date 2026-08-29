import crypto from "crypto";

import {
  Response,
  type CookieOptions,
} from "express";

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
  UserSettings,
} from "../models/UserSettings.js";

import {
  createLookupHash,
  decryptData,
  encryptData,
  normalizeEmail,
  normalizePhone,
} from "../utils/crypto.js";

import {
  hashPassword,
  verifyPassword,
} from "../utils/password.js";

/* =========================================================
   TYPES
========================================================= */

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

type ThemeMode =
  | "light"
  | "dark"
  | "system";

type Density =
  | "comfortable"
  | "compact";

type Currency =
  | "BDT"
  | "USD"
  | "EUR";

/* =========================================================
   HELPERS
========================================================= */

const toStringValue = (
  value: unknown
): string => {
  return typeof value ===
    "string"
    ? value
    : "";
};

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
  } catch (
    error
  ) {
    console.error(
      "SETTINGS DECRYPT ERROR:",
      error
    );

    return "";
  }
};

const isBoolean = (
  value: unknown
): value is boolean => {
  return typeof value ===
    "boolean";
};

const isTheme = (
  value: unknown
): value is ThemeMode => {
  return (
    value === "light" ||
    value === "dark" ||
    value === "system"
  );
};

const isDensity = (
  value: unknown
): value is Density => {
  return (
    value ===
      "comfortable" ||
    value ===
      "compact"
  );
};

const isCurrency = (
  value: unknown
): value is Currency => {
  return (
    value === "BDT" ||
    value === "USD" ||
    value === "EUR"
  );
};

const isProductionEnvironment =
  (): boolean => {
    return (
      process.env.NODE_ENV ===
        "production" ||
      process.env.VERCEL ===
        "1"
    );
  };

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
    };
  };

const clearAuthCookie = (
  res: Response
): void => {
  res.clearCookie(
    "access_token",
    getAuthCookieOptions()
  );
};

/* =========================================================
   DEFAULT SETTINGS
========================================================= */

const DEFAULT_CONFIRM_THRESHOLD =
  10000;

const createDefaultSettings =
  async (
    userId: string
  ) => {
    return UserSettings.create({
      userId,

      appearance: {
        theme: "light",
        density:
          "comfortable",
        reduceMotion:
          false,
      },

      notifications: {
        email: true,
        push: true,
        sms: true,
        marketing: false,
      },

      privacy: {
        analytics: false,
        discoverability:
          true,
        personalization:
          true,
        showTransactionNames:
          true,
      },

      wallet: {
        defaultCurrency:
          "BDT",
        hideAmounts:
          false,
        requireConfirmation:
          true,

        confirmThresholdEncrypted:
          encryptData(
            String(
              DEFAULT_CONFIRM_THRESHOLD
            )
          ),
      },
    });
  };

const getOrCreateSettings =
  async (
    userId: string
  ) => {
    const existing =
      await UserSettings.findOne({
        userId,
      });

    if (existing) {
      return existing;
    }

    try {
      return await createDefaultSettings(
        userId
      );
    } catch (
      error: unknown
    ) {
      /*
       * Parallel first-load requests can both
       * attempt to create the unique userId row.
       * In that case read the winner.
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
        const created =
          await UserSettings.findOne({
            userId,
          });

        if (created) {
          return created;
        }
      }

      throw error;
    }
  };

/* =========================================================
   DTO
========================================================= */

const toSettingsDTO = (
  settings: Awaited<
    ReturnType<
      typeof getOrCreateSettings
    >
  >
) => {
  let confirmThreshold =
    DEFAULT_CONFIRM_THRESHOLD;

  if (
    settings.wallet
      .confirmThresholdEncrypted
  ) {
    const decrypted =
      safeDecrypt(
        settings.wallet
          .confirmThresholdEncrypted
      );

    const parsed =
      Number(
        decrypted
      );

    if (
      Number.isFinite(
        parsed
      ) &&
      parsed >= 0
    ) {
      confirmThreshold =
        parsed;
    }
  }

  return {
    appearance: {
      theme:
        settings.appearance
          .theme,

      density:
        settings.appearance
          .density,

      reduceMotion:
        settings.appearance
          .reduceMotion,
    },

    notifications: {
      email:
        settings.notifications
          .email,

      push:
        settings.notifications
          .push,

      sms:
        settings.notifications
          .sms,

      marketing:
        settings.notifications
          .marketing,
    },

    privacy: {
      analytics:
        settings.privacy
          .analytics,

      discoverability:
        settings.privacy
          .discoverability,

      personalization:
        settings.privacy
          .personalization,

      showTransactionNames:
        settings.privacy
          .showTransactionNames,
    },

    wallet: {
      defaultCurrency:
        settings.wallet
          .defaultCurrency,

      hideAmounts:
        settings.wallet
          .hideAmounts,

      requireConfirmation:
        settings.wallet
          .requireConfirmation,

      confirmThreshold,
    },
  };
};

/* =========================================================
   GET SETTINGS
   GET /api/settings
========================================================= */

export const getUserSettings =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized.",
        });

        return;
      }

      const [
        user,
        wallet,
        settings,
      ] =
        await Promise.all([
          User.findById(
            userId
          ).select(
            "-password"
          ),

          Wallet.findOne({
            userId,
          }),

          getOrCreateSettings(
            userId
          ),
        ]);

      if (!user) {
        res.status(
          404
        ).json({
          success: false,
          message:
            "User not found.",
        });

        return;
      }

      const email =
        safeDecrypt(
          user.emailEncrypted
        );

      const phone =
        safeDecrypt(
          user.phoneEncrypted
        );

      res.setHeader(
        "Cache-Control",
        "private, no-store"
      );

      res.status(
        200
      ).json({
        success: true,

        profile: {
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

        preferences:
          toSettingsDTO(
            settings
          ),

        wallet:
          wallet
            ? {
                status:
                  wallet.status,

                /*
                 * Current balance is returned
                 * because the authenticated
                 * wallet profile already exposes it.
                 * Do not persist it in UserSettings.
                 */
                balance:
                  wallet.balance,
              }
            : null,
      });
    } catch (
      error
    ) {
      console.error(
        "GET USER SETTINGS ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to load settings.",
      });
    }
  };

/* =========================================================
   UPDATE PREFERENCES
   PATCH /api/settings/preferences
========================================================= */

export const updateUserPreferences =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized.",
        });

        return;
      }

      const settings =
        await getOrCreateSettings(
          userId
        );

      const {
        appearance,
        notifications,
        privacy,
        wallet,
      } =
        req.body ?? {};

      /* =====================================================
         APPEARANCE
      ====================================================== */

      if (
        appearance &&
        typeof appearance ===
          "object"
      ) {
        if (
          appearance.theme !==
            undefined
        ) {
          if (
            !isTheme(
              appearance.theme
            )
          ) {
            res.status(
              400
            ).json({
              success: false,
              message:
                "Invalid appearance theme.",
            });

            return;
          }

          settings.appearance.theme =
            appearance.theme;
        }

        if (
          appearance.density !==
            undefined
        ) {
          if (
            !isDensity(
              appearance.density
            )
          ) {
            res.status(
              400
            ).json({
              success: false,
              message:
                "Invalid dashboard density.",
            });

            return;
          }

          settings.appearance.density =
            appearance.density;
        }

        if (
          appearance.reduceMotion !==
            undefined
        ) {
          if (
            !isBoolean(
              appearance.reduceMotion
            )
          ) {
            res.status(
              400
            ).json({
              success: false,
              message:
                "Invalid reduceMotion value.",
            });

            return;
          }

          settings.appearance.reduceMotion =
            appearance.reduceMotion;
        }
      }

      /* =====================================================
         NOTIFICATIONS
      ====================================================== */

      if (
        notifications &&
        typeof notifications ===
          "object"
      ) {
        const keys = [
          "email",
          "push",
          "sms",
          "marketing",
        ] as const;

        for (
          const key of
          keys
        ) {
          if (
            notifications[
              key
            ] ===
            undefined
          ) {
            continue;
          }

          if (
            !isBoolean(
              notifications[
                key
              ]
            )
          ) {
            res.status(
              400
            ).json({
              success: false,
              message:
                `Invalid notification setting: ${key}.`,
            });

            return;
          }

          settings.notifications[
            key
          ] =
            notifications[
              key
            ];
        }
      }

      /* =====================================================
         PRIVACY
      ====================================================== */

      if (
        privacy &&
        typeof privacy ===
          "object"
      ) {
        const keys = [
          "analytics",
          "discoverability",
          "personalization",
          "showTransactionNames",
        ] as const;

        for (
          const key of
          keys
        ) {
          if (
            privacy[
              key
            ] ===
            undefined
          ) {
            continue;
          }

          if (
            !isBoolean(
              privacy[
                key
              ]
            )
          ) {
            res.status(
              400
            ).json({
              success: false,
              message:
                `Invalid privacy setting: ${key}.`,
            });

            return;
          }

          settings.privacy[
            key
          ] =
            privacy[
              key
            ];
        }
      }

      /* =====================================================
         WALLET PREFERENCES
      ====================================================== */

      if (
        wallet &&
        typeof wallet ===
          "object"
      ) {
        if (
          wallet.defaultCurrency !==
            undefined
        ) {
          if (
            !isCurrency(
              wallet.defaultCurrency
            )
          ) {
            res.status(
              400
            ).json({
              success: false,
              message:
                "Invalid default currency.",
            });

            return;
          }

          settings.wallet.defaultCurrency =
            wallet.defaultCurrency;
        }

        if (
          wallet.hideAmounts !==
            undefined
        ) {
          if (
            !isBoolean(
              wallet.hideAmounts
            )
          ) {
            res.status(
              400
            ).json({
              success: false,
              message:
                "Invalid hideAmounts value.",
            });

            return;
          }

          settings.wallet.hideAmounts =
            wallet.hideAmounts;
        }

        if (
          wallet.requireConfirmation !==
            undefined
        ) {
          if (
            !isBoolean(
              wallet.requireConfirmation
            )
          ) {
            res.status(
              400
            ).json({
              success: false,
              message:
                "Invalid requireConfirmation value.",
            });

            return;
          }

          settings.wallet.requireConfirmation =
            wallet.requireConfirmation;
        }

        if (
          wallet.confirmThreshold !==
            undefined
        ) {
          const threshold =
            Number(
              wallet.confirmThreshold
            );

          if (
            !Number.isFinite(
              threshold
            ) ||
            threshold <
              1000 ||
            threshold >
              50000 ||
            !Number.isInteger(
              threshold
            )
          ) {
            res.status(
              400
            ).json({
              success: false,
              message:
                "Confirmation threshold must be an integer between 1,000 and 50,000.",
            });

            return;
          }

          settings.wallet.confirmThresholdEncrypted =
            encryptData(
              String(
                threshold
              )
            );
        }
      }

      await settings.save();

      res.setHeader(
        "Cache-Control",
        "private, no-store"
      );

      res.status(
        200
      ).json({
        success: true,
        message:
          "Preferences updated successfully.",

        preferences:
          toSettingsDTO(
            settings
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "UPDATE USER PREFERENCES ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to update preferences.",
      });
    }
  };

/* =========================================================
   UPDATE PROFILE
   PATCH /api/settings/profile

   - Name can be changed normally.
   - Changing email or phone requires current password.
   - Email/phone stay encrypted + HMAC lookup.
========================================================= */

export const updateSettingsProfile =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized.",
        });

        return;
      }

      const {
        name,
        email,
        phone,
        password,
      } =
        req.body ?? {};

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

      if (
        !normalizedName ||
        !normalizedEmail
      ) {
        res.status(
          400
        ).json({
          success: false,
          message:
            "Name and email are required.",
        });

        return;
      }

      if (
        normalizedName.length >
        80
      ) {
        res.status(
          400
        ).json({
          success: false,
          message:
            "Name is too long.",
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
        res.status(
          400
        ).json({
          success: false,
          message:
            "Please provide a valid email address.",
        });

        return;
      }

      const user =
        await User.findById(
          userId
        ).select(
          "+password"
        );

      if (!user) {
        res.status(
          404
        ).json({
          success: false,
          message:
            "User not found.",
        });

        return;
      }

      const currentEmail =
        safeDecrypt(
          user.emailEncrypted
        );

      const currentPhone =
        safeDecrypt(
          user.phoneEncrypted
        );

      const emailChanged =
        normalizedEmail !==
        normalizeEmail(
          currentEmail
        );

      const phoneChanged =
        normalizedPhone !==
        normalizePhone(
          currentPhone
        );

      /*
       * Contact changes are security-sensitive
       * because email/phone are used for identity
       * and transfer-related lookup.
       */
      if (
        emailChanged ||
        phoneChanged
      ) {
        const currentPassword =
          toStringValue(
            password
          );

        if (
          !currentPassword
        ) {
          res.status(
            400
          ).json({
            success: false,
            message:
              "Current password is required to change email or phone.",
          });

          return;
        }

        const storedPassword =
          user.get(
            "password"
          ) as
            | string
            | undefined;

        if (
          !storedPassword
        ) {
          res.status(
            401
          ).json({
            success: false,
            message:
              "Unable to verify current password.",
          });

          return;
        }

        const matched =
          await verifyPassword(
            storedPassword,
            currentPassword
          );

        if (!matched) {
          res.status(
            401
          ).json({
            success: false,
            message:
              "Current password is incorrect.",
          });

          return;
        }
      }

      /* =====================================================
         EMAIL DUPLICATE CHECK
      ====================================================== */

      const emailLookup =
        createLookupHash(
          normalizedEmail
        );

      const emailOwner =
        await User.findOne({
          emailLookup,

          _id: {
            $ne:
              user._id,
          },
        }).select(
          "_id"
        );

      if (
        emailOwner
      ) {
        res.status(
          409
        ).json({
          success: false,
          message:
            "That email address is already in use.",
        });

        return;
      }

      /* =====================================================
         PHONE DUPLICATE CHECK
      ====================================================== */

      const phoneLookup =
        normalizedPhone
          ? createLookupHash(
              normalizedPhone
            )
          : undefined;

      if (
        normalizedPhone &&
        phoneLookup
      ) {
        const phoneOwner =
          await User.findOne({
            phoneLookup,

            _id: {
              $ne:
                user._id,
            },
          }).select(
            "_id"
          );

        if (
          phoneOwner
        ) {
          res.status(
            409
          ).json({
            success: false,
            message:
              "That phone number is already in use.",
          });

          return;
        }
      }

      /* =====================================================
         UPDATE
      ====================================================== */

      user.name =
        normalizedName;

      if (
        emailChanged
      ) {
        user.emailEncrypted =
          encryptData(
            normalizedEmail
          );

        user.emailLookup =
          emailLookup;
      }

      if (
        phoneChanged
      ) {
        if (
          normalizedPhone
        ) {
          user.phoneEncrypted =
            encryptData(
              normalizedPhone
            );

          user.phoneLookup =
            phoneLookup;
        } else {
          user.phoneEncrypted =
            undefined;

          user.phoneLookup =
            undefined;
        }
      }

      await user.save();

      res.status(
        200
      ).json({
        success: true,
        message:
          "Profile updated successfully.",

        profile: {
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
      error
    ) {
      console.error(
        "UPDATE SETTINGS PROFILE ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to update profile.",
      });
    }
  };

/* =========================================================
   CURRENT SESSION
   GET /api/settings/session

   This backend currently uses stateless JWTs and does not
   keep a per-device session collection. Therefore only the
   current authenticated request can be described truthfully.
========================================================= */

export const getCurrentSession =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    const forwardedFor =
      req.headers[
        "x-forwarded-for"
      ];

    const ip =
      typeof forwardedFor ===
        "string"
        ? forwardedFor
            .split(
              ","
            )[0]
            ?.trim() ||
          req.ip
        : req.ip;

    res.status(
      200
    ).json({
      success: true,

      sessions: [
        {
          id:
            "current",

          current:
            true,

          device:
            req.get(
              "user-agent"
            ) ||
            "Unknown device",

          location:
            "Current request",

          lastActive:
            new Date()
              .toISOString(),

          ip,
        },
      ],

      note:
        "Only the current session is available because the authentication system does not yet persist individual device sessions.",
    });
  };

/* =========================================================
   LOG OUT ALL DEVICES
   POST /api/settings/logout-all

   authVersion invalidates every previously issued JWT.
========================================================= */

export const logoutAllDevices =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized.",
        });

        return;
      }

      await User.findByIdAndUpdate(
        userId,
        {
          $inc: {
            authVersion:
              1,
          },
        }
      );

      clearAuthCookie(
        res
      );

      res.status(
        200
      ).json({
        success: true,
        message:
          "All sessions were revoked. Please sign in again.",
      });
    } catch (
      error
    ) {
      console.error(
        "LOGOUT ALL DEVICES ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to revoke sessions.",
      });
    }
  };

/* =========================================================
   EXPORT SETTINGS
   GET /api/settings/export

   Safe JSON only. No password, HMAC lookup, encrypted blobs,
   reset tokens or internal security fields are returned.
========================================================= */

export const exportUserSettings =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized.",
        });

        return;
      }

      const [
        user,
        settings,
      ] =
        await Promise.all([
          User.findById(
            userId
          ).select(
            "-password"
          ),

          getOrCreateSettings(
            userId
          ),
        ]);

      if (!user) {
        res.status(
          404
        ).json({
          success: false,
          message:
            "User not found.",
        });

        return;
      }

      res.setHeader(
        "Cache-Control",
        "private, no-store"
      );

      res.status(
        200
      ).json({
        success: true,

        export: {
          generatedAt:
            new Date()
              .toISOString(),

          profile: {
            name:
              user.name,

            email:
              safeDecrypt(
                user.emailEncrypted
              ),

            phone:
              safeDecrypt(
                user.phoneEncrypted
              ),

            role:
              user.role,

            kycStatus:
              user.kycStatus,

            createdAt:
              user.createdAt,
          },

          preferences:
            toSettingsDTO(
              settings
            ),
        },
      });
    } catch (
      error
    ) {
      console.error(
        "EXPORT USER SETTINGS ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to export account settings.",
      });
    }
  };

/* =========================================================
   DELETE ACCOUNT
   DELETE /api/settings/account

   This is a privacy-preserving soft deletion:
   - Requires current password + literal DELETE confirmation.
   - Refuses while wallet balance is non-zero.
   - Removes original email/phone/name from the active record.
   - Keeps the user id so transaction/audit references do not
     become orphaned.
   - Revokes all JWTs using authVersion.
========================================================= */

export const deleteUserAccount =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized.",
        });

        return;
      }

      const password =
        toStringValue(
          req.body?.password
        );

      const confirmation =
        toStringValue(
          req.body?.confirmation
        ).trim();

      if (
        confirmation !==
        "DELETE"
      ) {
        res.status(
          400
        ).json({
          success: false,
          message:
            'Type "DELETE" to confirm account deletion.',
        });

        return;
      }

      if (!password) {
        res.status(
          400
        ).json({
          success: false,
          message:
            "Current password is required.",
        });

        return;
      }

      const [
        user,
        wallet,
      ] =
        await Promise.all([
          User.findById(
            userId
          ).select(
            "+password"
          ),

          Wallet.findOne({
            userId,
          }),
        ]);

      if (!user) {
        res.status(
          404
        ).json({
          success: false,
          message:
            "User not found.",
        });

        return;
      }

      if (
        wallet &&
        Number(
          wallet.balance
        ) !== 0
      ) {
        res.status(
          409
        ).json({
          success: false,
          message:
            "Your wallet balance must be zero before account deletion.",
        });

        return;
      }

      const storedPassword =
        user.get(
          "password"
        ) as
          | string
          | undefined;

      if (
        !storedPassword
      ) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Unable to verify current password.",
        });

        return;
      }

      const matched =
        await verifyPassword(
          storedPassword,
          password
        );

      if (!matched) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Current password is incorrect.",
        });

        return;
      }

      const randomIdentity =
        crypto
          .randomBytes(
            24
          )
          .toString(
            "hex"
          );

      const deletedEmail =
        `deleted-${user._id.toString()}-${randomIdentity}@invalid.local`;

      /*
       * Overwrite original profile PII while keeping
       * the same user document id for transaction/audit
       * referential integrity.
       */
      user.name =
        "Deleted User";

      user.emailEncrypted =
        encryptData(
          deletedEmail
        );

      user.emailLookup =
        createLookupHash(
          deletedEmail
        );

      user.phoneEncrypted =
        undefined;

      user.phoneLookup =
        undefined;

      user.password =
        await hashPassword(
          crypto
            .randomBytes(
              48
            )
            .toString(
              "hex"
            )
        );

      user.accountStatus =
        "deleted";

      user.deletedAt =
        new Date();

      user.authVersion =
        (
          user.authVersion ||
          0
        ) +
        1;

      await Promise.all([
        user.save(),

        UserSettings.deleteOne({
          userId:
            user._id,
        }),
      ]);

      clearAuthCookie(
        res
      );

      res.status(
        200
      ).json({
        success: true,
        message:
          "Account deletion completed.",
      });
    } catch (
      error
    ) {
      console.error(
        "DELETE USER ACCOUNT ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to delete account.",
      });
    }
  };
