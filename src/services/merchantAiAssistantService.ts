/* =========================================================
   COFFER MERCHANT INTEGRATION ASSISTANT

   IMPORTANT:
   - No Gemini
   - No OpenAI
   - No external AI API
   - No paid provider
   - Runs completely inside Coffer backend
========================================================= */

export type MerchantAiRole =
  | "user"
  | "assistant";

export interface MerchantAiMessage {
  role: MerchantAiRole;
  content: string;
}

export interface MerchantAiContext {
  businessName: string;
  merchantStatus: string;
  verificationStatus: string;

  defaultCurrency: string;

  testEnabled: boolean;
  liveEnabled: boolean;

  testKeyConfigured: boolean;
  liveKeyConfigured: boolean;

  testScopes: string[];
  liveScopes: string[];
}

/* =========================================================
   TYPES
========================================================= */

type SupportedFramework =
  | "nextjs"
  | "react-express"
  | "express"
  | "laravel"
  | "django"
  | "php"
  | "unknown";

type AssistantIntent =
  | "integration"
  | "api-key"
  | "test-mode"
  | "live-mode"
  | "webhook"
  | "success-cancel"
  | "401"
  | "403"
  | "404"
  | "429"
  | "500"
  | "cors"
  | "failed-fetch"
  | "checkout-url"
  | "security"
  | "general";

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_MESSAGE_LENGTH =
  6000;

const MAX_HISTORY_MESSAGES =
  12;

/* =========================================================
   SECRET REDACTION
========================================================= */

export function redactAiSecrets(
  value: string
): string {
  return String(
    value || ""
  )
    /*
     * Coffer secret keys
     */
    .replace(
      /\bsk_(?:test|live)_[A-Za-z0-9_-]+\b/g,
      "[REDACTED_COFFER_SECRET]"
    )

    /*
     * Bearer tokens
     */
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
      "Bearer [REDACTED_TOKEN]"
    )

    /*
     * JWT
     */
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED_JWT]"
    )

    /*
     * MongoDB URLs
     */
    .replace(
      /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi,
      "[REDACTED_MONGODB_URI]"
    )

    /*
     * Google keys
     */
    .replace(
      /\bAIza[A-Za-z0-9_-]{20,}\b/g,
      "[REDACTED_GOOGLE_API_KEY]"
    )

    /*
     * Common environment secrets
     */
    .replace(
      /\b(?:GEMINI_API_KEY|OPENAI_API_KEY|JWT_SECRET|CHECKOUT_TOKEN_SECRET|LOOKUP_HMAC_KEY)\s*=\s*[^\s]+/gi,
      (
        match
      ) => {
        const name =
          match.split(
            "="
          )[0];

        return `${name}=[REDACTED_SECRET]`;
      }
    );
}

/* =========================================================
   NORMALIZE HISTORY
========================================================= */

function normalizeHistory(
  history:
    MerchantAiMessage[]
): MerchantAiMessage[] {
  return history
    .slice(
      -MAX_HISTORY_MESSAGES
    )
    .map(
      (
        item
      ) => ({
        role:
          item.role,

        content:
          redactAiSecrets(
            item.content
          )
            .trim()
            .slice(
              0,
              MAX_MESSAGE_LENGTH
            ),
      })
    )
    .filter(
      (
        item
      ) =>
        Boolean(
          item.content
        )
    );
}

/* =========================================================
   LANGUAGE
========================================================= */

function containsBangla(
  value: string
): boolean {
  return /[\u0980-\u09FF]/.test(
    value
  );
}

/* =========================================================
   API BASE
========================================================= */

function getApiBase(): string {
  return (
    process.env
      .COFFER_PUBLIC_API_URL
      ?.trim() ||
    "https://digital-wallet-backend-five.vercel.app/api/v1"
  );
}

/* =========================================================
   DETECT FRAMEWORK
========================================================= */

function detectFramework(
  text: string
): SupportedFramework {
  const value =
    text.toLowerCase();

  if (
    value.includes(
      "next.js"
    ) ||
    value.includes(
      "nextjs"
    ) ||
    value.includes(
      "app router"
    )
  ) {
    return "nextjs";
  }

  if (
    value.includes(
      "react"
    ) &&
    value.includes(
      "express"
    )
  ) {
    return "react-express";
  }

  if (
    value.includes(
      "express"
    ) ||
    value.includes(
      "node.js"
    ) ||
    value.includes(
      "nodejs"
    )
  ) {
    return "express";
  }

  if (
    value.includes(
      "laravel"
    )
  ) {
    return "laravel";
  }

  if (
    value.includes(
      "django"
    )
  ) {
    return "django";
  }

  if (
    value.includes(
      "php"
    )
  ) {
    return "php";
  }

  return "unknown";
}

/* =========================================================
   DETECT INTENT
========================================================= */

function detectIntent(
  text: string
): AssistantIntent {
  const value =
    text.toLowerCase();

  if (
    value.includes(
      "401"
    ) ||
    value.includes(
      "unauthorized"
    )
  ) {
    return "401";
  }

  if (
    value.includes(
      "403"
    ) ||
    value.includes(
      "forbidden"
    )
  ) {
    return "403";
  }

  if (
    value.includes(
      "404"
    ) ||
    value.includes(
      "not found"
    )
  ) {
    return "404";
  }

  if (
    value.includes(
      "429"
    ) ||
    value.includes(
      "too many requests"
    ) ||
    value.includes(
      "rate limit"
    )
  ) {
    return "429";
  }

  if (
    value.includes(
      "500"
    ) ||
    value.includes(
      "internal server error"
    )
  ) {
    return "500";
  }

  if (
    value.includes(
      "cors"
    )
  ) {
    return "cors";
  }

  if (
    value.includes(
      "failed to fetch"
    ) ||
    value.includes(
      "network error"
    ) ||
    value.includes(
      "unable to connect"
    )
  ) {
    return "failed-fetch";
  }

  if (
    value.includes(
      "webhook"
    )
  ) {
    return "webhook";
  }

  if (
    value.includes(
      "success page"
    ) ||
    value.includes(
      "cancel page"
    ) ||
    value.includes(
      "returnurl"
    ) ||
    value.includes(
      "cancelurl"
    )
  ) {
    return "success-cancel";
  }

  if (
    value.includes(
      "api key"
    ) ||
    value.includes(
      "secret key"
    ) ||
    value.includes(
      "sk_test"
    ) ||
    value.includes(
      "sk_live"
    )
  ) {
    return "api-key";
  }

  if (
    value.includes(
      "test mode"
    ) ||
    value.includes(
      "sandbox"
    )
  ) {
    return "test-mode";
  }

  if (
    value.includes(
      "live mode"
    ) ||
    value.includes(
      "go live"
    ) ||
    value.includes(
      "production payment"
    )
  ) {
    return "live-mode";
  }

  if (
    value.includes(
      "checkouturl"
    ) ||
    value.includes(
      "checkout url"
    )
  ) {
    return "checkout-url";
  }

  if (
    value.includes(
      "security"
    ) ||
    value.includes(
      "secure"
    )
  ) {
    return "security";
  }

  if (
    value.includes(
      "integrate"
    ) ||
    value.includes(
      "integration"
    ) ||
    value.includes(
      "install"
    ) ||
    value.includes(
      "setup"
    ) ||
    value.includes(
      "connect"
    ) ||
    value.includes(
      "payment gateway"
    )
  ) {
    return "integration";
  }

  return "general";
}

/* =========================================================
   CONVERSATION TEXT
========================================================= */

function buildConversationText(
  message: string,
  history:
    MerchantAiMessage[]
): string {
  return [
    ...history.map(
      (
        item
      ) =>
        item.content
    ),

    message,
  ].join(
    "\n"
  );
}

/* =========================================================
   MERCHANT STATUS
========================================================= */

function merchantStatusBlock(
  context:
    MerchantAiContext
): string {
  return `
### Your Coffer account

- Business: **${context.businessName}**
- Merchant status: **${context.merchantStatus}**
- Verification: **${context.verificationStatus}**
- Default currency: **${context.defaultCurrency}**
- Test payments: **${context.testEnabled ? "Enabled" : "Disabled"}**
- Live payments: **${context.liveEnabled ? "Enabled" : "Disabled"}**
- Test API key: **${context.testKeyConfigured ? "Configured" : "Not configured"}**
- Live API key: **${context.liveKeyConfigured ? "Configured" : "Not configured"}**
- Test scopes: **${context.testScopes.join(", ") || "none"}**
- Live scopes: **${context.liveScopes.join(", ") || "none"}**
`.trim();
}

/* =========================================================
   ENV TEMPLATE
========================================================= */

function envTemplate(): string {
  const apiBase =
    getApiBase();

  return `
\`\`\`env
COFFER_API_URL=${apiBase}
COFFER_SECRET_KEY=YOUR_COFFER_SECRET_KEY
APP_URL=https://your-domain.com
\`\`\`

For test payments use an \`sk_test_...\` key.

For live payments use an \`sk_live_...\` key.

Never create:

\`\`\`env
NEXT_PUBLIC_COFFER_SECRET_KEY=...
\`\`\`

The secret key must remain server-side.
`.trim();
}

/* =========================================================
   NEXT.JS INTEGRATION
========================================================= */

function nextJsIntegration(): string {
  const apiBase =
    getApiBase();

  return `
## Coffer + Next.js App Router integration

Use this flow:

\`\`\`text
Browser
→ Your Next.js server route
→ Coffer API
→ checkoutUrl
→ Browser redirects to Coffer
\`\`\`

### 1. Environment variables

**PATH**

\`\`\`text
.env.local
\`\`\`

${envTemplate()}

Restart Next.js after changing environment variables.

---

### 2. Create the secure checkout API route

**PATH**

\`\`\`text
src/app/api/coffer/checkout/route.ts
\`\`\`

\`\`\`ts
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  randomUUID,
} from "crypto";

export async function POST(
  request: NextRequest
) {
  try {
    const apiUrl =
      process.env.COFFER_API_URL;

    const secretKey =
      process.env.COFFER_SECRET_KEY;

    const appUrl =
      process.env.APP_URL;

    if (
      !apiUrl ||
      !secretKey ||
      !appUrl
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Coffer server configuration is missing.",
        },
        {
          status: 500,
        }
      );
    }

    const body =
      await request.json();

    const amount =
      Number(
        body.amount
      );

    const merchantReference =
      String(
        body.merchantReference ||
        ""
      ).trim();

    if (
      !Number.isFinite(
        amount
      ) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid payment amount.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !merchantReference
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Merchant reference is required.",
        },
        {
          status: 400,
        }
      );
    }

    const response =
      await fetch(
        \`\${apiUrl}/payments\`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              \`Bearer \${secretKey}\`,

            "Idempotency-Key":
              randomUUID(),
          },

          body:
            JSON.stringify({
              amount,
              currency:
                "BDT",

              merchantReference,

              returnUrl:
                \`\${appUrl}/payment/success?reference=\${encodeURIComponent(
                  merchantReference
                )}\`,

              cancelUrl:
                \`\${appUrl}/payment/cancel?reference=\${encodeURIComponent(
                  merchantReference
                )}\`,
            }),

          cache:
            "no-store",
        }
      );

    const data =
      await response.json();

    if (
      !response.ok
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            data.message ||
            "Unable to create Coffer payment.",
        },
        {
          status:
            response.status,
        }
      );
    }

    const payment =
      data.payment;

    if (
      !payment?.id ||
      !payment?.checkoutUrl
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Coffer returned an invalid payment response.",
        },
        {
          status: 502,
        }
      );
    }

    return NextResponse.json({
      success: true,

      paymentId:
        payment.id,

      checkoutUrl:
        payment.checkoutUrl,
    });
  } catch (
    error
  ) {
    console.error(
      "COFFER CHECKOUT ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to create payment.",
      },
      {
        status: 500,
      }
    );
  }
}
\`\`\`

Coffer API being called:

\`\`\`text
POST ${apiBase}/payments
\`\`\`

---

### 3. Checkout button

Your browser should call your own Next.js API route.

\`\`\`tsx
"use client";

import {
  useState,
} from "react";

export default function PayButton() {
  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const handlePayment =
    async () => {
      try {
        setLoading(
          true
        );

        const response =
          await fetch(
            "/api/coffer/checkout",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  amount:
                    10500,

                  merchantReference:
                    "ORDER-123",
                }),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            data.message ||
            "Payment creation failed."
          );
        }

        window.location.assign(
          data.checkoutUrl
        );
      } catch (
        error
      ) {
        alert(
          error instanceof Error
            ? error.message
            : "Unable to start payment."
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  return (
    <button
      type="button"
      disabled={
        loading
      }
      onClick={
        handlePayment
      }
    >
      {loading
        ? "Redirecting..."
        : "Pay with Coffer"}
    </button>
  );
}
\`\`\`

**Production note:** do not trust an arbitrary amount sent by the browser. If you already have an order in your database, load the order server-side and calculate/verify the final amount there.

---

### 4. Success page

**PATH**

\`\`\`text
src/app/payment/success/page.tsx
\`\`\`

Do not mark an order as paid only because this page was opened.

The success page is only the customer-facing return destination.

---

### 5. Cancel page

**PATH**

\`\`\`text
src/app/payment/cancel/page.tsx
\`\`\`

Use it to tell the customer the checkout was cancelled.

---

### 6. Important

Always redirect using the \`payment.checkoutUrl\` returned by Coffer.

Do **not** manually construct a Coffer hosted checkout URL.
`.trim();
}

/* =========================================================
   EXPRESS INTEGRATION
========================================================= */

function expressIntegration(): string {
  return `
## Node.js / Express integration

Architecture:

\`\`\`text
React/browser
→ POST /api/coffer/checkout
→ Express backend
→ Coffer POST /payments
→ checkoutUrl
→ browser redirect
\`\`\`

### Environment

${envTemplate()}

### Server route

**PATH**

\`\`\`text
src/routes/cofferRoutes.ts
\`\`\`

The route must read \`COFFER_SECRET_KEY\` from the server environment and call:

\`\`\`text
POST ${getApiBase()}/payments
\`\`\`

Required request headers:

\`\`\`text
Content-Type: application/json
Authorization: Bearer COFFER_SECRET_KEY
Idempotency-Key: UNIQUE_VALUE
\`\`\`

Never send the Coffer secret key from React.

If you provide your current Express folder structure, I can tell you the exact route/controller paths to use.
`.trim();
}

/* =========================================================
   LARAVEL
========================================================= */

function laravelIntegration(): string {
  return `
## Laravel integration

Recommended architecture:

\`\`\`text
Blade/Vue/React frontend
→ Laravel controller
→ Coffer API
→ checkoutUrl
→ customer redirect
\`\`\`

### .env

\`\`\`env
COFFER_API_URL=${getApiBase()}
COFFER_SECRET_KEY=YOUR_COFFER_SECRET_KEY
APP_URL=https://your-domain.com
\`\`\`

Store the secret only in Laravel's server environment.

Recommended files:

\`\`\`text
routes/web.php
app/Http/Controllers/CofferPaymentController.php
resources/views/payment/success.blade.php
resources/views/payment/cancel.blade.php
\`\`\`

Use Laravel's server-side HTTP client to call:

\`\`\`text
POST ${getApiBase()}/payments
\`\`\`

with Bearer authentication.

Never expose \`COFFER_SECRET_KEY\` in Blade JavaScript or frontend bundles.
`.trim();
}

/* =========================================================
   DJANGO
========================================================= */

function djangoIntegration(): string {
  return `
## Django integration

Recommended flow:

\`\`\`text
Browser
→ Django payment view
→ Coffer API
→ checkoutUrl
→ redirect customer
\`\`\`

Recommended structure:

\`\`\`text
payments/
  views.py
  urls.py

templates/
  payment/
    success.html
    cancel.html
\`\`\`

Environment:

\`\`\`env
COFFER_API_URL=${getApiBase()}
COFFER_SECRET_KEY=YOUR_COFFER_SECRET_KEY
APP_URL=https://your-domain.com
\`\`\`

Read the secret only on the Django server.

Call:

\`\`\`text
POST ${getApiBase()}/payments
\`\`\`

and redirect the customer to the returned \`payment.checkoutUrl\`.
`.trim();
}

/* =========================================================
   API KEY HELP
========================================================= */

function apiKeyHelp(
  context:
    MerchantAiContext
): string {
  return `
## Coffer API keys

Coffer has two payment environments:

\`\`\`text
sk_test_...  → sandbox / development
sk_live_...  → live payments
\`\`\`

Your current merchant account:

- Test key configured: **${context.testKeyConfigured ? "Yes" : "No"}**
- Live key configured: **${context.liveKeyConfigured ? "Yes" : "No"}**
- Test enabled: **${context.testEnabled ? "Yes" : "No"}**
- Live enabled: **${context.liveEnabled ? "Yes" : "No"}**

Secret keys belong only in your backend environment.

Example:

${envTemplate()}

For creating payments your key needs the \`payments:write\` scope.

Never paste a real secret key into this chat.
`.trim();
}

/* =========================================================
   TEST MODE
========================================================= */

function testModeHelp(
  context:
    MerchantAiContext
): string {
  return `
## Coffer test mode

Use an:

\`\`\`text
sk_test_...
\`\`\`

key.

Current status:

- Test payments: **${context.testEnabled ? "Enabled" : "Disabled"}**
- Test key: **${context.testKeyConfigured ? "Configured" : "Missing"}**
- Test scopes: **${context.testScopes.join(", ") || "none"}**

For payment creation ensure the key includes:

\`\`\`text
payments:write
\`\`\`

Test payments must never debit a real wallet or represent real money.

After creating a test payment, redirect the browser using the returned:

\`\`\`text
payment.checkoutUrl
\`\`\`
`.trim();
}

/* =========================================================
   LIVE MODE
========================================================= */

function liveModeHelp(
  context:
    MerchantAiContext
): string {
  return `
## Moving Coffer to live mode

Current account:

- Merchant status: **${context.merchantStatus}**
- Verification: **${context.verificationStatus}**
- Live payments: **${context.liveEnabled ? "Enabled" : "Disabled"}**
- Live key configured: **${context.liveKeyConfigured ? "Yes" : "No"}**

For live payments use:

\`\`\`text
sk_live_...
\`\`\`

The key remains server-side.

When your integration is designed correctly, moving from test → live should mainly require changing the server environment variable:

\`\`\`env
COFFER_SECRET_KEY=YOUR_LIVE_SECRET_KEY
\`\`\`

Then redeploy/restart the merchant backend.

Do not change frontend code just to expose a live key.
`.trim();
}

/* =========================================================
   WEBHOOK HELP
========================================================= */

function webhookHelp(): string {
  return `
## Coffer webhooks

Webhooks should be received by a **server-side endpoint**, never a client component.

Recommended concept:

\`\`\`text
Coffer
→ POST merchant webhook endpoint
→ verify event/signature
→ locate merchant order
→ check idempotency
→ update order/payment status
→ return 2xx
\`\`\`

Do not mark an order paid only from the browser return URL.

I will not invent a webhook signature header or verification algorithm.

To generate exact webhook verification code, provide the Coffer webhook documentation/configuration shown in your Developer → Webhooks section.
`.trim();
}

/* =========================================================
   SUCCESS / CANCEL
========================================================= */

function successCancelHelp(): string {
  return `
## Return and cancel URLs

When creating a Coffer payment send both:

\`\`\`json
{
  "returnUrl": "https://your-domain.com/payment/success?reference=ORDER-123",
  "cancelUrl": "https://your-domain.com/payment/cancel?reference=ORDER-123"
}
\`\`\`

### returnUrl

Used to send the customer back after payment flow.

Do **not** treat visiting this URL as definitive proof that money was received.

### cancelUrl

Used when the customer cancels or leaves the payment flow.

Your merchant reference should identify your internal order/payment record.
`.trim();
}

/* =========================================================
   TROUBLESHOOTING
========================================================= */

function troubleshoot(
  intent:
    AssistantIntent
): string {
  switch (
    intent
  ) {
    case "401":
      return `
## 401 Unauthorized

Check:

1. \`Authorization: Bearer COFFER_SECRET_KEY\` is being sent from your server.
2. The key exists in your server environment.
3. You are not using a frontend \`NEXT_PUBLIC_\` secret.
4. The key has not been revoked.
5. Your backend was restarted/redeployed after changing environment variables.

Never send your real key here.
`.trim();

    case "403":
      return `
## 403 Forbidden

Common Coffer causes:

- Merchant environment is not allowed.
- Required API scope is missing.
- \`payments:write\` is missing for payment creation.
- Live mode is disabled.
- Merchant verification requirements are incomplete.

Check your Developer → API Keys configuration and merchant verification status.
`.trim();

    case "404":
      return `
## 404 Not Found

Check the final request URL.

Payment creation should target:

\`\`\`text
${getApiBase()}/payments
\`\`\`

Avoid accidentally producing paths such as:

\`\`\`text
/api/api/v1/payments
/api/v1/v1/payments
\`\`\`

Also verify that the returned \`checkoutUrl\` is used directly instead of manually constructing a hosted checkout URL.
`.trim();

    case "429":
      return `
## 429 Too Many Requests

Your integration has reached a rate limit.

Check:

- repeated payment creation loops
- duplicate button clicks
- frontend retries
- server retry logic
- idempotency implementation

Disable the Pay button while payment creation is in progress and use a unique \`Idempotency-Key\`.
`.trim();

    case "500":
      return `
## 500 Internal Server Error

Inspect your merchant backend logs first.

Check:

- missing environment variables
- invalid request body
- failed Coffer API parsing
- database errors
- unexpected exceptions

Log safe error metadata, but never log the full Coffer secret key.
`.trim();

    case "cors":
      return `
## CORS problem

Your browser should normally call **your own backend**, not Coffer directly with a secret key.

Correct:

\`\`\`text
Browser
→ Merchant backend
→ Coffer
\`\`\`

If the browser is directly calling Coffer with \`COFFER_SECRET_KEY\`, redesign the integration immediately because the secret is exposed.
`.trim();

    case "failed-fetch":
      return `
## Failed to fetch / unable to connect

Check in this order:

1. Browser Network tab → Request URL.
2. Is the merchant backend reachable?
3. Does the backend endpoint return JSON?
4. Is HTTPS configured correctly?
5. Is CORS blocking the browser?
6. Is your \`COFFER_API_URL\` correct?
7. Can the merchant backend itself reach Coffer?

If you provide the Request URL + status/error text, I can map it to the next debugging step.
`.trim();

    default:
      return `
I need the HTTP status code and error message to diagnose the integration.

Please provide only safe information such as:

\`\`\`text
Request URL
HTTP status
error message
request method
\`\`\`

Do not provide API keys or tokens.
`.trim();
  }
}

/* =========================================================
   CHECKOUT URL
========================================================= */

function checkoutUrlHelp(): string {
  return `
## Coffer checkout URL

After:

\`\`\`text
POST ${getApiBase()}/payments
\`\`\`

Coffer returns payment information containing:

\`\`\`text
payment.id
payment.checkoutUrl
\`\`\`

Redirect the customer with the returned value:

\`\`\`js
window.location.assign(
  payment.checkoutUrl
);
\`\`\`

Never manually build:

\`\`\`text
/payment/checkout/PAYMENT_ID
\`\`\`

unless the Coffer API explicitly returned that URL.
`.trim();
}

/* =========================================================
   SECURITY
========================================================= */

function securityHelp(): string {
  return `
## Coffer integration security

Follow these rules:

- Keep \`COFFER_SECRET_KEY\` server-side.
- Never use \`NEXT_PUBLIC_COFFER_SECRET_KEY\`.
- Never store secret keys in localStorage.
- Never commit \`.env\` secrets to GitHub.
- Use HTTPS in production.
- Verify payment amount server-side.
- Use unique merchant references.
- Use idempotency keys.
- Never trust a return URL alone as proof of payment.
- Redact secrets from logs.
`.trim();
}

/* =========================================================
   GENERAL HELP
========================================================= */

function generalHelp(
  framework:
    SupportedFramework,
  context:
    MerchantAiContext,
  bangla:
    boolean
): string {
  if (
    bangla
  ) {
    return `
আমি Coffer Integration Assistant।

আমি তোমাকে এই বিষয়গুলোতে সাহায্য করতে পারি:

- Next.js / React / Express / Laravel / Django integration
- exact file path
- payment create করা
- API key setup
- Test → Live migration
- checkout redirect
- success/cancel page
- webhook setup
- 401 / 403 / 404 / 429 / 500
- CORS / Failed to fetch debugging

${merchantStatusBlock(
      context
    )}

তোমার website কোন framework ব্যবহার করে সেটা লিখো।

উদাহরণ:

\`\`\`text
My website uses Next.js App Router and TypeScript.
Show me the full Coffer integration.
\`\`\`
`.trim();
  }

  return `
I'm your Coffer Integration Assistant.

I can help with:

- Next.js / React / Express / Laravel / Django
- exact integration file paths
- payment creation
- API key setup
- test → live migration
- checkout redirects
- success/cancel pages
- webhook setup
- 401 / 403 / 404 / 429 / 500
- CORS and Failed to fetch debugging

${merchantStatusBlock(
    context
  )}

Detected framework: **${framework === "unknown" ? "not provided yet" : framework}**

Tell me your website framework and I will generate the Coffer integration structure.
`.trim();
}

/* =========================================================
   INTEGRATION ROUTER
========================================================= */

function integrationHelp(
  framework:
    SupportedFramework
): string {
  switch (
    framework
  ) {
    case "nextjs":
      return nextJsIntegration();

    case "react-express":
    case "express":
      return expressIntegration();

    case "laravel":
      return laravelIntegration();

    case "django":
      return djangoIntegration();

    case "php":
      return `
## PHP integration

Keep the Coffer secret key on the PHP server.

Environment/config:

${envTemplate()}

Your PHP server should call:

\`\`\`text
POST ${getApiBase()}/payments
\`\`\`

Then redirect the customer to the returned \`payment.checkoutUrl\`.

If you tell me whether you're using plain PHP or a framework, I can give the exact file structure.
`.trim();

    default:
      return `
## Let's integrate Coffer

First tell me your merchant website stack.

For example:

\`\`\`text
Next.js 16 App Router + TypeScript
\`\`\`

or:

\`\`\`text
React frontend + Express backend
\`\`\`

or:

\`\`\`text
Laravel
\`\`\`

The secure architecture will always be:

\`\`\`text
Customer
→ Merchant website
→ Merchant server
→ Coffer POST /payments
→ checkoutUrl
→ Coffer hosted checkout
\`\`\`

${envTemplate()}
`.trim();
  }
}

/* =========================================================
   ASK LOCAL ASSISTANT
========================================================= */

export async function askMerchantAi(
  input: {
    message: string;
    history?:
      MerchantAiMessage[];
    context:
      MerchantAiContext;
  }
): Promise<{
  answer: string;
  model: string;
}> {
  const cleanMessage =
    redactAiSecrets(
      input.message
    )
      .trim()
      .slice(
        0,
        MAX_MESSAGE_LENGTH
      );

  if (
    !cleanMessage
  ) {
    throw new Error(
      "Please enter a message."
    );
  }

  const history =
    normalizeHistory(
      input.history ||
      []
    );

  const conversation =
    buildConversationText(
      cleanMessage,
      history
    );

  const framework =
    detectFramework(
      conversation
    );

  const intent =
    detectIntent(
      cleanMessage
    );

  const bangla =
    containsBangla(
      cleanMessage
    );

  let answer:
    string;

  switch (
    intent
  ) {
    case "integration":
      answer =
        integrationHelp(
          framework
        );
      break;

    case "api-key":
      answer =
        apiKeyHelp(
          input.context
        );
      break;

    case "test-mode":
      answer =
        testModeHelp(
          input.context
        );
      break;

    case "live-mode":
      answer =
        liveModeHelp(
          input.context
        );
      break;

    case "webhook":
      answer =
        webhookHelp();
      break;

    case "success-cancel":
      answer =
        successCancelHelp();
      break;

    case "checkout-url":
      answer =
        checkoutUrlHelp();
      break;

    case "security":
      answer =
        securityHelp();
      break;

    case "401":
    case "403":
    case "404":
    case "429":
    case "500":
    case "cors":
    case "failed-fetch":
      answer =
        troubleshoot(
          intent
        );
      break;

    default:
      answer =
        generalHelp(
          framework,
          input.context,
          bangla
        );
      break;
  }

  return {
    answer:
      redactAiSecrets(
        answer
      ),

    model:
      "coffer-integration-engine-v1",
  };
}