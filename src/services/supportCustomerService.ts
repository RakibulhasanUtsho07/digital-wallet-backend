import mongoose from "mongoose";

import {
  User,
} from "../models/User.js";

import {
  Wallet,
} from "../models/Wallet.js";

import {
  createLookupHash,
  decryptData,
  normalizeEmail,
} from "../utils/crypto.js";

/* =========================================================
   TYPES
========================================================= */

export type SupportCustomerType =
  | "user"
  | "merchant";

/* =========================================================
   SAFE DECRYPT
========================================================= */

const safeDecrypt = (
  value:
    | {
        encrypted: string;
        iv: string;
        authTag: string;
      }
    | undefined
): string => {
  if (!value) {
    return "";
  }

  try {
    return decryptData(value);
  } catch {
    return "";
  }
};

/* =========================================================
   CUSTOMER ROLE CHECK
========================================================= */

const CUSTOMER_ROLES:
  readonly SupportCustomerType[] = [
    "user",
    "merchant",
  ];

/* =========================================================
   SEARCH CUSTOMERS / MERCHANTS
========================================================= */

export const searchSupportCustomers =
  async ({
    search,
    role,
    page = 1,
    limit = 20,
  }: {
    search?: string;
    role?: SupportCustomerType;
    page?: number;
    limit?: number;
  }) => {
    const safePage =
      Math.max(
        1,
        Math.floor(page)
      );

    const safeLimit =
      Math.min(
        50,
        Math.max(
          1,
          Math.floor(limit)
        )
      );

    const skip =
      (safePage - 1) *
      safeLimit;

    const query:
      Record<string, unknown> = {
      accountStatus: "active",
    };

    if (
      role &&
      CUSTOMER_ROLES.includes(
        role
      )
    ) {
      query.role = role;
    } else {
      query.role = {
        $in: CUSTOMER_ROLES,
      };
    }

    const cleanSearch =
      search
        ?.trim()
        .slice(
          0,
          120
        );

    const orConditions:
      Record<string, unknown>[] = [];

    if (cleanSearch) {
      /* ================================================
         NAME SEARCH
      ================================================= */

      orConditions.push({
        name: {
          $regex:
            cleanSearch.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            ),
          $options: "i",
        },
      });

      /* ================================================
         EMAIL SEARCH
      ================================================= */

      if (
        cleanSearch.includes("@")
      ) {
        const normalizedEmail =
          normalizeEmail(
            cleanSearch
          );

        if (
          normalizedEmail
        ) {
          orConditions.push({
            emailLookup:
              createLookupHash(
                normalizedEmail
              ),
          });
        }
      }

      /* ================================================
         PHONE LOOKUP
      ================================================= */

      const normalizedPhone =
        cleanSearch.replace(
          /[\s\-()]/g,
          ""
        );

      if (
        normalizedPhone.length >=
        6
      ) {
        orConditions.push({
          phoneLookup:
            createLookupHash(
              normalizedPhone
            ),
        });
      }

      /* ================================================
         OBJECT ID SEARCH
      ================================================= */

      if (
        mongoose.Types.ObjectId.isValid(
          cleanSearch
        )
      ) {
        orConditions.push({
          _id:
            cleanSearch,
        });
      }
    }

    if (
      orConditions.length
    ) {
      query.$or =
        orConditions;
    }

    const [
      users,
      total,
    ] =
      await Promise.all([
        User.find(
          query
        )
          .select(
            "name emailEncrypted phoneEncrypted role kycStatus walletId createdAt"
          )
          .sort({
            createdAt: -1,
          })
          .skip(
            skip
          )
          .limit(
            safeLimit
          )
          .lean(),

        User.countDocuments(
          query
        ),
      ]);

    return {
      customers:
        users.map(
          (
            user
          ) => ({
            id:
              user._id.toString(),

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

            walletLinked:
              Boolean(
                user.walletId
              ),

            createdAt:
              user.createdAt
                ? new Date(
                    user.createdAt
                  ).toISOString()
                : null,
          })
        ),

      total,

      page:
        safePage,

      limit:
        safeLimit,

      totalPages:
        Math.ceil(
          total /
            safeLimit
        ),
    };
  };

/* =========================================================
   GET CUSTOMER / MERCHANT PROFILE
========================================================= */

export const getSupportCustomerProfile =
  async (
    customerId: string
  ) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        customerId
      )
    ) {
      return null;
    }

    const customer =
      await User.findOne({
        _id:
          customerId,

        accountStatus:
          "active",

        role: {
          $in:
            CUSTOMER_ROLES,
        },
      })
        .select(
          "name emailEncrypted phoneEncrypted role kycStatus walletId createdAt updatedAt emailVerified emailVerifiedAt"
        )
        .lean();

    if (
      !customer
    ) {
      return null;
    }

    const wallet =
      customer.walletId
        ? await Wallet.findById(
            customer.walletId
          )
            .select(
              "_id balance status"
            )
            .lean()
        : await Wallet.findOne({
            userId:
              customer._id,
          })
            .select(
              "_id balance status"
            )
            .lean();

    return {
      id:
        customer._id.toString(),

      name:
        customer.name,

      email:
        safeDecrypt(
          customer.emailEncrypted
        ),

      phone:
        safeDecrypt(
          customer.phoneEncrypted
        ),

      role:
        customer.role,

      accountStatus:
        customer.accountStatus,

      kycStatus:
        customer.kycStatus,

      emailVerified:
        customer.emailVerified,

      emailVerifiedAt:
        customer.emailVerifiedAt
          ? new Date(
              customer.emailVerifiedAt
            ).toISOString()
          : null,

      wallet:
        wallet
          ? {
              id:
                wallet._id.toString(),

              balance:
                wallet.balance,

              status:
                wallet.status,
            }
          : null,

      walletLinked:
        Boolean(
          wallet
        ),

      createdAt:
        customer.createdAt
          ? new Date(
              customer.createdAt
            ).toISOString()
          : null,

      updatedAt:
        customer.updatedAt
          ? new Date(
              customer.updatedAt
            ).toISOString()
          : null,
    };
  };