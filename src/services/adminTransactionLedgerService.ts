import {
  AddMoneyTransaction,
} from "../models/AddMoneyTransaction.js";

import {
  Payment,
} from "../models/Payment.js";

import {
  Refund,
} from "../models/Refund.js";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  decryptData,
} from "../utils/crypto.js";

/* =========================================================
   PUBLIC ADMIN LEDGER CONTRACT
========================================================= */

export type AdminLedgerType =
  | "TRANSFER"
  | "DEPOSIT"
  | "WITHDRAW"
  | "PAYMENT"
  | "REFUND";

export type AdminLedgerStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AdminLedgerSource =
  | "WALLET"
  | "ADD_MONEY"
  | "MERCHANT_PAYMENT"
  | "MERCHANT_REFUND";

export type AdminLedgerIntegrity =
  | "VERIFIED"
  | "UNREADABLE";

export interface AdminLedgerParty {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  kind:
    | "USER"
    | "MERCHANT"
    | "PROVIDER"
    | "PLATFORM";
}

export interface AdminLedgerItem {
  _id: string;
  publicId: string;
  senderId:
    AdminLedgerParty;
  receiverId:
    AdminLedgerParty;
  amount:
    number | null;
  currency: string;
  type:
    AdminLedgerType;
  status:
    AdminLedgerStatus;
  source:
    AdminLedgerSource;
  reference?: string;
  description?: string;
  riskScore:
    | "LOW"
    | "MEDIUM"
    | "HIGH";
  integrity:
    AdminLedgerIntegrity;
  mode?:
    | "test"
    | "live";
  provider?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminLedgerResult {
  transactions:
    AdminLedgerItem[];
  integrityWarnings: number;
  sourceCounts:
    Record<AdminLedgerSource, number>;
}

type AnyRecord =
  Record<string, any>;

/* =========================================================
   SAFE CONVERSION HELPERS
========================================================= */

function toIso(
  value: unknown
): string | undefined {
  if (!value) {
    return undefined;
  }

  const date =
    new Date(
      value as string | number | Date
    );

  return Number.isNaN(
    date.getTime()
  )
    ? undefined
    : date.toISOString();
}

function toMoney(
  value: unknown
): number | null {
  try {
    const raw =
      value &&
      typeof value ===
        "object" &&
      "toString" in value
        ? String(value)
        : String(value ?? "");

    const amount =
      Number(raw);

    return Number.isFinite(amount) &&
      amount >= 0
      ? amount
      : null;
  } catch {
    return null;
  }
}

function safeDecrypt(
  value: unknown
): string | undefined {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return undefined;
  }

  const encrypted =
    value as {
      encrypted?: unknown;
      iv?: unknown;
      authTag?: unknown;
    };

  if (
    typeof encrypted.encrypted !==
      "string" ||
    typeof encrypted.iv !==
      "string" ||
    typeof encrypted.authTag !==
      "string"
  ) {
    return undefined;
  }

  try {
    return decryptData({
      encrypted:
        encrypted.encrypted,
      iv:
        encrypted.iv,
      authTag:
        encrypted.authTag,
    });
  } catch {
    /*
     * Legacy rows may have been encrypted with an old key. One unreadable
     * row must never make the complete administrator ledger unavailable.
     */
    return undefined;
  }
}

function walletAmount(
  value: unknown
): number | null {
  const decrypted =
    safeDecrypt(value);

  if (!decrypted) {
    return null;
  }

  const minorUnits =
    Number(decrypted);

  return Number.isSafeInteger(
    minorUnits
  ) &&
    minorUnits >= 0
    ? minorUnits / 100
    : null;
}

function idOf(
  value: unknown,
  fallback: string
): string {
  if (
    value &&
    typeof value === "object" &&
    "_id" in value
  ) {
    return String(
      (value as AnyRecord)._id
    );
  }

  if (value != null) {
    return String(value);
  }

  return fallback;
}

function userParty(
  value: unknown,
  fallbackName = "Unknown user"
): AdminLedgerParty {
  if (
    value &&
    typeof value === "object"
  ) {
    const user =
      value as AnyRecord;

    return {
      _id:
        idOf(
          user,
          "unknown-user"
        ),
      name:
        typeof user.name === "string" &&
        user.name.trim()
          ? user.name.trim()
          : fallbackName,
      email:
        safeDecrypt(
          user.emailEncrypted
        ),
      phone:
        safeDecrypt(
          user.phoneEncrypted
        ),
      kind:
        "USER",
    };
  }

  return {
    _id:
      idOf(
        value,
        "unknown-user"
      ),
    name:
      fallbackName,
    kind:
      "USER",
  };
}

function merchantParty(
  value: unknown
): AdminLedgerParty {
  if (
    value &&
    typeof value === "object"
  ) {
    const merchant =
      value as AnyRecord;

    const name =
      merchant.businessDisplayName ||
      merchant.businessName ||
      "Merchant";

    return {
      _id:
        idOf(
          merchant,
          "merchant"
        ),
      name:
        String(name),
      email:
        typeof merchant.businessEmail ===
          "string"
          ? merchant.businessEmail
          : undefined,
      phone:
        typeof merchant.businessPhone ===
          "string"
          ? merchant.businessPhone
          : undefined,
      kind:
        "MERCHANT",
    };
  }

  return {
    _id:
      idOf(
        value,
        "merchant"
      ),
    name:
      "Merchant",
    kind:
      "MERCHANT",
  };
}

function providerParty(
  provider: unknown,
  providerName: unknown
): AdminLedgerParty {
  const value =
    String(
      providerName ||
      provider ||
      "External provider"
    );

  return {
    _id:
      `provider:${String(
        provider || "external"
      ).toLowerCase()}`,
    name:
      value,
    kind:
      "PROVIDER",
  };
}

function platformParty(
  label: string
): AdminLedgerParty {
  return {
    _id:
      "coffer-platform",
    name:
      label,
    kind:
      "PLATFORM",
  };
}

function normalizedRisk(
  value: unknown
): "LOW" | "MEDIUM" | "HIGH" {
  const risk =
    String(value || "LOW")
      .toUpperCase();

  return risk === "HIGH"
    ? "HIGH"
    : risk === "MEDIUM"
      ? "MEDIUM"
      : "LOW";
}

function normalizedWalletStatus(
  value: unknown
): AdminLedgerStatus {
  const status =
    String(value || "PENDING")
      .toUpperCase();

  return status === "COMPLETED" ||
    status === "SUCCESS" ||
    status === "CAPTURED"
    ? "COMPLETED"
    : status === "FAILED" ||
        status === "EXPIRED"
      ? "FAILED"
      : status === "CANCELLED"
        ? "CANCELLED"
        : "PENDING";
}

function normalizedPaymentStatus(
  value: unknown
): AdminLedgerStatus {
  return normalizedWalletStatus(
    value
  );
}

/* =========================================================
   SOURCE SERIALIZERS
========================================================= */

function serializeWalletTransaction(
  row: AnyRecord
): AdminLedgerItem {
  const amount =
    walletAmount(
      row.amountEncrypted
    );

  const rawType =
    String(
      row.type || "TRANSFER"
    ).toUpperCase();

  const type:
    AdminLedgerType =
    rawType === "DEPOSIT"
      ? "DEPOSIT"
      : rawType === "WITHDRAW"
        ? "WITHDRAW"
        : "TRANSFER";

  const id =
    String(row._id);

  return {
    _id:
      `wallet:${id}`,
    publicId:
      id,
    senderId:
      userParty(
        row.senderId,
        type === "DEPOSIT"
          ? "External funding source"
          : "Unknown sender"
      ),
    receiverId:
      userParty(
        row.receiverId,
        type === "WITHDRAW"
          ? "External destination"
          : "Unknown receiver"
      ),
    amount,
    currency:
      String(
        row.currency || "BDT"
      ).toUpperCase(),
    type,
    status:
      normalizedWalletStatus(
        row.status
      ),
    source:
      "WALLET",
    reference:
      safeDecrypt(
        row.referenceEncrypted
      ),
    description:
      type === "TRANSFER"
        ? "Wallet-to-wallet transfer"
        : type === "DEPOSIT"
          ? "Wallet deposit"
          : "Wallet withdrawal",
    riskScore:
      normalizedRisk(
        row.riskScore
      ),
    integrity:
      amount === null
        ? "UNREADABLE"
        : "VERIFIED",
    createdAt:
      toIso(row.createdAt),
    updatedAt:
      toIso(row.updatedAt),
  };
}

function serializeAddMoney(
  row: AnyRecord
): AdminLedgerItem {
  const amount =
    toMoney(row.amount);

  const id =
    String(row._id);

  return {
    _id:
      `add-money:${id}`,
    publicId:
      String(
        row.providerTransactionId ||
        id
      ),
    senderId:
      providerParty(
        row.provider,
        row.providerName
      ),
    receiverId:
      userParty(
        row.userId,
        "Wallet customer"
      ),
    amount,
    currency:
      String(
        row.currency || "BDT"
      ).toUpperCase(),
    type:
      "DEPOSIT",
    status:
      normalizedWalletStatus(
        row.status
      ),
    source:
      "ADD_MONEY",
    reference:
      typeof row.customerReference ===
        "string"
        ? row.customerReference
        : String(
            row.providerTransactionId ||
            ""
          ) || undefined,
    description:
      `Add money via ${String(
        row.providerName ||
        row.provider ||
        row.sourceType ||
        "provider"
      )}`,
    riskScore:
      "LOW",
    integrity:
      amount === null
        ? "UNREADABLE"
        : "VERIFIED",
    provider:
      String(
        row.provider || ""
      ) || undefined,
    createdAt:
      toIso(
        row.initiatedAt ||
        row.createdAt
      ),
    updatedAt:
      toIso(row.updatedAt),
  };
}

function serializePayment(
  row: AnyRecord
): AdminLedgerItem {
  const amount =
    toMoney(row.amount);

  const id =
    String(row._id);

  return {
    _id:
      `payment:${id}`,
    publicId:
      String(
        row.paymentId || id
      ),
    senderId:
      row.customerId
        ? userParty(
            row.customerId,
            "Checkout customer"
          )
        : platformParty(
            "Guest checkout"
          ),
    receiverId:
      merchantParty(
        row.merchantId
      ),
    amount,
    currency:
      String(
        row.currency || "BDT"
      ).toUpperCase(),
    type:
      "PAYMENT",
    status:
      normalizedPaymentStatus(
        row.status
      ),
    source:
      "MERCHANT_PAYMENT",
    reference:
      typeof row.merchantReference ===
        "string"
        ? row.merchantReference
        : String(
            row.paymentId || ""
          ) || undefined,
    description:
      `${String(
        row.provider ||
        row.sourceType ||
        "Merchant"
      )} payment`,
    riskScore:
      row.failureCode ===
        "risk_blocked"
        ? "HIGH"
        : "LOW",
    integrity:
      amount === null
        ? "UNREADABLE"
        : "VERIFIED",
    mode:
      row.mode === "test"
        ? "test"
        : "live",
    provider:
      typeof row.provider ===
        "string"
        ? row.provider
        : undefined,
    createdAt:
      toIso(row.createdAt),
    updatedAt:
      toIso(row.updatedAt),
  };
}

function serializeRefund(
  row: AnyRecord
): AdminLedgerItem {
  const amount =
    toMoney(row.amount);

  const id =
    String(row._id);

  return {
    _id:
      `refund:${id}`,
    publicId:
      String(
        row.refundId || id
      ),
    senderId:
      merchantParty(
        row.merchantId
      ),
    receiverId:
      userParty(
        row.customerId,
        "Refund customer"
      ),
    amount,
    currency:
      String(
        row.currency || "BDT"
      ).toUpperCase(),
    type:
      "REFUND",
    status:
      normalizedPaymentStatus(
        row.status
      ),
    source:
      "MERCHANT_REFUND",
    reference:
      typeof row.merchantReference ===
        "string"
        ? row.merchantReference
        : String(
            row.refundId ||
            row.paymentReference ||
            ""
          ) || undefined,
    description:
      typeof row.reason === "string" &&
      row.reason.trim()
        ? row.reason.trim()
        : "Merchant payment refund",
    riskScore:
      "LOW",
    integrity:
      amount === null
        ? "UNREADABLE"
        : "VERIFIED",
    mode:
      row.mode === "test"
        ? "test"
        : "live",
    createdAt:
      toIso(row.createdAt),
    updatedAt:
      toIso(row.updatedAt),
  };
}

/* =========================================================
   UNIFIED ADMIN LEDGER
========================================================= */

export async function getAdminTransactionLedger():
  Promise<AdminLedgerResult> {
  const [
    walletRows,
    addMoneyRows,
    paymentRows,
    refundRows,
  ] =
    await Promise.all([
      Transaction.find()
        .populate(
          "senderId",
          "name emailEncrypted phoneEncrypted"
        )
        .populate(
          "receiverId",
          "name emailEncrypted phoneEncrypted"
        )
        .sort({
          createdAt: -1,
        })
        .lean(),

      AddMoneyTransaction.find()
        .populate(
          "userId",
          "name emailEncrypted phoneEncrypted"
        )
        .sort({
          createdAt: -1,
        })
        .lean(),

      Payment.find()
        .populate(
          "customerId",
          "name emailEncrypted phoneEncrypted"
        )
        .populate(
          "merchantId",
          "businessName businessDisplayName businessEmail businessPhone"
        )
        .sort({
          createdAt: -1,
        })
        .lean(),

      Refund.find()
        .populate(
          "customerId",
          "name emailEncrypted phoneEncrypted"
        )
        .populate(
          "merchantId",
          "businessName businessDisplayName businessEmail businessPhone"
        )
        .sort({
          createdAt: -1,
        })
        .lean(),
    ]);

  const transactions = [
    ...(walletRows as unknown as AnyRecord[])
      .map(
        serializeWalletTransaction
      ),
    ...(addMoneyRows as unknown as AnyRecord[])
      .map(
        serializeAddMoney
      ),
    ...(paymentRows as unknown as AnyRecord[])
      .map(
        serializePayment
      ),
    ...(refundRows as unknown as AnyRecord[])
      .map(
        serializeRefund
      ),
  ].sort(
    (left, right) =>
      new Date(
        right.createdAt || 0
      ).getTime() -
      new Date(
        left.createdAt || 0
      ).getTime()
  );

  const sourceCounts:
    Record<AdminLedgerSource, number> = {
      WALLET:
        0,
      ADD_MONEY:
        0,
      MERCHANT_PAYMENT:
        0,
      MERCHANT_REFUND:
        0,
    };

  let integrityWarnings =
    0;

  for (
    const transaction of
      transactions
  ) {
    sourceCounts[
      transaction.source
    ] += 1;

    if (
      transaction.integrity ===
      "UNREADABLE"
    ) {
      integrityWarnings += 1;
    }
  }

  return {
    transactions,
    integrityWarnings,
    sourceCounts,
  };
}
