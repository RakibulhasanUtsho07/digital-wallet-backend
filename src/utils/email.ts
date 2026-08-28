import nodemailer from "nodemailer";

const smtpPort = Number(
  process.env.SMTP_PORT || 587
);

const transporter =
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure:
      smtpPort === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

export const sendPasswordResetEmail =
  async ({
    email,
    resetUrl,
  }: {
    email: string;
    resetUrl: string;
  }): Promise<void> => {
    const from =
      process.env.SMTP_USER;

    if (!from) {
      throw new Error(
        "SMTP_USER is not configured."
      );
    }

    await transporter.sendMail({
      from: `"Digital Wallet System" <${from}>`,
      to: email,
      subject:
        "Reset your Digital Wallet password",
      text: `Reset your password using this link: ${resetUrl}`,
      html: `
        <!DOCTYPE html>
        <html>
          <body
            style="
              margin:0;
              padding:0;
              background:#f4f7fb;
              font-family:Arial,sans-serif;
            "
          >
            <div
              style="
                max-width:600px;
                margin:40px auto;
                background:#ffffff;
                border-radius:24px;
                overflow:hidden;
                border:1px solid #e3eaf1;
              "
            >
              <div
                style="
                  background:#123b66;
                  padding:32px;
                  color:#ffffff;
                "
              >
                <h1
                  style="
                    margin:0;
                    font-size:28px;
                  "
                >
                  Digital Wallet
                </h1>

                <p
                  style="
                    margin:8px 0 0;
                    color:#bcd8ee;
                    font-size:14px;
                  "
                >
                  Secure account recovery
                </p>
              </div>

              <div style="padding:32px">
                <h2
                  style="
                    color:#162a43;
                    margin-top:0;
                  "
                >
                  Reset your password
                </h2>

                <p
                  style="
                    color:#64748b;
                    line-height:1.7;
                  "
                >
                  We received a request to reset
                  your Digital Wallet password.
                  Click the button below to create
                  a new password.
                </p>

                <a
                  href="${resetUrl}"
                  style="
                    display:inline-block;
                    margin-top:20px;
                    padding:14px 24px;
                    border-radius:12px;
                    background:#1f5ea8;
                    color:#ffffff;
                    text-decoration:none;
                    font-weight:600;
                  "
                >
                  Reset Password
                </a>

                <p
                  style="
                    margin-top:24px;
                    color:#94a3b8;
                    font-size:12px;
                    line-height:1.6;
                  "
                >
                  This link will expire after
                  15 minutes. If you did not request
                  a password reset, you can safely
                  ignore this email.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
    });
  };