import DescopeClient from "@descope/node-sdk";
import nodemailer, {
  type Transporter,
} from "nodemailer";

/* =========================================================
   TYPES
========================================================= */

export type TwoFactorSmsProvider =
  | "descope"
  | "twilio";

/* =========================================================
   CACHED CLIENTS
========================================================= */

let cachedDescopeClient:
  | ReturnType<typeof DescopeClient>
  | undefined;

let cachedEmailTransporter:
  | Transporter
  | undefined;

/* =========================================================
   SMTP CONFIGURATION
========================================================= */

function getEmailConfiguration() {
  const rawPort =
    Number(
      process.env.SMTP_PORT ||
        "587"
    );

  const port =
    Number.isInteger(rawPort) &&
    rawPort > 0 &&
    rawPort <= 65535
      ? rawPort
      : 587;

  const secureValue =
    process.env.SMTP_SECURE
      ?.trim()
      .toLowerCase();

  const secure =
    secureValue === "true"
      ? true
      : secureValue === "false"
        ? false
        : port === 465;

  const user =
    process.env.SMTP_USER
      ?.trim() || "";

  const configuredFrom =
    process.env.SECURITY_FROM_EMAIL
      ?.trim() || "";

  return {
    host:
      process.env.SMTP_HOST
        ?.trim() || "",

    port,

    secure,

    user,

    pass:
      process.env.SMTP_PASS || "",

    /*
     * If SECURITY_FROM_EMAIL is missing,
     * SMTP_USER will be used automatically.
     */
    from:
      configuredFrom ||
      (user
        ? `Coffer Security <${user}>`
        : ""),
  };
}

/* =========================================================
   SMTP TRANSPORTER
========================================================= */

function getEmailTransporter():
  Transporter {
  const config =
    getEmailConfiguration();

  if (!config.host) {
    throw new Error(
      "SMTP_HOST is not configured."
    );
  }

  if (!config.user) {
    throw new Error(
      "SMTP_USER is not configured."
    );
  }

  if (!config.pass) {
    throw new Error(
      "SMTP_PASS is not configured."
    );
  }

  if (!config.from) {
    throw new Error(
      "SECURITY_FROM_EMAIL is not configured."
    );
  }

  if (!cachedEmailTransporter) {
    cachedEmailTransporter =
      nodemailer.createTransport({
        host:
          config.host,

        port:
          config.port,

        /*
         * Port 465:
         * secure = true
         *
         * Port 587:
         * secure = false and STARTTLS is used.
         */
        secure:
          config.secure,

        /*
         * Require STARTTLS when using
         * the standard submission port.
         */
        requireTLS:
          config.port === 587,

        auth: {
          user:
            config.user,

          pass:
            config.pass,
        },

        connectionTimeout:
          15_000,

        greetingTimeout:
          15_000,

        socketTimeout:
          30_000,
      });
  }

  return cachedEmailTransporter;
}

/* =========================================================
   SMS CONFIGURATION
========================================================= */

function getSmsConfiguration() {
  return {
    accountSid:
      process.env.TWILIO_ACCOUNT_SID
        ?.trim() || "",

    authToken:
      process.env.TWILIO_AUTH_TOKEN ||
      "",

    fromNumber:
      process.env.TWILIO_FROM_NUMBER
        ?.trim() || "",
  };
}

/* =========================================================
   DESCOPE CONFIGURATION
========================================================= */

function getDescopeConfiguration() {
  return {
    enabled:
      process.env.DESCOPE_SMS_ENABLED ===
      "true",

    projectId:
      process.env.DESCOPE_PROJECT_ID
        ?.trim() || "",
  };
}

/* =========================================================
   DESCOPE CLIENT
========================================================= */

function getDescopeClient():
  ReturnType<typeof DescopeClient> {
  const config =
    getDescopeConfiguration();

  if (!config.enabled) {
    throw new Error(
      "Descope SMS 2FA is disabled."
    );
  }

  if (!config.projectId) {
    throw new Error(
      "DESCOPE_PROJECT_ID is not configured."
    );
  }

  if (!cachedDescopeClient) {
    cachedDescopeClient =
      DescopeClient({
        projectId:
          config.projectId,
      });
  }

  return cachedDescopeClient;
}

/* =========================================================
   NORMALIZE PHONE
========================================================= */

function normalizeSmsPhone(
  value: string
): string {
  const compact =
    value
      .replace(
        /[\s()-]/g,
        ""
      )
      .trim();

  if (
    /^01[3-9]\d{8}$/.test(
      compact
    )
  ) {
    return `+88${compact}`;
  }

  if (
    /^8801[3-9]\d{8}$/.test(
      compact
    )
  ) {
    return `+${compact}`;
  }

  return compact;
}

/* =========================================================
   GET SMS PROVIDER
========================================================= */

export function getTwoFactorSmsProvider():
  TwoFactorSmsProvider | null {
  const descope =
    getDescopeConfiguration();

  if (
    descope.enabled &&
    descope.projectId
  ) {
    return "descope";
  }

  const twilio =
    getSmsConfiguration();

  if (
    twilio.accountSid &&
    twilio.authToken &&
    twilio.fromNumber
  ) {
    return "twilio";
  }

  return null;
}

/* =========================================================
   DELIVERY AVAILABILITY
========================================================= */

export function getTwoFactorDeliveryAvailability() {
  const email =
    getEmailConfiguration();

  const emailAvailable =
    Boolean(
      email.host &&
        email.user &&
        email.pass &&
        email.from
    );

  return {
    /*
     * Passkey/authenticator application
     * is disabled in this flow.
     */
    app:
      false,

    email:
      emailAvailable,

    sms:
      Boolean(
        getTwoFactorSmsProvider()
      ),
  };
}

/* =========================================================
   VERIFY SMTP CONFIGURATION

   This can be used by a health check or development script.
   It authenticates without sending an email.
========================================================= */

export async function verifyTwoFactorEmailConfiguration():
  Promise<boolean> {
  try {
    const transporter =
      getEmailTransporter();

    await transporter.verify();

    return true;
  } catch (error) {
    console.error(
      "SMTP configuration verification failed:",
      error instanceof Error
        ? error.message
        : "Unknown SMTP error"
    );

    return false;
  }
}

/* =========================================================
   SEND EMAIL OTP
========================================================= */

export async function sendTwoFactorEmailCode({
  email,
  code,
}: {
  email: string;
  code: string;
}): Promise<void> {
  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedEmail
    )
  ) {
    throw new Error(
      "A valid email address is required."
    );
  }

  if (
    !/^\d{6}$/.test(
      code.trim()
    )
  ) {
    throw new Error(
      "The email verification code must contain 6 digits."
    );
  }

  const config =
    getEmailConfiguration();

  const transporter =
    getEmailTransporter();

  try {
    const result =
      await transporter.sendMail({
        from:
          config.from,

        to:
          normalizedEmail,

        subject:
          "Your Coffer verification code",

        text: [
          "Coffer security verification",
          "",
          `Your verification code is: ${code}`,
          "",
          "This code expires in 5 minutes.",
          "Never share this code with another person.",
          "",
          "If you did not request this code, you can safely ignore this email.",
        ].join("\n"),

        html: `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1"
    />
    <title>Coffer verification code</title>
  </head>

  <body
    style="
      margin: 0;
      padding: 0;
      background: #f3f0fb;
      font-family: Arial, Helvetica, sans-serif;
      color: #20143d;
    "
  >
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="background: #f3f0fb; padding: 32px 16px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="
              max-width: 560px;
              overflow: hidden;
              border: 1px solid #ded5f2;
              border-radius: 24px;
              background: #ffffff;
              box-shadow: 0 18px 50px rgba(40, 20, 80, 0.12);
            "
          >
            <tr>
              <td
                style="
                  padding: 32px;
                  background: linear-gradient(
                    135deg,
                    #160d2e 0%,
                    #352064 55%,
                    #6d28d9 100%
                  );
                  color: #ffffff;
                "
              >
                <p
                  style="
                    margin: 0 0 10px;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.16em;
                    text-transform: uppercase;
                    color: #c4b5fd;
                  "
                >
                  Coffer Security
                </p>

                <h1
                  style="
                    margin: 0;
                    font-size: 28px;
                    line-height: 1.25;
                  "
                >
                  Verify your identity
                </h1>

                <p
                  style="
                    margin: 12px 0 0;
                    font-size: 14px;
                    line-height: 1.7;
                    color: #ddd6fe;
                  "
                >
                  Use the code below to complete your
                  security verification.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding: 34px 32px;">
                <p
                  style="
                    margin: 0 0 12px;
                    text-align: center;
                    font-size: 13px;
                    color: #6b6280;
                  "
                >
                  Your verification code
                </p>

                <div
                  style="
                    margin: 0 auto;
                    padding: 18px 20px;
                    border: 1px solid #ddd6fe;
                    border-radius: 16px;
                    background: #f5f3ff;
                    text-align: center;
                    font-size: 34px;
                    font-weight: 800;
                    letter-spacing: 0.32em;
                    color: #6d28d9;
                  "
                >
                  ${code}
                </div>

                <p
                  style="
                    margin: 22px 0 0;
                    text-align: center;
                    font-size: 13px;
                    line-height: 1.7;
                    color: #6b6280;
                  "
                >
                  This code expires in
                  <strong>5 minutes</strong>.
                  Never share it with another person.
                </p>

                <div
                  style="
                    margin-top: 24px;
                    padding: 14px 16px;
                    border-radius: 14px;
                    background: #fff7ed;
                    font-size: 12px;
                    line-height: 1.7;
                    color: #9a3412;
                  "
                >
                  If you did not request this verification,
                  you can safely ignore this email.
                </div>
              </td>
            </tr>

            <tr>
              <td
                style="
                  padding: 18px 32px;
                  border-top: 1px solid #eee8f7;
                  text-align: center;
                  font-size: 11px;
                  color: #8b829d;
                "
              >
                Coffer Digital Wallet · Automated security message
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
        `.trim(),
      });

    if (
      !result.accepted ||
      result.accepted.length === 0
    ) {
      throw new Error(
        "The SMTP provider did not accept the recipient."
      );
    }
  } catch (error) {
    console.error(
      "Two-factor email delivery failed:",
      error instanceof Error
        ? error.message
        : "Unknown SMTP error"
    );

    throw new Error(
      "Unable to deliver the email verification code."
    );
  }
}

/* =========================================================
   SEND SMS OTP
========================================================= */

export async function sendTwoFactorSmsCode({
  phone,
  code,
  provider,
}: {
  phone: string;
  code: string;
  provider?:
    TwoFactorSmsProvider;
}): Promise<TwoFactorSmsProvider> {
  const normalizedPhone =
    normalizeSmsPhone(phone);

  const selectedProvider =
    provider ||
    getTwoFactorSmsProvider();

  if (!selectedProvider) {
    throw new Error(
      "SMS 2FA provider is not configured."
    );
  }

  /*
   * Descope generates and sends its own OTP.
   * The locally generated `code` is therefore not
   * sent when Descope is selected.
   */
  if (
    selectedProvider ===
    "descope"
  ) {
    const client =
      getDescopeClient();

    const response =
      await client.otp.signUpOrIn.sms(
        normalizedPhone,
        {}
      );

    if (!response.ok) {
      const providerMessage =
        response.error
          ?.errorDescription ||
        response.error
          ?.errorMessage ||
        "Unable to deliver the SMS verification code.";

      throw new Error(
        providerMessage
      );
    }

    return "descope";
  }

  /*
   * Twilio sends the code generated by Coffer.
   */
  const config =
    getSmsConfiguration();

  if (
    !config.accountSid ||
    !config.authToken ||
    !config.fromNumber
  ) {
    throw new Error(
      "Twilio SMS 2FA is not configured."
    );
  }

  const body =
    new URLSearchParams({
      From:
        config.fromNumber,

      To:
        normalizedPhone,

      Body:
        `Coffer verification code: ${code}. Expires in 5 minutes.`,
    });

  const auth =
    Buffer.from(
      `${config.accountSid}:${config.authToken}`
    ).toString("base64");

  const response =
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
        config.accountSid
      )}/Messages.json`,
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Basic ${auth}`,

          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body,
      }
    );

  if (!response.ok) {
    throw new Error(
      "Unable to deliver the SMS verification code."
    );
  }

  return "twilio";
}

/* =========================================================
   VERIFY SMS OTP
========================================================= */

export async function verifyTwoFactorSmsCode({
  phone,
  code,
  provider,
}: {
  phone: string;
  code: string;
  provider:
    TwoFactorSmsProvider;
}): Promise<boolean> {
  /*
   * Twilio Messaging only delivers the locally
   * generated OTP. Its hash must be verified by
   * the calling authentication service.
   */
  if (
    provider !==
    "descope"
  ) {
    return false;
  }

  try {
    const client =
      getDescopeClient();

    const response =
      await client.otp.verify.sms(
        normalizeSmsPhone(
          phone
        ),
        code.trim()
      );

    return response.ok;
  } catch {
    return false;
  }
}