"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailVerificationOtp = exports.sendPasswordResetEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const smtpPort = Number(process.env.SMTP_PORT || 587);
const transporter = nodemailer_1.default.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});
/* =========================================================
   STARTUP DIAGNOSTIC
   ---------------------------------------------------------
   Fails loudly at boot instead of silently at registration
   time. If SMTP_HOST/USER/PASS are missing or wrong, or the
   provider rejects the credentials (very common with Gmail
   when an App Password isn't used), this logs a clear error
   the moment the server starts — not three steps into a
   user's registration flow.
========================================================= */
transporter
    .verify()
    .then(() => {
    console.log("SMTP READY: transporter verified successfully.");
})
    .catch((error) => {
    console.error("SMTP VERIFY FAILED — emails will NOT be delivered until this is fixed:", {
        message: error?.message,
        code: error?.code,
        response: error?.response,
        responseCode: error?.responseCode,
    });
});
/* =========================================================
   PASSWORD RESET
========================================================= */
const sendPasswordResetEmail = async ({ email, resetUrl, }) => {
    const from = process.env.SMTP_USER;
    if (!from) {
        throw new Error("SMTP_USER is not configured.");
    }
    try {
        const info = await transporter.sendMail({
            from: `"Coffer Digital Wallet" <${from}>`,
            to: email,
            subject: "Reset your Coffer password",
            text: `Reset your password using this link: ${resetUrl}`,
            html: `
<!DOCTYPE html>
<html>

<body style="
margin:0;
padding:0;
background:#080719;
font-family:Arial,sans-serif;
">

<div style="
padding:40px 16px;
">

<div style="
max-width:600px;
margin:auto;
background:#101025;
border:1px solid #282647;
border-radius:26px;
overflow:hidden;
">

<div style="
padding:34px;
background:linear-gradient(
135deg,
#17102f,
#271051
);
color:white;
">

<div style="
font-size:20px;
font-weight:800;
">
Coffer
</div>

<h1 style="
margin:18px 0 0;
font-size:28px;
">
Reset your password
</h1>

<p style="
color:#bcb5d7;
font-size:14px;
">
Secure account recovery.
</p>

</div>

<div style="
padding:34px;
color:#b8b3c8;
">

<p style="
line-height:1.8;
">
We received a request to reset your
Coffer Digital Wallet password.
</p>

<a
href="${resetUrl}"
style="
display:inline-block;
margin-top:20px;
padding:14px 24px;
border-radius:12px;
background:#7c3aed;
color:white;
text-decoration:none;
font-weight:700;
"
>
Reset Password
</a>

<p style="
margin-top:24px;
font-size:11px;
color:#77728d;
line-height:1.7;
">
This link expires after 15 minutes.
</p>

</div>

</div>

</div>

</body>
</html>
      `,
        });
        console.log("PASSWORD RESET EMAIL SENT:", {
            to: email,
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            response: info.response,
        });
    }
    catch (error) {
        console.error("PASSWORD RESET EMAIL FAILED:", {
            to: email,
            message: error?.message,
            code: error?.code,
            response: error?.response,
            responseCode: error?.responseCode,
        });
        throw error;
    }
};
exports.sendPasswordResetEmail = sendPasswordResetEmail;
/* =========================================================
   EMAIL VERIFICATION OTP
========================================================= */
const sendEmailVerificationOtp = async ({ email, otp, }) => {
    const from = process.env.SMTP_USER;
    if (!from) {
        throw new Error("SMTP_USER is not configured.");
    }
    try {
        const info = await transporter.sendMail({
            from: `"Coffer Digital Wallet" <${from}>`,
            to: email,
            subject: "Your Coffer verification code",
            text: `Your Coffer verification code is ${otp}. It expires in 10 minutes.`,
            html: `
<!DOCTYPE html>
<html>

<head>
<meta charset="UTF-8">
<meta
name="viewport"
content="width=device-width,initial-scale=1.0"
>
</head>

<body style="
margin:0;
padding:0;
background:#080719;
font-family:Arial,Helvetica,sans-serif;
">

<div style="
padding:40px 16px;
">

<div style="
max-width:640px;
margin:0 auto;
background:#101025;
border:1px solid #29254d;
border-radius:28px;
overflow:hidden;
box-shadow:0 30px 90px rgba(0,0,0,.38);
">

<!-- HEADER -->

<div style="
padding:38px 34px;
background:
radial-gradient(
circle at 15% 10%,
rgba(139,92,246,.35),
transparent 32%
),
linear-gradient(
135deg,
#160e35,
#251157 55%,
#11102e
);
color:white;
">

<div style="
display:inline-block;
padding:13px 16px;
border-radius:15px;
background:linear-gradient(
135deg,
#9b5cff,
#6627db
);
font-weight:800;
font-size:19px;
">
C
</div>

<div style="
margin-top:20px;
font-size:10px;
font-weight:800;
text-transform:uppercase;
letter-spacing:3px;
color:#aaa2c9;
">
Secure onboarding
</div>

<h1 style="
margin:9px 0 0;
font-size:31px;
">
Verify your email
</h1>

<p style="
margin:10px 0 0;
font-size:14px;
line-height:1.7;
color:#c5bfdc;
">
One final step to activate your
Coffer digital wallet.
</p>

</div>

<!-- BODY -->

<div style="
padding:36px;
">

<p style="
margin:0;
font-size:14px;
line-height:1.8;
color:#bcb8cf;
">
Enter the six-digit verification code
below to confirm your email address.
</p>

<!-- OTP -->

<div style="
margin-top:28px;
padding:30px 20px;
border-radius:22px;
text-align:center;
border:1px solid #342e59;
background:#151633;
">

<div style="
font-size:10px;
font-weight:800;
letter-spacing:2px;
text-transform:uppercase;
color:#817c9d;
">
Verification Code
</div>

<div style="
margin-top:18px;
">

<span style="
display:inline-block;
padding:15px 20px 13px;
padding-left:30px;
border-radius:17px;
background:#0c0d20;
border:1px solid #443a73;
font-size:34px;
font-weight:800;
letter-spacing:9px;
color:white;
">
${otp}
</span>

</div>

<p style="
margin:15px 0 0;
font-size:11px;
color:#777393;
">
This code expires in 10 minutes.
</p>

</div>

<!-- SECURITY -->

<div style="
margin-top:22px;
padding:18px;
border-radius:18px;
border:1px solid #282844;
background:#111226;
">

<div style="
font-size:13px;
font-weight:700;
color:#e9e6f3;
">
Protected verification
</div>

<p style="
margin:7px 0 0;
font-size:11px;
line-height:1.7;
color:#817d98;
">
Never share this code with anyone.
Coffer will never ask for your OTP
through chat, phone calls or social media.
</p>

</div>

<p style="
margin-top:25px;
font-size:11px;
line-height:1.7;
color:#6c6881;
">
If you did not create this account,
you can safely ignore this email.
</p>

</div>

<!-- FOOTER -->

<div style="
padding:20px 34px;
border-top:1px solid #252646;
background:#0a0b1c;
text-align:center;
">

<div style="
font-size:11px;
font-weight:700;
color:#d8d4ea;
">
Coffer Digital Wallet
</div>

<div style="
margin-top:5px;
font-size:10px;
color:#68647e;
">
Secure payments • Smarter financial control
</div>

</div>

</div>

</div>

</body>
</html>
      `,
        });
        /*
         * "accepted"/"rejected" tell you what the SMTP server
         * actually did with the recipient address — a message
         * can resolve successfully while still landing in
         * `rejected` for a bad address, which the old code
         * would never have surfaced.
         */
        console.log("OTP EMAIL SENT:", {
            to: email,
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            response: info.response,
        });
        if (info.rejected &&
            info.rejected.length >
                0) {
            throw new Error(`SMTP server rejected the recipient address: ${info.rejected.join(", ")}`);
        }
    }
    catch (error) {
        console.error("OTP EMAIL FAILED:", {
            to: email,
            message: error?.message,
            code: error?.code,
            response: error?.response,
            responseCode: error?.responseCode,
        });
        throw error;
    }
};
exports.sendEmailVerificationOtp = sendEmailVerificationOtp;
