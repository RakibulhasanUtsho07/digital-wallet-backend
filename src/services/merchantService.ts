import crypto from "node:crypto";

import {
  Merchant,
  type IMerchant,
  type MerchantBusinessType,
} from "../models/Merchant.js";

import {
  MerchantApiKey,
  MERCHANT_API_SCOPES,
  type MerchantApiScope,
  type MerchantApiKeyEnvironment,
} from "../models/MerchantApiKey.js";

import {
  User,
} from "../models/User.js";

/* =========================================================
   TYPES
========================================================= */

export interface CreateMerchantInput {
  ownerId: string;
  businessName: string;
  businessDisplayName?: string;
  businessType?: MerchantBusinessType;
  slug?: string;
  businessEmail?: string;
  businessPhone?: string;
  websiteUrl?: string;
  description?: string;
  country?: string;
  countryCode?: string;
  defaultCurrency?: string;
}

export interface CreateApiKeyInput {
  merchantId: string;
  environment: MerchantApiKeyEnvironment;
  name?: string;
  scopes?: MerchantApiScope[];
  expiresAt?: Date;
}

export interface GeneratedApiKey {
  id: string;
  keyId: string;
  key: string;
  keyPrefix: string;
  environment: MerchantApiKeyEnvironment;
  scopes: MerchantApiScope[];
  expiresAt?: Date;
  createdAt: Date;
}

/* =========================================================
   HELPERS
========================================================= */

const normalizeSlug = (
  value: string
): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(0, 90);
};

const createUniqueSlug = async (
  preferredSlug: string
): Promise<string> => {
  const base =
    normalizeSlug(
      preferredSlug
    ) ||
    "merchant";

  let slug =
    base;

  let counter = 1;

  while (
    await Merchant.exists({
      slug,
    })
  ) {
    counter += 1;

    slug =
      `${base}-${counter}`;
  }

  return slug;
};

const generateKeyId =
  (): string => {
    return `key_${crypto.randomBytes(12).toString("hex")}`;
  };

const generateSecret =
  (): string => {
    return crypto.randomBytes(32).toString("base64url");
  };

const hashSecret =
  (
    secret: string
  ): string => {
    return crypto
      .createHash("sha256")
      .update(secret)
      .digest("hex");
  };

/* =========================================================
   CREATE MERCHANT
========================================================= */

export const createMerchant =
  async (
    input: CreateMerchantInput
  ): Promise<IMerchant> => {
    const {
      ownerId,
      businessName,
      businessDisplayName,
      businessType =
        "individual",
      slug,
      businessEmail,
      businessPhone,
      websiteUrl,
      description,
      country = "Bangladesh",
      countryCode = "BD",
      defaultCurrency = "BDT",
    } = input;

    if (
      !businessName?.trim()
    ) {
      throw new Error(
        "Business name is required."
      );
    }

    const owner =
      await User.findById(
        ownerId
      )
        .select(
          "_id name role accountStatus"
        )
        .lean();

    if (!owner) {
      throw new Error(
        "User account not found."
      );
    }

    if (
      owner.accountStatus !==
      "active"
    ) {
      throw new Error(
        "User account is not active."
      );
    }

    const existingMerchant =
      await Merchant.findOne({
        ownerId,
      });

    if (existingMerchant) {
      throw new Error(
        "A merchant account already exists for this user."
      );
    }

    const merchantSlug =
      await createUniqueSlug(
        slug ||
          businessName
      );

    const normalizedEmail =
      (
        businessEmail ||
        ""
      )
        .trim()
        .toLowerCase();

    /*
     * If caller does not provide a merchant email,
     * recover encrypted email is intentionally not attempted here.
     *
     * Current implementation expects businessEmail from request.
     */
    if (
      !normalizedEmail
    ) {
      throw new Error(
        "Business email is required."
      );
    }

    const merchant =
      await Merchant.create({
        ownerId,

        businessName:
          businessName.trim(),

        businessDisplayName:
          businessDisplayName?.trim() ||
          undefined,

        businessType,

        slug:
          merchantSlug,

        businessEmail:
          normalizedEmail,

        businessPhone:
          businessPhone?.trim() ||
          undefined,

        websiteUrl:
          websiteUrl?.trim() ||
          undefined,

        description:
          description?.trim() ||
          undefined,

        country:
          country.trim(),

        countryCode:
          countryCode.trim().toUpperCase(),

        defaultCurrency:
          defaultCurrency
            .trim()
            .toUpperCase(),

        status:
          "pending",

        verificationStatus:
          "pending",

        testEnabled:
          true,

        liveEnabled:
          false,
      });

    /*
     * Promote user to Merchant role.
     *
     * authVersion is incremented so existing sessions
     * are invalidated and a fresh JWT can carry role=merchant.
     */
    await User.updateOne(
      {
        _id:
          ownerId,

        accountStatus:
          "active",
      },
      {
        $set: {
          role:
            "merchant",
        },

        $inc: {
          authVersion:
            1,
        },
      }
    );

    return merchant;
  };

/* =========================================================
   GENERATE API KEY
========================================================= */

export const generateMerchantApiKey =
  async (
    input: CreateApiKeyInput
  ): Promise<GeneratedApiKey> => {
    const {
      merchantId,
      environment,
      name,
      scopes =
        [...MERCHANT_API_SCOPES],
      expiresAt,
    } = input;

    const merchant =
      await Merchant.findById(
        merchantId
      ).lean();

    if (!merchant) {
      throw new Error(
        "Merchant account not found."
      );
    }

    if (
      environment ===
      "test"
    ) {
      if (
        merchant.testEnabled !==
        true
      ) {
        throw new Error(
          "Test environment is disabled."
        );
      }
    }

    if (
      environment ===
      "live"
    ) {
      if (
        merchant.liveEnabled !==
        true
      ) {
        throw new Error(
          "Live environment is not enabled for this merchant."
        );
      }
    }

    const validScopes =
      scopes.filter(
        (
          scope
        ): scope is MerchantApiScope =>
          (
            MERCHANT_API_SCOPES as readonly string[]
          ).includes(
            scope
          )
      );

    if (
      validScopes.length ===
      0
    ) {
      throw new Error(
        "At least one valid API scope is required."
      );
    }

    const keyId =
      generateKeyId();

    const secret =
      generateSecret();

    const keyPrefix =
      environment ===
      "test"
        ? "sk_test_"
        : "sk_live_";

    /*
     * IMPORTANT:
     * The plaintext secret is returned only once.
     * Database receives only the hash.
     */
    const fullSecret =
      `${keyPrefix}${secret}`;

    const secretHash =
      hashSecret(
        fullSecret
      );

    const record =
      await MerchantApiKey.create({
        merchantId,

        keyId,

        keyPrefix,

        secretHash,

        environment,

        scopes:
          validScopes,

        status:
          "active",

        expiresAt:
          expiresAt ||
          undefined,

        name:
          name?.trim() ||
          undefined,
      });

    return {
      id:
        record._id.toString(),

      keyId,

      key:
        fullSecret,

      keyPrefix,

      environment,

      scopes:
        validScopes,

      expiresAt:
        record.expiresAt,

      createdAt:
        record.createdAt,
    };
  };

/* =========================================================
   LIST API KEYS
========================================================= */

export const listMerchantApiKeys =
  async (
    merchantId: string
  ) => {
    return MerchantApiKey.find({
      merchantId,
    })
      .select(
        "keyId keyPrefix environment scopes status lastUsedAt expiresAt revokedAt name createdAt updatedAt"
      )
      .sort({
        createdAt:
          -1,
      })
      .lean();
  };

/* =========================================================
   REVOKE API KEY
========================================================= */

export const revokeMerchantApiKey =
  async (
    merchantId: string,
    keyId: string
  ): Promise<boolean> => {
    const result =
      await MerchantApiKey.updateOne(
        {
          merchantId,

          keyId,

          status:
            "active",
        },
        {
          $set: {
            status:
              "revoked",

            revokedAt:
              new Date(),
          },
        }
      );

    return (
      result.modifiedCount >
      0
    );
  };

/* =========================================================
   ROTATE API KEY
========================================================= */

export const rotateMerchantApiKey =
  async (
    merchantId: string,
    keyId: string
  ): Promise<GeneratedApiKey> => {
    const existing =
      await MerchantApiKey.findOne({
        merchantId,

        keyId,

        status:
          "active",
      })
        .select(
          "environment scopes name"
        )
        .lean();

    if (!existing) {
      throw new Error(
        "Active API key not found."
      );
    }

    await MerchantApiKey.updateOne(
      {
        merchantId,

        keyId,

        status:
          "active",
      },
      {
        $set: {
          status:
            "revoked",

          revokedAt:
            new Date(),
        },
      }
    );

    return generateMerchantApiKey({
      merchantId,

      environment:
        existing.environment,

      scopes:
        existing.scopes,

      name:
        existing.name
          ? `${existing.name} - Rotated`
          : undefined,
    });
  };