import type {
  MerchantBrandingSettings,
  MerchantBusinessAddress,
  MerchantBusinessSettings,
  MerchantCheckoutSettings,
  MerchantGeneralSettings,
  MerchantNotificationSettings,
  MerchantSecuritySettings,
  MerchantThemeAccent,
  MerchantThemeDensity,
  MerchantThemeMode,
  MerchantThemeRadius,
  MerchantThemeSettings,
} from "../models/MerchantSettings.js";

/* =========================================================
   ERROR
========================================================= */

export class MerchantSettingsValidationError
  extends Error {
  constructor(
    message:
      string,

    readonly statusCode:
      number = 400,
  ) {
    super(
      message,
    );

    this.name =
      "MerchantSettingsValidationError";
  }
}

/* =========================================================
   HELPERS
========================================================= */

function objectValue(
  value:
    unknown,
): Record<
  string,
  unknown
> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new MerchantSettingsValidationError(
      "A valid settings object is required.",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

function ensureAllowedKeys(
  object:
    Record<
      string,
      unknown
    >,

  allowed:
    readonly string[],
): void {
  const invalid =
    Object.keys(
      object,
    ).filter(
      (
        key,
      ) =>
        !allowed.includes(
          key,
        ),
    );

  if (
    invalid.length >
    0
  ) {
    throw new MerchantSettingsValidationError(
      `Unsupported settings field: ${invalid.join(
        ", ",
      )}.`,
    );
  }
}

function optionalText(
  value:
    unknown,

  field:
    string,

  maxLength:
    number,
): string | undefined {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return undefined;
  }

  if (
    typeof value !==
    "string"
  ) {
    throw new MerchantSettingsValidationError(
      `${field} must be a string.`,
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.length >
    maxLength
  ) {
    throw new MerchantSettingsValidationError(
      `${field} is too long.`,
    );
  }

  return (
    normalized ||
    undefined
  );
}

function booleanValue(
  value:
    unknown,

  field:
    string,
): boolean {
  if (
    typeof value !==
    "boolean"
  ) {
    throw new MerchantSettingsValidationError(
      `${field} must be true or false.`,
    );
  }

  return value;
}

function normalizeEmail(
  value:
    unknown,
): string | undefined {
  const email =
    optionalText(
      value,
      "Support email",
      254,
    );

  if (!email) {
    return undefined;
  }

  const normalized =
    email.toLowerCase();

  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalized,
    );

  if (!valid) {
    throw new MerchantSettingsValidationError(
      "Support email is invalid.",
    );
  }

  return normalized;
}

function normalizeUrl(
  value:
    unknown,

  field:
    string,
): string | undefined {
  const raw =
    optionalText(
      value,
      field,
      2048,
    );

  if (!raw) {
    return undefined;
  }

  let parsed:
    URL;

  try {
    parsed =
      new URL(
        raw,
      );
  } catch {
    throw new MerchantSettingsValidationError(
      `${field} is invalid.`,
    );
  }

  if (
    parsed.protocol !==
      "https:" &&
    parsed.protocol !==
      "http:"
  ) {
    throw new MerchantSettingsValidationError(
      `${field} must use HTTP or HTTPS.`,
    );
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new MerchantSettingsValidationError(
      `${field} cannot contain credentials or a fragment.`,
    );
  }

  return parsed.toString();
}

function normalizeTimezone(
  value:
    unknown,
): string {
  const timezone =
    optionalText(
      value,
      "Timezone",
      100,
    );

  if (!timezone) {
    throw new MerchantSettingsValidationError(
      "Timezone is required.",
    );
  }

  try {
    new Intl.DateTimeFormat(
      "en",
      {
        timeZone:
          timezone,
      },
    ).format();
  } catch {
    throw new MerchantSettingsValidationError(
      "Timezone is not supported.",
    );
  }

  return timezone;
}

function normalizeLocale(
  value:
    unknown,
): string {
  const locale =
    optionalText(
      value,
      "Locale",
      20,
    );

  if (!locale) {
    throw new MerchantSettingsValidationError(
      "Locale is required.",
    );
  }

  if (
    !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(
      locale,
    )
  ) {
    throw new MerchantSettingsValidationError(
      "Locale format is invalid.",
    );
  }

  return locale;
}

function normalizeColor(
  value:
    unknown,
): string {
  const color =
    optionalText(
      value,
      "Checkout accent color",
      7,
    );

  if (
    !color ||
    !/^#[0-9A-Fa-f]{6}$/.test(
      color,
    )
  ) {
    throw new MerchantSettingsValidationError(
      "Checkout accent color must be a valid hex color.",
    );
  }

  return color.toUpperCase();
}

/* =========================================================
   GENERAL
========================================================= */

export function validateGeneralSettings(
  input:
    unknown,
): Partial<
  MerchantGeneralSettings
> {
  const value =
    objectValue(
      input,
    );

  ensureAllowedKeys(
    value,
    [
      "displayName",
      "supportEmail",
      "supportPhone",
      "website",
      "timezone",
      "locale",
    ],
  );

  const result:
    Partial<
      MerchantGeneralSettings
    > = {};

  if (
    "displayName" in
    value
  ) {
    result.displayName =
      optionalText(
        value.displayName,
        "Display name",
        120,
      );
  }

  if (
    "supportEmail" in
    value
  ) {
    result.supportEmail =
      normalizeEmail(
        value.supportEmail,
      );
  }

  if (
    "supportPhone" in
    value
  ) {
    result.supportPhone =
      optionalText(
        value.supportPhone,
        "Support phone",
        30,
      );
  }

  if (
    "website" in
    value
  ) {
    result.website =
      normalizeUrl(
        value.website,
        "Website",
      );
  }

  if (
    "timezone" in
    value
  ) {
    result.timezone =
      normalizeTimezone(
        value.timezone,
      );
  }

  if (
    "locale" in
    value
  ) {
    result.locale =
      normalizeLocale(
        value.locale,
      );
  }

  return result;
}

/* =========================================================
   BUSINESS
========================================================= */

function validateAddress(
  input:
    unknown,
): Partial<
  MerchantBusinessAddress
> {
  const value =
    objectValue(
      input,
    );

  ensureAllowedKeys(
    value,
    [
      "line1",
      "line2",
      "city",
      "state",
      "postalCode",
      "country",
    ],
  );

  const result:
    Partial<
      MerchantBusinessAddress
    > = {};

  const fields = [
    [
      "line1",
      180,
    ],
    [
      "line2",
      180,
    ],
    [
      "city",
      100,
    ],
    [
      "state",
      100,
    ],
    [
      "postalCode",
      40,
    ],
    [
      "country",
      100,
    ],
  ] as const;

  for (
    const [
      key,
      max,
    ] of fields
  ) {
    if (
      key in value
    ) {
      result[
        key
      ] =
        optionalText(
          value[
            key
          ],
          key,
          max,
        );
    }
  }

  return result;
}

export function validateBusinessSettings(
  input:
    unknown,
): Partial<
  MerchantBusinessSettings
> & {
  address?:
    Partial<
      MerchantBusinessAddress
    >;
} {
  const value =
    objectValue(
      input,
    );

  ensureAllowedKeys(
    value,
    [
      "category",
      "publicDescription",
      "address",
    ],
  );

  const result:
    Partial<
      MerchantBusinessSettings
    > & {
      address?:
        Partial<
          MerchantBusinessAddress
        >;
    } = {};

  if (
    "category" in
    value
  ) {
    result.category =
      optionalText(
        value.category,
        "Business category",
        100,
      );
  }

  if (
    "publicDescription" in
    value
  ) {
    result.publicDescription =
      optionalText(
        value.publicDescription,
        "Public description",
        1000,
      );
  }

  if (
    "address" in
    value
  ) {
    result.address =
      validateAddress(
        value.address,
      );
  }

  return result;
}

/* =========================================================
   CHECKOUT
========================================================= */

export function validateCheckoutSettings(
  input:
    unknown,
): Partial<
  MerchantCheckoutSettings
> {
  const value =
    objectValue(
      input,
    );

  ensureAllowedKeys(
    value,
    [
      "defaultExpiryMinutes",
      "collectCustomerName",
      "collectCustomerEmail",
      "defaultReturnUrl",
      "defaultCancelUrl",
      "checkoutNote",
    ],
  );

  const result:
    Partial<
      MerchantCheckoutSettings
    > = {};

  if (
    "defaultExpiryMinutes" in
    value
  ) {
    const parsed =
      Number(
        value.defaultExpiryMinutes,
      );

    if (
      !Number.isInteger(
        parsed,
      ) ||
      parsed <
        5 ||
      parsed >
        1440
    ) {
      throw new MerchantSettingsValidationError(
        "Default checkout expiry must be between 5 and 1440 minutes.",
      );
    }

    result.defaultExpiryMinutes =
      parsed;
  }

  if (
    "collectCustomerName" in
    value
  ) {
    result.collectCustomerName =
      booleanValue(
        value.collectCustomerName,
        "Collect customer name",
      );
  }

  if (
    "collectCustomerEmail" in
    value
  ) {
    result.collectCustomerEmail =
      booleanValue(
        value.collectCustomerEmail,
        "Collect customer email",
      );
  }

  if (
    "defaultReturnUrl" in
    value
  ) {
    result.defaultReturnUrl =
      normalizeUrl(
        value.defaultReturnUrl,
        "Default return URL",
      );
  }

  if (
    "defaultCancelUrl" in
    value
  ) {
    result.defaultCancelUrl =
      normalizeUrl(
        value.defaultCancelUrl,
        "Default cancel URL",
      );
  }

  if (
    "checkoutNote" in
    value
  ) {
    result.checkoutNote =
      optionalText(
        value.checkoutNote,
        "Checkout note",
        500,
      );
  }

  return result;
}

/* =========================================================
   BRANDING
========================================================= */

export function validateBrandingSettings(
  input:
    unknown,
): Partial<
  MerchantBrandingSettings
> {
  const value =
    objectValue(
      input,
    );

  /*
   * logoUrl/logoPublicId are intentionally NOT accepted here.
   * They must be updated only through a dedicated upload flow.
   */
  ensureAllowedKeys(
    value,
    [
      "checkoutDisplayName",
      "checkoutAccentColor",
    ],
  );

  const result:
    Partial<
      MerchantBrandingSettings
    > = {};

  if (
    "checkoutDisplayName" in
    value
  ) {
    result.checkoutDisplayName =
      optionalText(
        value.checkoutDisplayName,
        "Checkout display name",
        120,
      );
  }

  if (
    "checkoutAccentColor" in
    value
  ) {
    result.checkoutAccentColor =
      normalizeColor(
        value.checkoutAccentColor,
      );
  }

  return result;
}

/* =========================================================
   THEME
========================================================= */

export function validateThemeSettings(
  input:
    unknown,
): Partial<
  MerchantThemeSettings
> {
  const value =
    objectValue(
      input,
    );

  ensureAllowedKeys(
    value,
    [
      "mode",
      "accent",
      "density",
      "radius",
      "reducedMotion",
      "compactSidebar",
    ],
  );

  const result:
    Partial<
      MerchantThemeSettings
    > = {};

  if (
    "mode" in
    value
  ) {
    const allowed:
      MerchantThemeMode[] = [
        "light",
        "dark",
        "system",
      ];

    if (
      !allowed.includes(
        value.mode as
          MerchantThemeMode,
      )
    ) {
      throw new MerchantSettingsValidationError(
        "Invalid theme mode.",
      );
    }

    result.mode =
      value.mode as
        MerchantThemeMode;
  }

  if (
    "accent" in
    value
  ) {
    const allowed:
      MerchantThemeAccent[] = [
        "purple",
        "blue",
        "emerald",
        "rose",
        "amber",
      ];

    if (
      !allowed.includes(
        value.accent as
          MerchantThemeAccent,
      )
    ) {
      throw new MerchantSettingsValidationError(
        "Invalid theme accent.",
      );
    }

    result.accent =
      value.accent as
        MerchantThemeAccent;
  }

  if (
    "density" in
    value
  ) {
    const allowed:
      MerchantThemeDensity[] = [
        "comfortable",
        "compact",
      ];

    if (
      !allowed.includes(
        value.density as
          MerchantThemeDensity,
      )
    ) {
      throw new MerchantSettingsValidationError(
        "Invalid interface density.",
      );
    }

    result.density =
      value.density as
        MerchantThemeDensity;
  }

  if (
    "radius" in
    value
  ) {
    const allowed:
      MerchantThemeRadius[] = [
        "soft",
        "rounded",
        "extra-rounded",
      ];

    if (
      !allowed.includes(
        value.radius as
          MerchantThemeRadius,
      )
    ) {
      throw new MerchantSettingsValidationError(
        "Invalid corner style.",
      );
    }

    result.radius =
      value.radius as
        MerchantThemeRadius;
  }

  if (
    "reducedMotion" in
    value
  ) {
    result.reducedMotion =
      booleanValue(
        value.reducedMotion,
        "Reduced motion",
      );
  }

  if (
    "compactSidebar" in
    value
  ) {
    result.compactSidebar =
      booleanValue(
        value.compactSidebar,
        "Compact sidebar",
      );
  }

  return result;
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

export function validateNotificationSettings(
  input:
    unknown,
): Partial<
  MerchantNotificationSettings
> {
  const value =
    objectValue(
      input,
    );

  const keys = [
    "paymentCompleted",
    "paymentFailed",
    "refundCreated",
    "payoutUpdates",
    "securityAlerts",
  ] as const;

  ensureAllowedKeys(
    value,
    keys,
  );

  const result:
    Partial<
      MerchantNotificationSettings
    > = {};

  for (
    const key of
      keys
  ) {
    if (
      key in value
    ) {
      result[
        key
      ] =
        booleanValue(
          value[
            key
          ],
          key,
        );
    }
  }

  return result;
}

/* =========================================================
   SECURITY
========================================================= */

export function validateSecuritySettings(
  input:
    unknown,
): Partial<
  MerchantSecuritySettings
> {
  const value =
    objectValue(
      input,
    );

  const keys = [
    "notifyOnApiKeyCreated",
    "notifyOnApiKeyRotated",
    "notifyOnWebhookSecretRotated",
    "notifyOnPayoutRequest",
  ] as const;

  ensureAllowedKeys(
    value,
    keys,
  );

  const result:
    Partial<
      MerchantSecuritySettings
    > = {};

  for (
    const key of
      keys
  ) {
    if (
      key in value
    ) {
      result[
        key
      ] =
        booleanValue(
          value[
            key
          ],
          key,
        );
    }
  }

  return result;
}