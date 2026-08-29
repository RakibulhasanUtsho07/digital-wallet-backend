import mongoose from "mongoose";
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

type TransactionDirection =
  | "IN"
  | "OUT";

interface TransactionLike {
  _id?: unknown;

  senderId?: unknown;

  receiverId?: unknown;

  amountEncrypted?: unknown;

  referenceEncrypted?: unknown;

  currency?: unknown;

  type?: unknown;

  status?: unknown;

  createdAt?: unknown;

  updatedAt?: unknown;
}

/* =========================================================
   RESPONSE CACHE POLICY
========================================================= */

function setPrivateNoStore(
  res: Response
): void {
  res.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0"
  );

  res.setHeader(
    "Pragma",
    "no-cache"
  );

  res.setHeader(
    "Expires",
    "0"
  );
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
      error instanceof Error
        ? error.message
        : error
    );

    return "";
  }
}

/* =========================================================
   MASK PERSONAL DATA
========================================================= */

function maskEmail(
  email: string
): string {
  const normalized =
    email.trim();

  if (!normalized) {
    return "";
  }

  const atIndex =
    normalized.indexOf("@");

  if (atIndex <= 0) {
    if (normalized.length <= 2) {
      return "**";
    }

    return `${normalized.slice(
      0,
      2
    )}${"*".repeat(
      Math.max(
        3,
        normalized.length - 2
      )
    )}`;
  }

  const local =
    normalized.slice(
      0,
      atIndex
    );

  const domain =
    normalized.slice(
      atIndex + 1
    );

  const visibleLocal =
    local.slice(
      0,
      Math.min(
        2,
        local.length
      )
    );

  return `${visibleLocal}${"*".repeat(
    Math.max(
      3,
      local.length -
      visibleLocal.length
    )
  )}@${domain}`;
}

function maskPhone(
  phone: string
): string {
  const normalized =
    phone.trim();

  if (!normalized) {
    return "";
  }

  const lastFour =
    normalized.slice(-4);

  return `******${lastFour}`;
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

  return minorUnits / 100;
}

/* =========================================================
   TRANSACTION REFERENCE
========================================================= */

function getTransactionReference(
  transaction: TransactionLike
): string | undefined {
  if (
    !transaction.referenceEncrypted
  ) {
    return undefined;
  }

  const decryptedReference =
    safeDecrypt(
      transaction.referenceEncrypted
    );

  if (!decryptedReference) {
    throw new Error(
      "Encrypted transaction reference is invalid."
    );
  }

  return decryptedReference;
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

  if (
    user._id == null
  ) {
    return null;
  }

  const email =
    safeDecrypt(
      user.emailEncrypted
    );

  const phone =
    safeDecrypt(
      user.phoneEncrypted
    );

  return {
    _id:
      String(
        user._id
      ),

    name:
      typeof user.name === "string"
        ? user.name
        : "",

    /*
     * Transaction APIs only return masked PII.
     * Full encrypted values never leave the backend.
     */
    email:
      maskEmail(
        email
      ),

    phone:
      maskPhone(
        phone
      ),
  };
}

/* =========================================================
   POPULATED USER ID
========================================================= */

function getPopulatedUserId(
  value: unknown
): string {
  if (!value) {
    return "";
  }

  if (
    typeof value ===
    "string"
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

/* =========================================================
   DIRECTION
========================================================= */

function getTransactionDirection(
  transaction: TransactionLike,
  currentUserId: string
): TransactionDirection {
  if (
    transaction.type ===
    "DEPOSIT"
  ) {
    return "IN";
  }

  if (
    transaction.type ===
    "WITHDRAW"
  ) {
    return "OUT";
  }

  const senderId =
    getPopulatedUserId(
      transaction.senderId
    );

  return senderId ===
    currentUserId
    ? "OUT"
    : "IN";
}

/* =========================================================
   COUNTERPARTY
========================================================= */

function getCounterparty(
  transaction: TransactionLike,
  currentUserId: string
): SafeTransactionUser | string | null {
  if (
    transaction.type !==
    "TRANSFER"
  ) {
    return null;
  }

  const direction =
    getTransactionDirection(
      transaction,
      currentUserId
    );

  const value =
    direction === "OUT"
      ? transaction.receiverId
      : transaction.senderId;

  return (
    getSafeUser(
      value
    ) ||
    getPopulatedUserId(
      value
    ) ||
    null
  );
}

/* =========================================================
   SAFE TRANSACTION RESPONSE
========================================================= */

function toSafeTransaction(
  transaction: TransactionLike,
  currentUserId: string
) {
  const direction =
    getTransactionDirection(
      transaction,
      currentUserId
    );

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

    counterparty:
      getCounterparty(
        transaction,
        currentUserId
      ),

    direction,

    amount:
      getTransactionAmount(
        transaction
      ),

    currency:
      typeof transaction.currency ===
        "string"
        ? transaction.currency
        : "BDT",

    type:
      transaction.type,

    status:
      transaction.status,

    reference:
      getTransactionReference(
        transaction
      ),

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

export const getMyTransactions =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

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

      const currentUserId =
        userId.toString();

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
          (
            transaction
          ) =>
            toSafeTransaction(
              transaction as TransactionLike,
              currentUserId
            )
        );

      res.status(200).json({
        success: true,

        count:
          safeTransactions.length,

        transactions:
          safeTransactions,
      });
    } catch (
    error: unknown
    ) {
      console.error(
        "Get transactions error:",
        error instanceof Error
          ? error.message
          : error
      );

      /*
       * Do not return decryption/internal database errors
       * to the client.
       */
      res.status(500).json({
        success: false,

        message:
          "Failed to fetch transactions.",
      });
    }
  };

/* =========================================================
   GET TRANSACTION BY ID
   GET /api/transactions/:id

   Security:
   - validates ObjectId
   - ownership is enforced in the database query
   - another user's transaction is not revealed
========================================================= */

export const getTransactionById =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      if (!req.user?._id) {
        res.status(401).json({
          success: false,

          message:
            "Not authorized",
        });

        return;
      }
      const rawId = req.params.id;

      const id =
        Array.isArray(rawId)
          ? rawId[0]
          : rawId;

      if (
        typeof id !== "string" ||
        !id ||
        !mongoose.Types.ObjectId.isValid(id)
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid transaction ID.",
        });

        return;
      }

      const userId =
        req.user._id;

      const currentUserId =
        userId.toString();

      /*
       * Ownership is part of the lookup itself.
       * This prevents an IDOR-style detail lookup and avoids
       * confirming that another user's transaction exists.
       */
      const transaction =
        await Transaction.findOne({
          _id:
            id,

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
          .lean();

      if (!transaction) {
        res.status(404).json({
          success: false,

          message:
            "Transaction not found.",
        });

        return;
      }

      const safeTransaction =
        toSafeTransaction(
          transaction as TransactionLike,
          currentUserId
        );

      res.status(200).json({
        success: true,

        transaction:
          safeTransaction,
      });
    } catch (
    error: unknown
    ) {
      console.error(
        "Get transaction details error:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to fetch transaction.",
      });
    }
  };
