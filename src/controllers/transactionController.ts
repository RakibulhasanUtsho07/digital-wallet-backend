import mongoose from "mongoose";

import type {
  Response,
} from "express";

import type {
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
  encrypted:
    string;

  iv:
    string;

  authTag:
    string;
}

interface SafeTransactionUser {
  _id:
    string;

  name:
    string;

  email:
    string;

  phone:
    string;
}

type TransactionDirection =
  | "IN"
  | "OUT";

interface TransactionLike {
  _id?:
    unknown;

  senderId?:
    unknown;

  receiverId?:
    unknown;

  amountEncrypted?:
    unknown;

  referenceEncrypted?:
    unknown;

  currency?:
    unknown;

  type?:
    unknown;

  status?:
    unknown;

  createdAt?:
    unknown;

  updatedAt?:
    unknown;
}

interface SafeTransaction {
  _id:
    string;

  senderId:
    SafeTransactionUser |
    string;

  receiverId:
    SafeTransactionUser |
    string;

  counterparty:
    SafeTransactionUser |
    string |
    null;

  direction:
    TransactionDirection;

  amount:
    number;

  currency:
    string;

  type:
    unknown;

  status:
    unknown;

  reference?:
    string;

  referenceUnavailable:
    boolean;

  createdAt?:
    unknown;

  updatedAt?:
    unknown;
}

interface TransactionSerializationResult {
  transaction:
    SafeTransaction |
    null;

  error:
    string |
    null;
}

/* =========================================================
   CACHE
========================================================= */

function setPrivateNoStore(
  res:
    Response
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
   ENCRYPTED VALUE VALIDATION
========================================================= */

function isEncryptedValue(
  value:
    unknown
): value is EncryptedValue {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return false;
  }

  const candidate =
    value as
      Partial<EncryptedValue>;

  return (
    typeof candidate.encrypted ===
      "string" &&
    candidate.encrypted.length >
      0 &&
    typeof candidate.iv ===
      "string" &&
    candidate.iv.length >
      0 &&
    typeof candidate.authTag ===
      "string" &&
    candidate.authTag.length >
      0
  );
}

/* =========================================================
   SAFE DECRYPT
========================================================= */

function safeDecrypt(
  value:
    unknown
): string | null {
  if (
    !isEncryptedValue(
      value
    )
  ) {
    return null;
  }

  try {
    return decryptData({
      encrypted:
        value.encrypted,

      iv:
        value.iv,

      authTag:
        value.authTag,
    });
  } catch (
    error
  ) {
    console.error(
      "TRANSACTION DATA DECRYPT ERROR:",
      error instanceof
        Error
        ? error.message
        : error
    );

    return null;
  }
}

/* =========================================================
   MASK EMAIL
========================================================= */

function maskEmail(
  email:
    string
): string {
  const normalized =
    email.trim();

  if (
    !normalized
  ) {
    return "";
  }

  const atIndex =
    normalized.indexOf(
      "@"
    );

  if (
    atIndex <=
    0
  ) {
    if (
      normalized.length <=
      2
    ) {
      return "**";
    }

    return `${normalized.slice(
      0,
      2
    )}${"*".repeat(
      Math.max(
        3,
        normalized.length -
          2
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
      atIndex +
        1
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

/* =========================================================
   MASK PHONE
========================================================= */

function maskPhone(
  phone:
    string
): string {
  const normalized =
    phone.trim();

  if (
    !normalized
  ) {
    return "";
  }

  const lastFour =
    normalized.slice(
      -4
    );

  return `******${lastFour}`;
}

/* =========================================================
   TRANSACTION ID
========================================================= */

function getTransactionId(
  transaction:
    TransactionLike
): string {
  if (
    transaction._id ===
      null ||
    transaction._id ===
      undefined
  ) {
    return "";
  }

  return String(
    transaction._id
  );
}

/* =========================================================
   AMOUNT

   IMPORTANT:
   We do NOT return 0 when encrypted data is invalid.

   Returning 0 would create fake financial data.
========================================================= */

function getTransactionAmount(
  transaction:
    TransactionLike
): number {
  const decryptedAmount =
    safeDecrypt(
      transaction.amountEncrypted
    );

  if (
    decryptedAmount ===
      null ||
    decryptedAmount ===
      ""
  ) {
    throw new Error(
      "Encrypted transaction amount is missing or invalid."
    );
  }

  const minorUnits =
    Number(
      decryptedAmount
    );

  if (
    !Number.isSafeInteger(
      minorUnits
    ) ||
    minorUnits <
      0
  ) {
    throw new Error(
      "Decrypted transaction amount is not a valid non-negative integer."
    );
  }

  return (
    minorUnits /
    100
  );
}

/* =========================================================
   REFERENCE

   Reference is optional metadata.

   Invalid reference should NOT make the entire
   financial transaction unreadable.
========================================================= */

function getTransactionReference(
  transaction:
    TransactionLike
): {
  reference?:
    string;

  unavailable:
    boolean;
} {
  if (
    !transaction.referenceEncrypted
  ) {
    return {
      unavailable:
        false,
    };
  }

  const decrypted =
    safeDecrypt(
      transaction.referenceEncrypted
    );

  if (
    decrypted ===
      null
  ) {
    return {
      unavailable:
        true,
    };
  }

  return {
    reference:
      decrypted,

    unavailable:
      false,
  };
}

/* =========================================================
   SAFE USER
========================================================= */

function getSafeUser(
  value:
    unknown
): SafeTransactionUser | null {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return null;
  }

  const user =
    value as {
      _id?:
        unknown;

      name?:
        unknown;

      emailEncrypted?:
        unknown;

      phoneEncrypted?:
        unknown;
    };

  if (
    user._id ===
      null ||
    user._id ===
      undefined
  ) {
    return null;
  }

  const email =
    safeDecrypt(
      user.emailEncrypted
    ) ??
    "";

  const phone =
    safeDecrypt(
      user.phoneEncrypted
    ) ??
    "";

  return {
    _id:
      String(
        user._id
      ),

    name:
      typeof user.name ===
        "string"
        ? user.name
        : "",

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
  value:
    unknown
): string {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return "";
  }

  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  if (
    typeof value ===
      "object" &&
    "_id" in value
  ) {
    return String(
      (
        value as {
          _id:
            unknown;
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
  transaction:
    TransactionLike,
  currentUserId:
    string
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
  transaction:
    TransactionLike,
  currentUserId:
    string
):
  | SafeTransactionUser
  | string
  | null {
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
    direction ===
    "OUT"
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
   SERIALIZE TRANSACTION
========================================================= */

function toSafeTransaction(
  transaction:
    TransactionLike,
  currentUserId:
    string
): SafeTransaction {
  const direction =
    getTransactionDirection(
      transaction,
      currentUserId
    );

  const referenceResult =
    getTransactionReference(
      transaction
    );

  return {
    _id:
      getTransactionId(
        transaction
      ),

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
      referenceResult.reference,

    referenceUnavailable:
      referenceResult.unavailable,

    createdAt:
      transaction.createdAt,

    updatedAt:
      transaction.updatedAt,
  };
}

/* =========================================================
   SAFE SERIALIZATION WRAPPER

   A corrupt legacy transaction must not crash
   the entire transaction list.
========================================================= */

function tryToSafeTransaction(
  transaction:
    TransactionLike,
  currentUserId:
    string
): TransactionSerializationResult {
  try {
    return {
      transaction:
        toSafeTransaction(
          transaction,
          currentUserId
        ),

      error:
        null,
    };
  } catch (
    error
  ) {
    const transactionId =
      getTransactionId(
        transaction
      );

    const message =
      error instanceof
        Error
        ? error.message
        : "Unknown transaction serialization error.";

    console.error(
      "TRANSACTION INTEGRITY ERROR:",
      {
        transactionId,
        message,
      }
    );

    return {
      transaction:
        null,

      error:
        message,
    };
  }
}

/* =========================================================
   GET MY TRANSACTIONS
========================================================= */

export const getMyTransactions =
  async (
    req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      if (
        !req.user?._id
      ) {
        res.status(
          401
        ).json({
          success:
            false,

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
            createdAt:
              -1,
          })
          .lean();

      const safeTransactions:
        SafeTransaction[] =
        [];

      let skippedCount =
        0;

      for (
        const transaction of
        transactions
      ) {
        const result =
          tryToSafeTransaction(
            transaction as
              TransactionLike,

            currentUserId
          );

        if (
          result.transaction
        ) {
          safeTransactions.push(
            result.transaction
          );
        } else {
          skippedCount +=
            1;
        }
      }

      res.status(
        200
      ).json({
        success:
          true,

        count:
          safeTransactions.length,

        transactions:
          safeTransactions,

        integrity: {
          databaseRecordCount:
            transactions.length,

          returnedCount:
            safeTransactions.length,

          skippedCount,

          hasWarnings:
            skippedCount >
            0,
        },
      });
    } catch (
      error:
        unknown
    ) {
      console.error(
        "GET TRANSACTIONS ERROR:",
        error instanceof
          Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to fetch transactions.",
      });
    }
  };

/* =========================================================
   GET TRANSACTION BY ID
========================================================= */

export const getTransactionById =
  async (
    req:
      AuthRequest,
    res:
      Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      if (
        !req.user?._id
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "Not authorized",
        });

        return;
      }

      const rawId =
        req.params.id;

      const id =
        Array.isArray(
          rawId
        )
          ? rawId[0]
          : rawId;

      if (
        typeof id !==
          "string" ||
        !id ||
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        res.status(
          400
        ).json({
          success:
            false,

          message:
            "Invalid transaction ID.",
        });

        return;
      }

      const userId =
        req.user._id;

      const currentUserId =
        userId.toString();

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

      if (
        !transaction
      ) {
        res.status(
          404
        ).json({
          success:
            false,

          message:
            "Transaction not found.",
        });

        return;
      }

      const serialized =
        tryToSafeTransaction(
          transaction as
            TransactionLike,

          currentUserId
        );

      if (
        !serialized.transaction
      ) {
        res.status(
          422
        ).json({
          success:
            false,

          code:
            "TRANSACTION_DATA_INTEGRITY_ERROR",

          message:
            "This transaction contains legacy or unreadable encrypted financial data.",
        });

        return;
      }

      res.status(
        200
      ).json({
        success:
          true,

        transaction:
          serialized.transaction,
      });
    } catch (
      error:
        unknown
    ) {
      console.error(
        "GET TRANSACTION DETAILS ERROR:",
        error instanceof
          Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to fetch transaction.",
      });
    }
  };