const getEmailConfiguration = () => ({
  apiKey:
    process.env.RESEND_API_KEY || "",
  from:
    process.env.SECURITY_FROM_EMAIL || "",
});

const getSmsConfiguration = () => ({
  accountSid:
    process.env.TWILIO_ACCOUNT_SID || "",
  authToken:
    process.env.TWILIO_AUTH_TOKEN || "",
  fromNumber:
    process.env.TWILIO_FROM_NUMBER || "",
});

export const getTwoFactorDeliveryAvailability = () => {
  const email =
    getEmailConfiguration();
  const sms =
    getSmsConfiguration();

  return {
    app: true,
    email: Boolean(
      email.apiKey &&
        email.from
    ),
    sms: Boolean(
      sms.accountSid &&
        sms.authToken &&
        sms.fromNumber
    ),
  };
};

export const sendTwoFactorEmailCode =
  async ({
    email,
    code,
  }: {
    email: string;
    code: string;
  }): Promise<void> => {
    const config =
      getEmailConfiguration();

    if (
      !config.apiKey ||
      !config.from
    ) {
      throw new Error(
        "Email 2FA provider is not configured."
      );
    }

    const response =
      await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${config.apiKey}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: [email],
            subject:
              "Your Coffer verification code",
            text:
              `Your Coffer verification code is ${code}. It expires in 5 minutes. If you did not request this, ignore this message.`,
          }),
        }
      );

    if (!response.ok) {
      throw new Error(
        "Unable to deliver the email verification code."
      );
    }
  };

export const sendTwoFactorSmsCode =
  async ({
    phone,
    code,
  }: {
    phone: string;
    code: string;
  }): Promise<void> => {
    const config =
      getSmsConfiguration();

    if (
      !config.accountSid ||
      !config.authToken ||
      !config.fromNumber
    ) {
      throw new Error(
        "SMS 2FA provider is not configured."
      );
    }

    const body =
      new URLSearchParams({
        From: config.fromNumber,
        To: phone,
        Body:
          `Coffer verification code: ${code}. Expires in 5 minutes.`,
      });

    const auth = Buffer.from(
      `${config.accountSid}:${config.authToken}`
    ).toString("base64");

    const response =
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
          config.accountSid
        )}/Messages.json`,
        {
          method: "POST",
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
  };
