import { Response } from "express";

import {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  decryptData,
} from "../utils/crypto.js";

/* =========================================================
   TYPES
========================================================= */

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

interface SafeTransactionUser {
  _id: string;
  name: string;
  email: string;
  phone: string;
}

interface TransactionLike {
  _id?: unknown;
  senderId?: unknown;
  receiverId?: unknown;
  amountEncrypted?: unknown;
  currency?: unknown;
  type?: unknown;
  status?: unknown;
  reference?: unknown;
  riskScore?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/* =========================================================
   SAFE DECRYPT
========================================================= */

function safeDecrypt(
  value: unknown
): string {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return "";
  }

  const encrypted =
    value as Partial<EncryptedValue>;

  if (
    typeof encrypted.encrypted !== "string" ||
    typeof encrypted.iv !== "string" ||
    typeof encrypted.authTag !== "string"
  ) {
    return "";
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
  } catch (error) {
    console.error(
      "TRANSACTION DATA DECRYPT ERROR:",
      error
    );

    return "";
  }
}

/* =========================================================
   TRANSACTION AMOUNT
========================================================= */

function getTransactionAmount(
  transaction: TransactionLike
): number {
  const encryptedAmount =
    safeDecrypt(
      transaction.amountEncrypted
    );

  if (!encryptedAmount) {
    throw new Error(
      "Encrypted transaction amount is missing or invalid."
    );
  }

  const minorUnits =
    Number(
      encryptedAmount
    );

  if (
    !Number.isSafeInteger(
      minorUnits
    ) ||
    minorUnits < 0
  ) {
    throw new Error(
      "Invalid decrypted transaction amount."
    );
  }

  return (
    minorUnits /
    100
  );
}
/* =========================================================
   SAFE POPULATED USER
========================================================= */

function getSafeUser(
  value: unknown
): SafeTransactionUser | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const user =
    value as {
      _id?: unknown;
      name?: unknown;
      emailEncrypted?: unknown;
      phoneEncrypted?: unknown;
    };

  if (user._id == null) {
    return null;
  }

  return {
    _id:
      String(
        user._id
      ),

    name:
      typeof user.name === "string"
        ? user.name
        : "",

    email:
      safeDecrypt(
        user.emailEncrypted
      ),

    phone:
      safeDecrypt(
        user.phoneEncrypted
      ),
  };
}

/* =========================================================
   SAFE TRANSACTION RESPONSE
========================================================= */

function toSafeTransaction(
  transaction: TransactionLike
) {
  return {
    _id:
      transaction._id != null
        ? String(
            transaction._id
          )
        : "",

    senderId:
      getSafeUser(
        transaction.senderId
      ) ||
      getPopulatedUserId(
        transaction.senderId
      ),

    receiverId:
      getSafeUser(
        transaction.receiverId
      ) ||
      getPopulatedUserId(
        transaction.receiverId
      ),

    amount:
      getTransactionAmount(
        transaction
      ),

    currency:
      typeof transaction.currency === "string"
        ? transaction.currency
        : "BDT",

    type:
      transaction.type,

    status:
      transaction.status,

    reference:
      typeof transaction.reference === "string"
        ? transaction.reference
        : undefined,

    riskScore:
      transaction.riskScore,

    createdAt:
      transaction.createdAt,

    updatedAt:
      transaction.updatedAt,
  };
}

/* =========================================================
   GET MY TRANSACTIONS
   GET /api/transactions
========================================================= */

export const getMyTransactions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({
        success: false,
        message:
          "Not authorized",
      });

      return;
    }

    const userId =
      req.user._id;

    const transactions =
      await Transaction.find({
        $or: [
          {
            senderId:
              userId,
          },
          {
            receiverId:
              userId,
          },
        ],
      })
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
        .lean();

    const safeTransactions =
      transactions.map(
        (transaction) =>
          toSafeTransaction(
            transaction as TransactionLike
          )
      );

    res.status(200).json({
      success: true,

      count:
        safeTransactions.length,

      transactions:
        safeTransactions,
    });
  } catch (error: unknown) {
    console.error(
      "Get transactions error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch transactions.",
    });
  }
};

/* =========================================================
   GET TRANSACTION BY ID
   GET /api/transactions/:id
========================================================= */

export const getTransactionById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({
        success: false,
        message:
          "Not authorized",
      });

      return;
    }

    const {
      id,
    } = req.params;

    const userId =
      req.user._id.toString();

    const transaction =
      await Transaction.findById(
        id
      )
        .populate(
          "senderId",
          "name emailEncrypted phoneEncrypted"
        )
        .populate(
          "receiverId",
          "name emailEncrypted phoneEncrypted"
        )
        .lean();

    if (!transaction) {
      res.status(404).json({
        success: false,

        message:
          "Transaction not found",
      });

      return;
    }

    /* =====================================================
       AUTHORIZATION
    ====================================================== */

    const senderId =
      getPopulatedUserId(
        transaction.senderId
      );

    const receiverId =
      getPopulatedUserId(
        transaction.receiverId
      );

    const isSender =
      senderId ===
      userId;

    const isReceiver =
      receiverId ===
      userId;

    if (
      !isSender &&
      !isReceiver
    ) {
      res.status(403).json({
        success: false,

        message:
          "Not authorized to view this transaction",
      });

      return;
    }

    const safeTransaction =
      toSafeTransaction(
        transaction as TransactionLike
      );

    res.status(200).json({
      success: true,

      transaction:
        safeTransaction,
    });
  } catch (error: unknown) {
    console.error(
      "Get transaction details error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch transaction.",
    });
  }
};

/* =========================================================
   HELPER
========================================================= */

function getPopulatedUserId(
  value: unknown
): string {
  if (!value) {
    return "";
  }

  if (
    typeof value === "string"
  ) {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "_id" in value
  ) {
    return String(
      (
        value as {
          _id: unknown;
        }
      )._id
    );
  }

  return String(
    value
  );
}
