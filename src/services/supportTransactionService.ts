import mongoose from "mongoose";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  User,
} from "../models/User.js";

import {
  decryptData,
  createLookupHash,
  normalizeEmail,
} from "../utils/crypto.js";

/* =========================================================
   TYPES
========================================================= */

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

/* =========================================================
   SAFE DECRYPT
========================================================= */

const safeDecrypt = (
  value:
    | EncryptedValue
    | undefined
): string => {
  if (!value) {
    return "";
  }

  try {
    return decryptData(
      value
    );
  } catch {
    return "";
  }
};

/* =========================================================
   ESCAPE REGEX
========================================================= */

const escapeRegex = (
  value: string
): string => {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

/* =========================================================
   LIST SUPPORT TRANSACTIONS
========================================================= */

export const searchSupportTransactions =
  async ({
    search,
    type,
    status,
    riskScore,
    page = 1,
    limit = 20,
  }: {
    search?: string;
    type?: string;
    status?: string;
    riskScore?: string;
    page?: number;
    limit?: number;
  }) => {
    /* =====================================================
       PAGINATION
    ====================================================== */

    const safePage =
      Math.max(
        1,
        Math.floor(page)
      );

    const safeLimit =
      Math.min(
        50,
        Math.max(
          1,
          Math.floor(limit)
        )
      );

    const skip =
      (safePage - 1) *
      safeLimit;

    /* =====================================================
       QUERY
    ====================================================== */

    const andConditions:
      Record<
        string,
        unknown
      >[] = [];

    /* =====================================================
       TYPE
    ====================================================== */

    if (
      type &&
      [
        "TRANSFER",
        "DEPOSIT",
        "WITHDRAW",
      ].includes(
        type
      )
    ) {
      andConditions.push({
        type,
      });
    }

    /* =====================================================
       STATUS
    ====================================================== */

    if (
      status &&
      [
        "PENDING",
        "COMPLETED",
        "FAILED",
      ].includes(
        status
      )
    ) {
      andConditions.push({
        status,
      });
    }

    /* =====================================================
       RISK SCORE
    ====================================================== */

    if (
      riskScore &&
      [
        "LOW",
        "MEDIUM",
        "HIGH",
      ].includes(
        riskScore
      )
    ) {
      andConditions.push({
        riskScore,
      });
    }

    /* =====================================================
       SEARCH
    ====================================================== */

    const cleanSearch =
      search
        ?.trim()
        .slice(
          0,
          120
        );

    if (
      cleanSearch
    ) {
      const searchConditions:
        Record<
          string,
          unknown
        >[] = [];

      /* ================================================
         MONGO TRANSACTION ID
      ================================================= */

      if (
        mongoose.Types.ObjectId.isValid(
          cleanSearch
        )
      ) {
        searchConditions.push({
          _id:
            new mongoose.Types.ObjectId(
              cleanSearch
            ),
        });
      }

      /* ================================================
         IDEMPOTENCY KEY
      ================================================= */

      searchConditions.push({
        idempotencyKey: {
          $regex:
            escapeRegex(
              cleanSearch
            ),
          $options:
            "i",
        },
      });

      /* ================================================
         CUSTOMER EMAIL
      ================================================= */

      if (
        cleanSearch.includes(
          "@"
        )
      ) {
        const normalizedEmail =
          normalizeEmail(
            cleanSearch
          );

        if (
          normalizedEmail
        ) {
          const customer =
            await User.findOne({
              emailLookup:
                createLookupHash(
                  normalizedEmail
                ),
            })
              .select(
                "_id"
              )
              .lean();

          if (
            customer
          ) {
            searchConditions.push({
              $or: [
                {
                  senderId:
                    customer._id,
                },
                {
                  receiverId:
                    customer._id,
                },
              ],
            });
          }
        }
      } else {
        /* ==============================================
           CUSTOMER NAME
        =============================================== */

        const customers =
          await User.find({
            name: {
              $regex:
                escapeRegex(
                  cleanSearch
                ),
              $options:
                "i",
            },
          })
            .select(
              "_id"
            )
            .limit(
              30
            )
            .lean();

        if (
          customers.length
        ) {
          const customerIds =
            customers.map(
              (
                customer
              ) =>
                customer._id
            );

          searchConditions.push({
            $or: [
              {
                senderId: {
                  $in:
                    customerIds,
                },
              },
              {
                receiverId: {
                  $in:
                    customerIds,
                },
              },
            ],
          });
        }
      }

      if (
        searchConditions.length
      ) {
        andConditions.push({
          $or:
            searchConditions,
        });
      }
    }

    /* =====================================================
       FINAL QUERY
    ====================================================== */

    const transactionQuery:
      Record<
        string,
        unknown
      > =
      andConditions.length > 0
        ? {
            $and:
              andConditions,
          }
        : {};

    /* =====================================================
       LOAD TRANSACTIONS
    ====================================================== */

    const [
      transactions,
      total,
    ] =
      await Promise.all([
        Transaction.find(
          transactionQuery as any
        )
          .select(
            [
              "_id",
              "senderId",
              "receiverId",
              "idempotencyKey",
              "amountEncrypted",
              "referenceEncrypted",
              "currency",
              "type",
              "status",
              "riskScore",
              "createdAt",
              "updatedAt",
            ].join(" ")
          )
          .sort({
            createdAt:
              -1,
          })
          .skip(
            skip
          )
          .limit(
            safeLimit
          )
          .lean(),

        Transaction.countDocuments(
          transactionQuery as any
        ),
      ]);

    /* =====================================================
       USER IDS
    ====================================================== */

    const userIds =
      Array.from(
        new Map(
          transactions
            .flatMap(
              (
                transaction
              ) => [
                transaction.senderId,
                transaction.receiverId,
              ]
            )
            .map(
              (
                id
              ) => [
                id.toString(),
                id,
              ]
            )
        ).values()
      );

    /* =====================================================
       LOAD USERS
    ====================================================== */

    const users =
      userIds.length > 0
        ? await User.find({
            _id: {
              $in:
                userIds,
            },
          })
            .select(
              "name emailEncrypted role kycStatus walletId"
            )
            .lean()
        : [];

    /* =====================================================
       USER MAP
    ====================================================== */

    const userMap =
      new Map(
        users.map(
          (
            user
          ) => [
            user._id.toString(),
            user,
          ]
        )
      );

    /* =====================================================
       RESPONSE
    ====================================================== */

    return {
      transactions:
        transactions.map(
          (
            transaction
          ) => {
            const sender =
              userMap.get(
                transaction.senderId.toString()
              );

            const receiver =
              userMap.get(
                transaction.receiverId.toString()
              );

            const amountMinorUnits =
              safeDecrypt(
                transaction.amountEncrypted
              );

            const reference =
              safeDecrypt(
                transaction.referenceEncrypted
              );

            return {
              id:
                transaction._id.toString(),

              idempotencyKey:
                transaction.idempotencyKey ??
                null,

              amountMinorUnits,

              reference:
                reference ||
                null,

              currency:
                transaction.currency,

              type:
                transaction.type,

              status:
                transaction.status,

              riskScore:
                transaction.riskScore,

              sender: {
                id:
                  transaction.senderId.toString(),

                name:
                  sender?.name ??
                  "Unknown user",

                email:
                  safeDecrypt(
                    sender?.emailEncrypted
                  ),

                role:
                  sender?.role ??
                  null,

                kycStatus:
                  sender?.kycStatus ??
                  "not_started",

                walletLinked:
                  Boolean(
                    sender?.walletId
                  ),
              },

              receiver: {
                id:
                  transaction.receiverId.toString(),

                name:
                  receiver?.name ??
                  "Unknown user",

                email:
                  safeDecrypt(
                    receiver?.emailEncrypted
                  ),

                role:
                  receiver?.role ??
                  null,

                kycStatus:
                  receiver?.kycStatus ??
                  "not_started",

                walletLinked:
                  Boolean(
                    receiver?.walletId
                  ),
              },

              timestamps: {
                createdAt:
                  transaction.createdAt
                    ? new Date(
                        transaction.createdAt
                      ).toISOString()
                    : null,

                updatedAt:
                  transaction.updatedAt
                    ? new Date(
                        transaction.updatedAt
                      ).toISOString()
                    : null,
              },
            };
          }
        ),

      total,

      page:
        safePage,

      limit:
        safeLimit,

      totalPages:
        Math.ceil(
          total /
            safeLimit
        ),
    };
  };

/* =========================================================
   TRANSACTION DETAIL
========================================================= */

export const getSupportTransactionDetail =
  async (
    transactionId: string
  ) => {
    const cleanId =
      transactionId
        .trim()
        .slice(
          0,
          120
        );

    if (
      !mongoose.Types.ObjectId.isValid(
        cleanId
      )
    ) {
      return null;
    }

    /* =====================================================
       LOAD TRANSACTION
    ====================================================== */

    const transaction =
      await Transaction.findById(
        cleanId
      )
        .select(
          [
            "_id",
            "senderId",
            "receiverId",
            "idempotencyKey",
            "amountEncrypted",
            "referenceEncrypted",
            "currency",
            "type",
            "status",
            "riskScore",
            "createdAt",
            "updatedAt",
          ].join(" ")
        )
        .lean();

    if (
      !transaction
    ) {
      return null;
    }

    /* =====================================================
       LOAD USERS
    ====================================================== */

    const [
      sender,
      receiver,
    ] =
      await Promise.all([
        User.findById(
          transaction.senderId
        )
          .select(
            "name emailEncrypted role kycStatus walletId"
          )
          .lean(),

        User.findById(
          transaction.receiverId
        )
          .select(
            "name emailEncrypted role kycStatus walletId"
          )
          .lean(),
      ]);

    /* =====================================================
       RESPONSE
    ====================================================== */

    return {
      id:
        transaction._id.toString(),

      idempotencyKey:
        transaction.idempotencyKey ??
        null,

      amountMinorUnits:
        safeDecrypt(
          transaction.amountEncrypted
        ),

      reference:
        safeDecrypt(
          transaction.referenceEncrypted
        ) ||
        null,

      currency:
        transaction.currency,

      type:
        transaction.type,

      status:
        transaction.status,

      riskScore:
        transaction.riskScore,

      sender:
        sender
          ? {
              id:
                sender._id.toString(),

              name:
                sender.name,

              email:
                safeDecrypt(
                  sender.emailEncrypted
                ),

              role:
                sender.role,

              kycStatus:
                sender.kycStatus,

              walletLinked:
                Boolean(
                  sender.walletId
                ),
            }
          : null,

      receiver:
        receiver
          ? {
              id:
                receiver._id.toString(),

              name:
                receiver.name,

              email:
                safeDecrypt(
                  receiver.emailEncrypted
                ),

              role:
                receiver.role,

              kycStatus:
                receiver.kycStatus,

              walletLinked:
                Boolean(
                  receiver.walletId
                ),
            }
          : null,

      timestamps: {
        createdAt:
          transaction.createdAt
            ? new Date(
                transaction.createdAt
              ).toISOString()
            : null,

        updatedAt:
          transaction.updatedAt
            ? new Date(
                transaction.updatedAt
              ).toISOString()
            : null,
      },

      support: {
        readOnly:
          true,

        canExecuteFinancialAction:
          false,
      },
    };
  };