import mongoose from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  MerchantSettings,
  type IMerchantSettings,
  type MerchantBrandingSettings,
  type MerchantBusinessSettings,
  type MerchantCheckoutSettings,
  type MerchantGeneralSettings,
  type MerchantNotificationSettings,
  type MerchantSecuritySettings,
  type MerchantThemeSettings,
} from "../models/MerchantSettings.js";

import {
  MerchantSettingsAudit,
  type MerchantSettingsAuditAction,
  type MerchantSettingsAuditSection,
} from "../models/MerchantSettingsAudit.js";

import {
  MerchantSettingsValidationError,
} from "./merchantSettingsValidation.js";

/* =========================================================
   DEFAULT THEME
========================================================= */

export const DEFAULT_MERCHANT_THEME:
  MerchantThemeSettings = {
  mode:
    "system",

  accent:
    "purple",

  density:
    "comfortable",

  radius:
    "rounded",

  reducedMotion:
    false,

  compactSidebar:
    false,
};

/* =========================================================
   MERCHANT LOOKUP
========================================================= */

async function findMerchantForOwner(
  ownerId:
    string,
) {
  if (
    !mongoose.isValidObjectId(
      ownerId,
    )
  ) {
    throw new MerchantSettingsValidationError(
      "Invalid merchant owner ID.",
      400,
    );
  }

  const merchant =
    await Merchant.findOne({
      ownerId:
        new mongoose.Types.ObjectId(
          ownerId,
        ),
    })
      .select(
        [
          "_id",
          "ownerId",
          "businessName",
          "businessDisplayName",
          "businessType",
          "slug",
          "businessEmail",
          "businessPhone",
          "websiteUrl",
          "description",
          "country",
          "countryCode",
          "defaultCurrency",
          "status",
          "verificationStatus",
          "testEnabled",
          "liveEnabled",
        ].join(
          " ",
        ),
      )
      .lean();

  if (!merchant) {
    throw new MerchantSettingsValidationError(
      "Merchant account not found.",
      404,
    );
  }

  return merchant;
}

/* =========================================================
   ENSURE SETTINGS
========================================================= */

async function ensureSettings(
  merchantId:
    mongoose.Types.ObjectId,
): Promise<
  IMerchantSettings
> {
  const settings =
    await MerchantSettings.findOneAndUpdate(
      {
        merchantId,
      },
      {
        $setOnInsert: {
          merchantId,
        },
      },
      {
        new:
          true,

        upsert:
          true,

        runValidators:
          true,

        setDefaultsOnInsert:
          true,
      },
    );

  if (!settings) {
    throw new Error(
      "Unable to initialize merchant settings.",
    );
  }

  return settings;
}

/* =========================================================
   SAFE VIEW
========================================================= */

function settingsView(
  settings:
    IMerchantSettings,
) {
  return {
    general: {
      displayName:
        settings.general
          .displayName,

      supportEmail:
        settings.general
          .supportEmail,

      supportPhone:
        settings.general
          .supportPhone,

      website:
        settings.general
          .website,

      timezone:
        settings.general
          .timezone,

      locale:
        settings.general
          .locale,
    },

    business: {
      category:
        settings.business
          .category,

      publicDescription:
        settings.business
          .publicDescription,

      address: {
        line1:
          settings.business
            .address
            ?.line1,

        line2:
          settings.business
            .address
            ?.line2,

        city:
          settings.business
            .address
            ?.city,

        state:
          settings.business
            .address
            ?.state,

        postalCode:
          settings.business
            .address
            ?.postalCode,

        country:
          settings.business
            .address
            ?.country,
      },
    },

    checkout: {
      defaultExpiryMinutes:
        settings.checkout
          .defaultExpiryMinutes,

      collectCustomerName:
        settings.checkout
          .collectCustomerName,

      collectCustomerEmail:
        settings.checkout
          .collectCustomerEmail,

      defaultReturnUrl:
        settings.checkout
          .defaultReturnUrl,

      defaultCancelUrl:
        settings.checkout
          .defaultCancelUrl,

      checkoutNote:
        settings.checkout
          .checkoutNote,
    },

    branding: {
      checkoutDisplayName:
        settings.branding
          .checkoutDisplayName,

      checkoutAccentColor:
        settings.branding
          .checkoutAccentColor,

      logoUrl:
        settings.branding
          .logoUrl,
    },

    theme: {
      mode:
        settings.theme.mode,

      accent:
        settings.theme.accent,

      density:
        settings.theme.density,

      radius:
        settings.theme.radius,

      reducedMotion:
        settings.theme
          .reducedMotion,

      compactSidebar:
        settings.theme
          .compactSidebar,
    },

    notifications: {
      paymentCompleted:
        settings.notifications
          .paymentCompleted,

      paymentFailed:
        settings.notifications
          .paymentFailed,

      refundCreated:
        settings.notifications
          .refundCreated,

      payoutUpdates:
        settings.notifications
          .payoutUpdates,

      securityAlerts:
        settings.notifications
          .securityAlerts,
    },

    security: {
      notifyOnApiKeyCreated:
        settings.security
          .notifyOnApiKeyCreated,

      notifyOnApiKeyRotated:
        settings.security
          .notifyOnApiKeyRotated,

      notifyOnWebhookSecretRotated:
        settings.security
          .notifyOnWebhookSecretRotated,

      notifyOnPayoutRequest:
        settings.security
          .notifyOnPayoutRequest,
    },

    revision:
      settings.revision,

    updatedAt:
      settings.updatedAt,
  };
}

/* =========================================================
   AUDIT
========================================================= */

async function writeAudit({
  merchantId,
  actorUserId,
  section,
  action,
  before,
  after,
}: {
  merchantId:
    mongoose.Types.ObjectId;

  actorUserId:
    string;

  section:
    MerchantSettingsAuditSection;

  action:
    MerchantSettingsAuditAction;

  before:
    Record<
      string,
      unknown
    >;

  after:
    Record<
      string,
      unknown
    >;
}): Promise<void> {
  const keys =
    new Set([
      ...Object.keys(
        before,
      ),
      ...Object.keys(
        after,
      ),
    ]);

  const changedFields =
    [...keys].filter(
      (
        key,
      ) =>
        JSON.stringify(
          before[
            key
          ],
        ) !==
        JSON.stringify(
          after[
            key
          ],
        ),
    );

  if (
    changedFields.length ===
    0
  ) {
    return;
  }

  await MerchantSettingsAudit.create({
    merchantId,

    actorUserId:
      new mongoose.Types.ObjectId(
        actorUserId,
      ),

    section,

    action,

    changedFields,

    before,

    after,

    occurredAt:
      new Date(),
  });
}

/* =========================================================
   GENERIC SECTION UPDATE
========================================================= */

async function updateSection({
  ownerId,
  section,
  patch,
  action = "updated",
}: {
  ownerId:
    string;

  section:
    MerchantSettingsAuditSection;

  patch:
    Record<
      string,
      unknown
    >;

  action?:
    MerchantSettingsAuditAction;
}) {
  const merchant =
    await findMerchantForOwner(
      ownerId,
    );

  const settings =
    await ensureSettings(
      merchant._id,
    );

  const beforeSection =
    JSON.parse(
      JSON.stringify(
        (
          settings as unknown as
            Record<
              string,
              unknown
            >
        )[
          section
        ] ??
          {},
      ),
    ) as Record<
      string,
      unknown
    >;

  const update:
    Record<
      string,
      unknown
    > = {};

  for (
    const [
      key,
      value,
    ] of Object.entries(
      patch,
    )
  ) {
    if (
      section ===
        "business" &&
      key ===
        "address" &&
      value &&
      typeof value ===
        "object"
    ) {
      for (
        const [
          addressKey,
          addressValue,
        ] of Object.entries(
          value as Record<
            string,
            unknown
          >,
        )
      ) {
        update[
          `business.address.${addressKey}`
        ] =
          addressValue;
      }

      continue;
    }

    update[
      `${section}.${key}`
    ] =
      value;
  }

  /*
   * Empty PATCH should not increment revision.
   */
  if (
    Object.keys(
      update,
    ).length ===
    0
  ) {
    return {
      merchant,

      settings,
    };
  }

  const updated =
    await MerchantSettings.findOneAndUpdate(
      {
        merchantId:
          merchant._id,
      },
      {
        $set:
          update,

        $inc: {
          revision:
            1,
        },
      },
      {
        new:
          true,

        runValidators:
          true,
      },
    );

  if (!updated) {
    throw new Error(
      "Unable to update merchant settings.",
    );
  }

  const afterSection =
    JSON.parse(
      JSON.stringify(
        (
          updated as unknown as
            Record<
              string,
              unknown
            >
        )[
          section
        ] ??
          {},
      ),
    ) as Record<
      string,
      unknown
    >;

  await writeAudit({
    merchantId:
      merchant._id,

    actorUserId:
      ownerId,

    section,

    action,

    before:
      beforeSection,

    after:
      afterSection,
  });

  return {
    merchant,

    settings:
      updated,
  };
}

/* =========================================================
   GET ALL SETTINGS
========================================================= */

export async function getMerchantSettings(
  ownerId:
    string,
) {
  const merchant =
    await findMerchantForOwner(
      ownerId,
    );

  const settings =
    await ensureSettings(
      merchant._id,
    );

  return {
    merchant: {
      id:
        merchant._id.toString(),

      businessName:
        merchant.businessName,

      businessDisplayName:
        merchant.businessDisplayName,

      businessType:
        merchant.businessType,

      slug:
        merchant.slug,

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

      /*
       * Existing merchant identity fields are returned
       * for display/read-only use.
       */
      businessEmail:
        merchant.businessEmail,

      businessPhone:
        merchant.businessPhone,

      websiteUrl:
        merchant.websiteUrl,

      description:
        merchant.description,

      country:
        merchant.country,

      countryCode:
        merchant.countryCode,
    },

    settings:
      settingsView(
        settings,
      ),
  };
}

/* =========================================================
   GENERAL
========================================================= */

export async function updateMerchantGeneralSettings(
  ownerId:
    string,

  input:
    Partial<
      MerchantGeneralSettings
    >,
) {
  const result =
    await updateSection({
      ownerId,

      section:
        "general",

      patch:
        input as Record<
          string,
          unknown
        >,
    });

  return settingsView(
    result.settings,
  );
}

/* =========================================================
   BUSINESS
========================================================= */

export async function updateMerchantBusinessSettings(
  ownerId:
    string,

  input:
    Partial<
      MerchantBusinessSettings
    >,
) {
  const result =
    await updateSection({
      ownerId,

      section:
        "business",

      patch:
        input as Record<
          string,
          unknown
        >,
    });

  return settingsView(
    result.settings,
  );
}

/* =========================================================
   CHECKOUT
========================================================= */

export async function updateMerchantCheckoutSettings(
  ownerId:
    string,

  input:
    Partial<
      MerchantCheckoutSettings
    >,
) {
  const result =
    await updateSection({
      ownerId,

      section:
        "checkout",

      patch:
        input as Record<
          string,
          unknown
        >,
    });

  return settingsView(
    result.settings,
  );
}

/* =========================================================
   BRANDING
========================================================= */

export async function updateMerchantBrandingSettings(
  ownerId:
    string,

  input:
    Partial<
      MerchantBrandingSettings
    >,
) {
  const result =
    await updateSection({
      ownerId,

      section:
        "branding",

      patch:
        input as Record<
          string,
          unknown
        >,
    });

  return settingsView(
    result.settings,
  );
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

export async function updateMerchantNotificationSettings(
  ownerId:
    string,

  input:
    Partial<
      MerchantNotificationSettings
    >,
) {
  const result =
    await updateSection({
      ownerId,

      section:
        "notifications",

      patch:
        input as Record<
          string,
          unknown
        >,
    });

  return settingsView(
    result.settings,
  );
}

/* =========================================================
   SECURITY
========================================================= */

export async function updateMerchantSecuritySettings(
  ownerId:
    string,

  input:
    Partial<
      MerchantSecuritySettings
    >,
) {
  const result =
    await updateSection({
      ownerId,

      section:
        "security",

      patch:
        input as Record<
          string,
          unknown
        >,
    });

  return settingsView(
    result.settings,
  );
}

/* =========================================================
   THEME GET
========================================================= */

export async function getMerchantThemeSettings(
  ownerId:
    string,
) {
  const merchant =
    await findMerchantForOwner(
      ownerId,
    );

  const settings =
    await ensureSettings(
      merchant._id,
    );

  return {
    theme: {
      mode:
        settings.theme.mode,

      accent:
        settings.theme.accent,

      density:
        settings.theme.density,

      radius:
        settings.theme.radius,

      reducedMotion:
        settings.theme
          .reducedMotion,

      compactSidebar:
        settings.theme
          .compactSidebar,
    },

    revision:
      settings.revision,

    updatedAt:
      settings.updatedAt,
  };
}

/* =========================================================
   THEME UPDATE
========================================================= */

export async function updateMerchantThemeSettings(
  ownerId:
    string,

  input:
    Partial<
      MerchantThemeSettings
    >,
) {
  const result =
    await updateSection({
      ownerId,

      section:
        "theme",

      patch:
        input as Record<
          string,
          unknown
        >,
    });

  return {
    theme:
      settingsView(
        result.settings,
      ).theme,

    revision:
      result.settings
        .revision,

    updatedAt:
      result.settings
        .updatedAt,
  };
}

/* =========================================================
   THEME RESET
========================================================= */

export async function resetMerchantThemeSettings(
  ownerId:
    string,
) {
  const result =
    await updateSection({
      ownerId,

      section:
        "theme",

      action:
        "reset",

      patch:
        DEFAULT_MERCHANT_THEME as unknown as Record<
          string,
          unknown
        >,
    });

  return {
    theme:
      settingsView(
        result.settings,
      ).theme,

    revision:
      result.settings
        .revision,

    updatedAt:
      result.settings
        .updatedAt,
  };
}