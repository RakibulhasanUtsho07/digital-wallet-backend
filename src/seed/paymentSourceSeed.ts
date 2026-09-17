import crypto from "node:crypto";

import {
  PaymentSource,
} from "../models/PaymentSource.js";

import {
  createLookupHash,
} from "../utils/crypto.js";

/* =========================================================
   TYPES
========================================================= */

type DemoProvider =
  | "bkash"
  | "nagad"
  | "rocket"
  | "upay"
  | "dbbl"
  | "brac"
  | "city"
  | "ebl"
  | "bankasia"
  | "prime"
  | "sonali";

type DemoPaymentAccount = {
  provider: DemoProvider;
  accountNumber: string;
  accountName: string;
  secretCode: string;
  balance: number;
  status:
    | "ACTIVE"
    | "BLOCKED"
    | "CLOSED";
  currency: "BDT";
};

/* =========================================================
   SECRET HASH
========================================================= */

const hashSecretCode = (
  value: string
): string => {
  const secret =
    process.env.LOOKUP_HMAC_KEY ||
    process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "LOOKUP_HMAC_KEY or JWT_SECRET is required for payment source seeding."
    );
  }

  return crypto
    .createHmac(
      "sha256",
      secret
    )
    .update(
      value.trim()
    )
    .digest("hex");
};

/* =========================================================
   DEMO ACCOUNTS
========================================================= */

const demoAccounts: DemoPaymentAccount[] = [
  /* =========================
     MFS
  ========================= */

  {
    provider: "bkash",
    accountNumber: "01710000001",
    accountName: "Demo bKash User",
    secretCode: "1234",
    balance: 50000,
    status: "ACTIVE",
    currency: "BDT",
  },

  {
    provider: "nagad",
    accountNumber: "01810000001",
    accountName: "Demo Nagad User",
    secretCode: "1234",
    balance: 30000,
    status: "ACTIVE",
    currency: "BDT",
  },

  {
    provider: "rocket",
    accountNumber: "01910000001",
    accountName: "Demo Rocket User",
    secretCode: "1234",
    balance: 25000,
    status: "ACTIVE",
    currency: "BDT",
  },

  {
    provider: "upay",
    accountNumber: "01610000001",
    accountName: "Demo upay User",
    secretCode: "1234",
    balance: 20000,
    status: "ACTIVE",
    currency: "BDT",
  },

  /* =========================
     BANK
  ========================= */

  {
    provider: "dbbl",
    accountNumber: "1000000001",
    accountName: "Demo DBBL User",
    secretCode: "BANK1234",
    balance: 100000,
    status: "ACTIVE",
    currency: "BDT",
  },

  {
    provider: "brac",
    accountNumber: "2000000001",
    accountName: "Demo BRAC Bank User",
    secretCode: "BANK1234",
    balance: 80000,
    status: "ACTIVE",
    currency: "BDT",
  },

  {
    provider: "city",
    accountNumber: "3000000001",
    accountName: "Demo City Bank User",
    secretCode: "BANK1234",
    balance: 75000,
    status: "ACTIVE",
    currency: "BDT",
  },

  {
    provider: "ebl",
    accountNumber: "4000000001",
    accountName: "Demo EBL User",
    secretCode: "BANK1234",
    balance: 90000,
    status: "ACTIVE",
    currency: "BDT",
  },

  {
    provider: "bankasia",
    accountNumber: "5000000001",
    accountName: "Demo Bank Asia User",
    secretCode: "BANK1234",
    balance: 65000,
    status: "ACTIVE",
    currency: "BDT",
  },

  {
    provider: "prime",
    accountNumber: "6000000001",
    accountName: "Demo Prime Bank User",
    secretCode: "BANK1234",
    balance: 70000,
    status: "ACTIVE",
    currency: "BDT",
  },

  {
    provider: "sonali",
    accountNumber: "7000000001",
    accountName: "Demo Sonali Bank User",
    secretCode: "BANK1234",
    balance: 120000,
    status: "ACTIVE",
    currency: "BDT",
  },
];

/* =========================================================
   SEED
========================================================= */

export const seedPaymentSources =
  async (): Promise<void> => {
    try {
      let createdOrUpdated = 0;

      for (
        const account of demoAccounts
      ) {
        const accountNumber =
          account.accountNumber
            .trim()
            .replace(/\s+/g, "");

        const accountLookup =
          createLookupHash(
            accountNumber
          );

        const secretCodeHash =
          hashSecretCode(
            account.secretCode
          );

        await PaymentSource.updateOne(
          {
            provider:
              account.provider,

            accountLookup,
          },
          {
            $set: {
              provider:
                account.provider,

              accountNumber,

              accountLookup,

              accountName:
                account.accountName,

              secretCodeHash,

              balance:
                account.balance,

              status:
                account.status,

              currency:
                account.currency,
            },
          },
          {
            upsert: true,
          }
        );

        createdOrUpdated++;
      }

      console.log(
        `✅ Payment sources seeded: ${createdOrUpdated}`
      );

      console.log(
        "✅ bKash  : 01710000001 / 1234"
      );

      console.log(
        "✅ Nagad  : 01810000001 / 1234"
      );

      console.log(
        "✅ Rocket : 01910000001 / 1234"
      );

      console.log(
        "✅ upay   : 01610000001 / 1234"
      );

      console.log(
        "✅ Banks  : BANK1234"
      );
    } catch (error) {
      console.error(
        "❌ PAYMENT SOURCE SEED ERROR:",
        error
      );

      throw error;
    }
  };

/* =========================================================
   CLEAR
========================================================= */

export const clearDemoPaymentSources =
  async (): Promise<void> => {
    await PaymentSource.deleteMany({
      accountName: {
        $regex: /^Demo\s/i,
      },
    });

    console.log(
      "✅ Demo payment sources cleared."
    );
  };