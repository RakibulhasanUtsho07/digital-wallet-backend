import { Response } from "express";

import {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  KYC,
} from "../models/KYC.js";

import {
  User,
} from "../models/User.js";

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

interface PopulatedUserInfo {
  _id?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  kycStatus?: string;
}

interface AdminOverviewTransaction {
  id: string;
  _id: string;
  txnId: string;

  userName: string;
  userEmail: string;

  type:
  | "send"
  | "receive"
  | "topup"
  | "withdraw"
  | "payment"
  | "refund";

  amount: number;

  currency: string;

  riskLevel:
  | "low"
  | "medium"
  | "high";

  status:
  | "completed"
  | "pending"
  | "failed"
  | "under_review";

  timestamp?: string;
  createdAt?: string;
}

/* =========================================================
   SAFE DECRYPT
========================================================= */

const safeDecrypt = (
  value: unknown
): string => {
  if (
    !value ||
    typeof value !==
    "object"
  ) {
    return "";
  }

  const object =
    value as {
      encrypted?: unknown;
      iv?: unknown;
      authTag?: unknown;
    };

  if (
    typeof object.encrypted !==
    "string" ||
    typeof object.iv !==
    "string" ||
    typeof object.authTag !==
    "string"
  ) {
    return "";
  }

  try {
    return decryptData({
      encrypted:
        object.encrypted,

      iv:
        object.iv,

      authTag:
        object.authTag,
    });
  } catch (error) {
    console.error(
      "ADMIN PII DECRYPT ERROR:",
      error
    );

    return "";
  }
};

/* =========================================================
   TRANSACTION AMOUNT DECRYPT

   amountEncrypted stores minor units (poisha) as an
   AES-256-GCM encrypted string.

   Example:
   encrypted "50000" -> 50000 poisha -> BDT 500.00

   Legacy plaintext amount is kept only as a temporary
   fallback until the final cleanup migration is complete.
========================================================= */

const getTransactionAmount = (
  transaction: {
    amountEncrypted?: unknown;
  }
): number => {
  const encryptedValue =
    transaction.amountEncrypted;

  if (
    !encryptedValue ||
    typeof encryptedValue !==
    "object"
  ) {
    throw new Error(
      "Encrypted transaction amount is missing."
    );
  }

  const value =
    encryptedValue as {
      encrypted?: unknown;
      iv?: unknown;
      authTag?: unknown;
    };

  if (
    typeof value.encrypted !==
    "string" ||
    typeof value.iv !==
    "string" ||
    typeof value.authTag !==
    "string"
  ) {
    throw new Error(
      "Invalid encrypted transaction amount."
    );
  }

  const decryptedMinorUnits =
    Number(
      decryptData({
        encrypted:
          value.encrypted,

        iv:
          value.iv,

        authTag:
          value.authTag,
      })
    );

  if (
    !Number.isSafeInteger(
      decryptedMinorUnits
    ) ||
    decryptedMinorUnits < 0
  ) {
    throw new Error(
      "Invalid decrypted transaction amount."
    );
  }

  return (
    decryptedMinorUnits /
    100
  );
};
/* =========================================================
   POPULATED USER HELPER
========================================================= */

const getPopulatedUser = (
  value: unknown
): PopulatedUserInfo | null => {
  if (
    !value ||
    typeof value !==
    "object"
  ) {
    return null;
  }

  const user =
    value as {
      _id?: unknown;
      name?: unknown;

      emailEncrypted?:
      unknown;

      phoneEncrypted?:
      unknown;

      role?: unknown;

      kycStatus?: unknown;
    };

  return {
    _id:
      user._id != null
        ? String(
          user._id
        )
        : undefined,

    name:
      typeof user.name ===
        "string"
        ? user.name
        : undefined,

    email:
      safeDecrypt(
        user.emailEncrypted
      ),

    phone:
      safeDecrypt(
        user.phoneEncrypted
      ),

    role:
      typeof user.role ===
        "string"
        ? user.role
        : undefined,

    kycStatus:
      typeof user.kycStatus ===
        "string"
        ? user.kycStatus
        : undefined,
  };
};

/* =========================================================
   TRANSACTION TYPE
========================================================= */

const mapTransactionType = (
  type: unknown
): AdminOverviewTransaction["type"] => {
  switch (
  String(
    type || ""
  ).toUpperCase()
  ) {
    case "DEPOSIT":
      return "topup";

    case "WITHDRAW":
      return "withdraw";

    case "TRANSFER":
      return "send";

    default:
      return "payment";
  }
};

/* =========================================================
   TRANSACTION STATUS
========================================================= */

const mapTransactionStatus = (
  status: unknown
): AdminOverviewTransaction["status"] => {
  switch (
  String(
    status || ""
  ).toUpperCase()
  ) {
    case "COMPLETED":
      return "completed";

    case "FAILED":
      return "failed";

    case "PENDING":
      return "pending";

    case "UNDER_REVIEW":
    case "REVIEW":
      return "under_review";

    default:
      return "pending";
  }
};

/* =========================================================
   RISK
========================================================= */

const mapRiskLevel = (
  risk: unknown
): AdminOverviewTransaction["riskLevel"] => {
  switch (
  String(
    risk || "LOW"
  ).toUpperCase()
  ) {
    case "HIGH":
      return "high";

    case "MEDIUM":
      return "medium";

    default:
      return "low";
  }
};

/* =========================================================
   PERIOD START DATE
========================================================= */

const getPeriodStartDate = (
  period: string
): Date => {
  const startDate =
    new Date();

  const now =
    new Date();

  switch (period) {
    case "today":
      startDate.setHours(
        0,
        0,
        0,
        0
      );

      break;

    case "7d":
      startDate.setDate(
        startDate.getDate() -
        7
      );

      break;

    case "30d":
      startDate.setDate(
        startDate.getDate() -
        30
      );

      break;

    case "90d":
      startDate.setDate(
        startDate.getDate() -
        90
      );

      break;

    case "year":
      startDate.setFullYear(
        startDate.getFullYear() -
        1
      );

      break;

    default:
      startDate.setDate(
        startDate.getDate() -
        30
      );
  }

  if (
    period === "today"
  ) {
    return startDate;
  }

  if (
    startDate >
    now
  ) {
    return now;
  }

  return startDate;
};

/* =========================================================
   ADMIN OVERVIEW
   GET /api/admin/overview
========================================================= */

export const getAdminOverview =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const period =
        typeof req.query.period ===
          "string"
          ? req.query.period
          : "30d";

      const now =
        new Date();

      const startDate =
        getPeriodStartDate(
          period
        );

      /* =====================================================
         USERS
      ====================================================== */

      const totalUsers =
        await User.countDocuments();

      const activeUsers =
        await User.countDocuments({
          updatedAt: {
            $gte:
              startDate,

            $lte:
              now,
          },
        });

      const inactiveUsers =
        Math.max(
          totalUsers -
          activeUsers,
          0
        );

      /* =====================================================
         KYC
      ====================================================== */

      const [
        verifiedKyc,
        pendingKyc,
        rejectedKyc,
        actionRequiredKyc,
      ] =
        await Promise.all([
          KYC.countDocuments({
            status:
              "VERIFIED",
          }),

          KYC.countDocuments({
            status:
              "PENDING",
          }),

          KYC.countDocuments({
            status:
              "REJECTED",
          }),

          KYC.countDocuments({
            status:
              "ACTION_REQUIRED",
          }),
        ]);

      /* =====================================================
         TRANSACTIONS
      ====================================================== */

      const periodTransactions =
        await Transaction.find({
          createdAt: {
            $gte:
              startDate,

            $lte:
              now,
          },
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

      /* =====================================================
         TRANSACTION STATS

         Amount is decrypted in application memory from
         amountEncrypted. Legacy plaintext amount is used
         only as a temporary fallback.
      ====================================================== */

      const totalTransactions =
        periodTransactions.length;

      const transactionVolume =
        periodTransactions.reduce(
          (
            sum,
            transaction
          ) => {
            return (
              sum +
              getTransactionAmount(
                transaction
              )
            );
          },
          0
        );

      const successfulTransactions =
        periodTransactions.filter(
          (
            transaction
          ) =>
            String(
              transaction.status ||
              ""
            ).toUpperCase() ===
            "COMPLETED"
        ).length;

      const failedTransactions =
        periodTransactions.filter(
          (
            transaction
          ) =>
            String(
              transaction.status ||
              ""
            ).toUpperCase() ===
            "FAILED"
        ).length;

      const pendingTransactions =
        periodTransactions.filter(
          (
            transaction
          ) =>
            String(
              transaction.status ||
              ""
            ).toUpperCase() ===
            "PENDING"
        ).length;

      const successRate =
        totalTransactions > 0
          ? Number(
            (
              (
                successfulTransactions /
                totalTransactions
              ) *
              100
            ).toFixed(
              2
            )
          )
          : 0;

      /* =====================================================
         RISK
      ====================================================== */

      const highRisk =
        periodTransactions.filter(
          (
            transaction
          ) =>
            String(
              transaction.riskScore ||
              ""
            ).toUpperCase() ===
            "HIGH"
        ).length;

      const mediumRisk =
        periodTransactions.filter(
          (
            transaction
          ) =>
            String(
              transaction.riskScore ||
              ""
            ).toUpperCase() ===
            "MEDIUM"
        ).length;

      const lowRisk =
        periodTransactions.filter(
          (
            transaction
          ) =>
            String(
              transaction.riskScore ||
              ""
            ).toUpperCase() ===
            "LOW"
        ).length;

      const totalFraudAlerts =
        highRisk +
        mediumRisk;

      /* =====================================================
         TRANSACTION TYPES
      ====================================================== */

      const typeMap:
        Record<
          string,
          number
        > = {};

      for (
        const transaction of
        periodTransactions
      ) {
        const type =
          mapTransactionType(
            transaction.type
          );

        typeMap[type] =
          (
            typeMap[type] ||
            0
          ) + 1;
      }

      const typeTotal =
        Object.values(
          typeMap
        ).reduce(
          (
            sum,
            value
          ) =>
            sum +
            value,
          0
        );

      const transactionTypes =
        Object.entries(
          typeMap
        ).map(
          (
            [
              name,
              value,
            ]
          ) => ({
            name,

            value,

            percentage:
              typeTotal > 0
                ? Number(
                  (
                    (
                      value /
                      typeTotal
                    ) *
                    100
                  ).toFixed(
                    1
                  )
                )
                : 0,
          })
        );

      /* =====================================================
         ANALYTICS
      ====================================================== */

      const analyticsMap =
        new Map<
          string,
          {
            volume: number;
            count: number;
            success: number;
            failed: number;
          }
        >();

      for (
        const transaction of
        periodTransactions
      ) {
        const createdAt =
          transaction.createdAt
            ? new Date(
              transaction.createdAt
            )
            : now;

        const key =
          createdAt
            .toISOString()
            .slice(
              0,
              10
            );

        if (
          !analyticsMap.has(
            key
          )
        ) {
          analyticsMap.set(
            key,
            {
              volume:
                0,

              count:
                0,

              success:
                0,

              failed:
                0,
            }
          );
        }

        const current =
          analyticsMap.get(
            key
          )!;

        current.volume +=
          getTransactionAmount(
            transaction
          );

        current.count +=
          1;

        const status =
          String(
            transaction.status ||
            ""
          ).toUpperCase();

        if (
          status ===
          "COMPLETED"
        ) {
          current.success +=
            1;
        }

        if (
          status ===
          "FAILED"
        ) {
          current.failed +=
            1;
        }
      }

      const transactionAnalytics =
        Array.from(
          analyticsMap.entries()
        )
          .sort(
            (
              [a],
              [b]
            ) =>
              a.localeCompare(
                b
              )
          )
          .map(
            (
              [
                date,
                values,
              ]
            ) => ({
              time:
                date,

              ...values,
            })
          );

      /* =====================================================
         USER GROWTH
      ====================================================== */

      const usersInPeriod =
        await User.find({
          createdAt: {
            $gte:
              startDate,

            $lte:
              now,
          },
        })
          .select(
            "createdAt updatedAt"
          )
          .sort({
            createdAt:
              1,
          })
          .lean();

      const userGrowthMap =
        new Map<
          string,
          number
        >();

      for (
        const user of
        usersInPeriod
      ) {
        if (
          !user.createdAt
        ) {
          continue;
        }

        const createdAt =
          new Date(
            user.createdAt
          );

        const key =
          createdAt
            .toISOString()
            .slice(
              0,
              10
            );

        userGrowthMap.set(
          key,

          (
            userGrowthMap.get(
              key
            ) ||
            0
          ) + 1
        );
      }

      const userGrowth =
        Array.from(
          userGrowthMap.entries()
        )
          .sort(
            (
              [a],
              [b]
            ) =>
              a.localeCompare(
                b
              )
          )
          .map(
            (
              [
                label,
                newUsers,
              ]
            ) => ({
              label,
              newUsers,
              activeUsers,
              returning:
                0,
            })
          );

      /* =====================================================
         RECENT TRANSACTIONS
      ====================================================== */

      const recentTransactions =
        periodTransactions
          .slice(
            0,
            10
          )
          .map(
            (
              transaction
            ): AdminOverviewTransaction => {
              const sender =
                getPopulatedUser(
                  transaction.senderId
                );

              const receiver =
                getPopulatedUser(
                  transaction.receiverId
                );

              const transactionId =
                transaction._id.toString();

              const reference =
                getTransactionReference(
                  transaction
                );

              return {
                id:
                  transactionId,

                _id:
                  transactionId,

                txnId:
                  reference ||
                  transactionId,

                userName:
                  receiver?.name ||
                  sender?.name ||
                  "Unknown User",

                userEmail:
                  receiver?.email ||
                  sender?.email ||
                  "",

                type:
                  mapTransactionType(
                    transaction.type
                  ),

                amount:
                  getTransactionAmount(
                    transaction
                  ),

                currency:
                  typeof transaction.currency ===
                    "string"
                    ? transaction.currency
                    : "BDT",

                riskLevel:
                  mapRiskLevel(
                    transaction.riskScore
                  ),

                status:
                  mapTransactionStatus(
                    transaction.status
                  ),

                timestamp:
                  transaction.createdAt
                    ? new Date(
                      transaction.createdAt
                    ).toISOString()
                    : undefined,

                createdAt:
                  transaction.createdAt
                    ? new Date(
                      transaction.createdAt
                    ).toISOString()
                    : undefined,
              };
            }
          );

      /* =====================================================
         RECENT KYC
      ====================================================== */

      const recentKycDocs =
        await KYC.find()
          .populate(
            "userId",

            "name emailEncrypted phoneEncrypted"
          )
          .sort({
            createdAt:
              -1,
          })
          .limit(
            5
          )
          .lean();

      const recentKyc =
        recentKycDocs.map(
          (
            kyc: any
          ) => {
            const user =
              getPopulatedUser(
                kyc.userId
              );

            return {
              id:
                kyc._id?.toString(),

              _id:
                kyc._id?.toString(),

              userName:
                user?.name ||
                "Unknown User",

              userEmail:
                user?.email ||
                "",

              documentType:
                kyc.documentType ||
                "Identity Document",

              status:
                String(
                  kyc.status ||
                  "PENDING"
                ).toLowerCase(),

              submittedAt:
                kyc.createdAt
                  ? new Date(
                    kyc.createdAt
                  ).toLocaleString()
                  : "Recently",
            };
          }
        );

      /* =====================================================
         SYSTEM HEALTH
      ====================================================== */

      const systemHealth = [
        {
          name:
            "Core API Gateway",

          status:
            "operational" as const,

          latency:
            "—",
        },

        {
          name:
            "MongoDB",

          status:
            "operational" as const,

          latency:
            "—",
        },

        {
          name:
            "Authentication",

          status:
            "operational" as const,

          latency:
            "—",
        },

        {
          name:
            "Transaction Engine",

          status:
            "operational" as const,

          latency:
            "—",
        },

        {
          name:
            "AI Fraud Detector",

          status:
            "operational" as const,

          latency:
            "—",
        },
      ];

      const aiInsight = {
        title:
          "Operational Insight",

        description:
          successRate >=
            95
            ? `Transaction processing is operating normally with a ${successRate}% success rate for the selected period.`
            : `Transaction success rate is ${successRate}%. Review failed and pending transactions for operational issues.`,
      };

      /* =====================================================
         RESPONSE
      ====================================================== */

      res.status(200).json({
        success:
          true,

        period,

        stats: {
          users: {
            total:
              totalUsers,

            active:
              activeUsers,

            inactive:
              inactiveUsers,

            growth:
              0,
          },

          transactions: {
            total:
              totalTransactions,

            volume:
              transactionVolume,

            successRate,

            failed:
              failedTransactions,

            pending:
              pendingTransactions,
          },

          kyc: {
            verified:
              verifiedKyc,

            pending:
              pendingKyc,

            rejected:
              rejectedKyc,

            actionRequired:
              actionRequiredKyc,
          },

          fraud: {
            totalAlerts:
              totalFraudAlerts,

            highRisk,

            mediumRisk,

            lowRisk,
          },
        },

        transactionAnalytics,

        userGrowth,

        transactionTypes,

        recentTransactions,

        recentKyc,

        activities:
          [],

        systemHealth,

        aiInsight,
      });
    } catch (
    error: unknown
    ) {
      console.error(
        "GET ADMIN OVERVIEW ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Failed to load admin overview.",
      });
    }
  };

/* =========================================================
   GET ALL USERS
   GET /api/admin/users
========================================================= */

export const getAllUsers =
  async (
    _req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      /*
       * IMPORTANT:
       *
       * encrypted values DB থেকে backend-এ আসবে,
       * কিন্তু raw ciphertext API response-এ যাবে না।
       */
      const users =
        await User.find()
          .select(
            [
              "name",
              "emailEncrypted",
              "phoneEncrypted",
              "role",
              "kycStatus",
              "walletId",
              "createdAt",
              "updatedAt",
            ].join(
              " "
            )
          )
          .sort({
            createdAt:
              -1,
          });

      const safeUsers =
        users.map(
          (
            user
          ) => ({
            _id:
              user._id,

            name:
              user.name,

            email:
              safeDecrypt(
                user.emailEncrypted
              ),

            phone:
              safeDecrypt(
                user.phoneEncrypted
              ),

            role:
              user.role,

            kycStatus:
              user.kycStatus,

            walletId:
              user.walletId,

            createdAt:
              user.createdAt,

            updatedAt:
              user.updatedAt,
          })
        );

      res.status(200).json({
        success:
          true,

        count:
          safeUsers.length,

        users:
          safeUsers,
      });
    } catch (
    error: unknown
    ) {
      console.error(
        "GET ALL USERS ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Failed to load users.",
      });
    }
  };

/* =========================================================
   GET PENDING KYC
========================================================= */

export const getPendingKYCs =
  async (
    _req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const kycs =
        await KYC.find({
          status:
            "PENDING",
        })
          .populate(
            "userId",

            [
              "name",
              "emailEncrypted",
              "phoneEncrypted",
              "role",
              "kycStatus",
            ].join(
              " "
            )
          )
          .lean();

      /*
       * Never return encrypted ciphertext
       * directly to admin frontend.
       */
      const safeKycs =
        kycs.map(
          (
            kyc: any
          ) => {
            const user =
              getPopulatedUser(
                kyc.userId
              );

            return {
              ...kyc,

              userId:
                user
                  ? {
                    _id:
                      user._id,

                    name:
                      user.name,

                    email:
                      user.email,

                    phone:
                      user.phone,

                    role:
                      user.role,

                    kycStatus:
                      user.kycStatus,
                  }
                  : kyc.userId,
            };
          }
        );

      res.status(200).json({
        success:
          true,

        count:
          safeKycs.length,

        kycs:
          safeKycs,
      });
    } catch (
    error: unknown
    ) {
      console.error(
        "GET PENDING KYC ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Failed to load pending KYCs.",
      });
    }
  };

/* =========================================================
   REVIEW KYC
========================================================= */

export const reviewKYC =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const {
        status,
        rejectionReason,
      } = req.body;

      const id =
        req.params.id;

      if (
        ![
          "VERIFIED",
          "REJECTED",
        ].includes(
          status
        )
      ) {
        res.status(400).json({
          success:
            false,

          message:
            "Invalid status. Must be VERIFIED or REJECTED",
        });

        return;
      }

      const kyc =
        await KYC.findById(
          id
        );

      if (!kyc) {
        res.status(404).json({
          success:
            false,

          message:
            "KYC record not found",
        });

        return;
      }

      kyc.status =
        status;

      kyc.rejectionReason =
        status ===
          "REJECTED"
          ? rejectionReason ||
          "Documents not valid"
          : "";

      kyc.reviewedBy =
        req.user?._id as any;

      await kyc.save();

      /*
       * User schema uses lowercase:
       *
       * verified
       * rejected
       *
       * তাই uppercase KYC status সরাসরি
       * User model-এ save করছি না।
       */
      const userKycStatus:
        "verified" |
        "rejected" =
        status ===
          "VERIFIED"
          ? "verified"
          : "rejected";

      await User.findByIdAndUpdate(
        kyc.userId,
        {
          kycStatus:
            userKycStatus,
        }
      );

      res.status(200).json({
        success:
          true,

        message:
          `KYC request ${status.toLowerCase()} successfully`,

        kyc,
      });
    } catch (
    error: unknown
    ) {
      console.error(
        "REVIEW KYC ERROR:",
        error
      );

      res.status(500).json({
        success:
          false,

        message:
          error instanceof Error
            ? error.message
            : "Failed to review KYC.",
      });
    }
  };

const getTransactionReference = (
  transaction: {
    referenceEncrypted?: unknown;
    
  }
): string | undefined => {
  const encrypted =
    transaction.referenceEncrypted;

  if (
    encrypted &&
    typeof encrypted ===
    "object"
  ) {
    const value =
      encrypted as {
        encrypted?: unknown;
        iv?: unknown;
        authTag?: unknown;
      };

    if (
      typeof value.encrypted ===
      "string" &&
      typeof value.iv ===
      "string" &&
      typeof value.authTag ===
      "string"
    ) {
      try {
        return decryptData({
          encrypted:
            value.encrypted,

          iv:
            value.iv,

          authTag:
            value.authTag,
        });
      } catch (error) {
        console.error(
          "ADMIN TRANSACTION REFERENCE DECRYPT ERROR:",
          error
        );
      }
    }
  }

 
};