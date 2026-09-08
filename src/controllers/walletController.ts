import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  Wallet,
} from "../models/Wallet.js";

import {
  AddMoneyTransaction,
  type AddMoneyProvider,
  type AddMoneySourceType,
} from "../models/AddMoneyTransaction.js";

import {
  initiateAddMoney,
  verifyAndCreditAddMoney,
} from "../services/payment/paymentService.js";

/* =========================================================
   CACHE POLICY
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
   GET MY WALLET
   GET /api/wallet
========================================================= */

export const getMyWallet =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(res);

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized.",
        });

        return;
      }

      const wallet =
        await Wallet.findOne({
          userId,
        })
          .select(
            "_id userId balance pendingBalance currency status createdAt updatedAt"
          )
          .lean();

      if (!wallet) {
        res.status(404).json({
          success: false,
          message:
            "Wallet not found.",
        });

        return;
      }

      res.status(200).json({
        success: true,

        wallet,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "GET WALLET ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to fetch wallet information.",
      });
    }
  };

/* =========================================================
   INITIATE ADD MONEY

   POST /api/wallet/add-money/initiate
========================================================= */

export const initiateWalletAddMoney =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(res);

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(401).json({
          success: false,

          message:
            "Not authorized.",
        });

        return;
      }

      const amount =
        Number(
          req.body?.amount
        );

      const sourceType =
        String(
          req.body?.sourceType ||
            ""
        ).toUpperCase() as AddMoneySourceType;

      const provider =
        String(
          req.body?.provider ||
            "DEMO"
        ).toUpperCase() as AddMoneyProvider;

      const providerName =
        String(
          req.body?.providerName ||
            ""
        ).trim();

      const customerReference =
        String(
          req.body?.customerReference ||
            ""
        ).trim();

      const maskedAccount =
        String(
          req.body?.maskedAccount ||
            ""
        ).trim();

      const idempotencyKey =
        String(
          req.body?.idempotencyKey ||
            ""
        ).trim();

      if (
        !Number.isFinite(
          amount
        )
      ) {
        res.status(400).json({
          success: false,

          message:
            "Valid amount is required.",
        });

        return;
      }

      if (
        ![
          "BANK",
          "MFS",
        ].includes(
          sourceType
        )
      ) {
        res.status(400).json({
          success: false,

          message:
            "sourceType must be BANK or MFS.",
        });

        return;
      }

      if (!providerName) {
        res.status(400).json({
          success: false,

          message:
            "providerName is required.",
        });

        return;
      }

      const result =
        await initiateAddMoney({
          userId,

          amount,

          currency:
            "BDT",

          sourceType,

          provider,

          providerName,

          customerReference:
            customerReference ||
            undefined,

          maskedAccount:
            maskedAccount ||
            undefined,

          idempotencyKey:
            idempotencyKey ||
            undefined,
        });

      res.status(201).json({
        success: true,

        transaction: {
          transactionId:
            result.transactionId,

          providerTransactionId:
            result.providerTransactionId,

          status:
            result.status,

          verificationRequired:
            result.verificationRequired,

          /*
           * DEMO ONLY.
           */
          ...(result.demoCode
            ? {
                demoCode:
                  result.demoCode,
              }
            : {}),
        },

        message:
          result.message,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "INITIATE ADD MONEY ERROR:",
        error
      );

      res.status(400).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Unable to initiate Add Money.",
      });
    }
  };

/* =========================================================
   CONFIRM ADD MONEY
   POST /api/wallet/add-money/confirm
========================================================= */

export const confirmWalletAddMoney =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(res);

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(401).json({
          success: false,

          message:
            "Not authorized.",
        });

        return;
      }

      const transactionId =
        String(
          req.body?.transactionId ||
            ""
        ).trim();

      const verificationCode =
        String(
          req.body?.verificationCode ||
            ""
        ).trim();

      if (!transactionId) {
        res.status(400).json({
          success: false,

          message:
            "Transaction ID is required.",
        });

        return;
      }

      const result =
        await verifyAndCreditAddMoney(
          {
            userId,

            transactionId,

            verificationCode:
              verificationCode ||
              undefined,
          }
        );

      res.status(200).json({
        success: true,

        transaction: result,

        message:
          result.message,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "CONFIRM ADD MONEY ERROR:",
        error
      );

      res.status(400).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Unable to confirm Add Money.",
      });
    }
  };

/* =========================================================
   GET ADD MONEY HISTORY
   GET /api/wallet/add-money/history
========================================================= */

export const getAddMoneyHistory =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(res);

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(401).json({
          success: false,

          message:
            "Not authorized.",
        });

        return;
      }

      const page =
        Math.max(
          1,
          Number(
            req.query.page
          ) || 1
        );

      const limit =
        Math.min(
          50,
          Math.max(
            1,
            Number(
              req.query.limit
            ) || 20
          )
        );

      const skip =
        (page - 1) *
        limit;

      const [
        transactions,
        total,
      ] = await Promise.all([
        AddMoneyTransaction.find({
          userId,
        })
          .sort({
            createdAt:
              -1,
          })
          .skip(skip)
          .limit(limit)
          .select(
            [
              "_id",
              "amount",
              "currency",
              "sourceType",
              "provider",
              "providerName",
              "status",
              "providerTransactionId",
              "maskedAccount",
              "customerReference",
              "initiatedAt",
              "completedAt",
              "creditedAt",
              "balanceBefore",
              "balanceAfter",
              "failureReason",
              "createdAt",
              "updatedAt",
            ].join(" ")
          )
          .lean(),

        AddMoneyTransaction.countDocuments(
          {
            userId,
          }
        ),
      ]);

      res.status(200).json({
        success: true,

        transactions,

        pagination: {
          page,

          limit,

          total,

          pages:
            Math.max(
              1,
              Math.ceil(
                total /
                  limit
              )
            ),
        },
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "GET ADD MONEY HISTORY ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to load Add Money history.",
      });
    }
  };

/* =========================================================
   GET ONE ADD MONEY TRANSACTION
   GET /api/wallet/add-money/:transactionId
========================================================= */

export const getAddMoneyTransaction =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(res);

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message:
            "Not authorized.",
        });

        return;
      }

      const transactionId =
        String(
          req.params.transactionId ||
            ""
        ).trim();

      const transaction =
        await AddMoneyTransaction.findOne(
          {
            _id:
              transactionId,

            userId,
          }
        )
          .select(
            [
              "_id",
              "amount",
              "currency",
              "sourceType",
              "provider",
              "providerName",
              "status",
              "providerTransactionId",
              "maskedAccount",
              "customerReference",
              "initiatedAt",
              "completedAt",
              "creditedAt",
              "balanceBefore",
              "balanceAfter",
              "failureReason",
              "createdAt",
              "updatedAt",
            ].join(" ")
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

      res.status(200).json({
        success: true,

        transaction,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "GET ADD MONEY TRANSACTION ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to fetch Add Money transaction.",
      });
    }
  };