import { Response } from "express";
import mongoose from "mongoose";

import {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  Wallet,
} from "../models/Wallet.js";

import {
  User,
} from "../models/User.js";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  createLookupHash,
  normalizePhone,
} from "../utils/crypto.js";

/* =========================================================
   SEND MONEY
========================================================= */

export const sendMoney =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    const session =
      await mongoose.startSession();

    try {
      session.startTransaction();

      /* =====================================================
         REQUEST DATA
      ====================================================== */

      const {
        recipientPhone,
        recipient,
        amount,
        reference,
      } = req.body;

      /*
       * TEMPORARY compatibility:
       *
       * Frontend যদি "recipient" পাঠায়
       * অথবা "recipientPhone" পাঠায়,
       * দুইটাই support করবে।
       */
      const rawRecipient =
        typeof recipientPhone ===
          "string"
          ? recipientPhone
          : typeof recipient ===
              "string"
            ? recipient
            : "";

      /* =====================================================
         AUTHENTICATED SENDER
      ====================================================== */

      const senderId =
        req.user?._id;

      if (!senderId) {
        await session.abortTransaction();

        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      /* =====================================================
         NORMALIZE RECIPIENT PHONE
      ====================================================== */

      const normalizedRecipientPhone =
        normalizePhone(
          rawRecipient
        );

      if (
        !normalizedRecipientPhone
      ) {
        await session.abortTransaction();

        res.status(400).json({
          success: false,
          message:
            "Recipient phone number is required.",
        });

        return;
      }

      /* =====================================================
         AMOUNT VALIDATION
      ====================================================== */

      const parsedAmount =
        Number(amount);

      if (
        !Number.isFinite(
          parsedAmount
        ) ||
        parsedAmount <= 0
      ) {
        await session.abortTransaction();

        res.status(400).json({
          success: false,
          message:
            "Invalid transfer amount.",
        });

        return;
      }

      /*
       * Maximum 2 decimal places
       *
       * Example:
       * 500      ✅
       * 500.50   ✅
       * 500.123  ❌
       */
      const amountInMinorUnit =
        Math.round(
          parsedAmount * 100
        );

      const normalizedAmount =
        amountInMinorUnit / 100;

      if (
        Math.abs(
          parsedAmount -
            normalizedAmount
        ) >
        Number.EPSILON
      ) {
        await session.abortTransaction();

        res.status(400).json({
          success: false,
          message:
            "Amount can have maximum 2 decimal places.",
        });

        return;
      }

      /* =====================================================
         CREATE SECURE PHONE LOOKUP
      ====================================================== */

      const recipientLookup =
        createLookupHash(
          normalizedRecipientPhone
        );

      /* =====================================================
         FIND RECIPIENT USING HMAC LOOKUP
      ====================================================== */

      const recipientUser =
        await User.findOne({
          phoneLookup:
            recipientLookup,
        }).session(session);

      if (!recipientUser) {
        await session.abortTransaction();

        res.status(404).json({
          success: false,
          message:
            "Recipient user not found.",
        });

        return;
      }

      /* =====================================================
         PREVENT SELF TRANSFER
      ====================================================== */

      if (
        recipientUser._id.toString() ===
        senderId.toString()
      ) {
        await session.abortTransaction();

        res.status(400).json({
          success: false,
          message:
            "You cannot transfer money to yourself.",
        });

        return;
      }

      /* =====================================================
         FIND SENDER WALLET
      ====================================================== */

      const senderWallet =
        await Wallet.findOne({
          userId:
            senderId,
        }).session(session);

      if (!senderWallet) {
        await session.abortTransaction();

        res.status(404).json({
          success: false,
          message:
            "Sender wallet not found.",
        });

        return;
      }

      /* =====================================================
         CHECK BALANCE
      ====================================================== */

      if (
        senderWallet.balance <
        normalizedAmount
      ) {
        await session.abortTransaction();

        res.status(400).json({
          success: false,
          message:
            "Insufficient balance.",
        });

        return;
      }

      /* =====================================================
         FIND RECIPIENT WALLET
      ====================================================== */

      const recipientWallet =
        await Wallet.findOne({
          userId:
            recipientUser._id,
        }).session(session);

      if (!recipientWallet) {
        await session.abortTransaction();

        res.status(404).json({
          success: false,
          message:
            "Recipient wallet not found.",
        });

        return;
      }

      /* =====================================================
         UPDATE BALANCES
      ====================================================== */

      senderWallet.balance -=
        normalizedAmount;

      recipientWallet.balance +=
        normalizedAmount;

      await senderWallet.save({
        session,
      });

      await recipientWallet.save({
        session,
      });

      /* =====================================================
         CREATE TRANSACTION

         IMPORTANT:
         Amount এখনো plaintext numeric field.

         Next step-এ আমরা Transaction model
         change করে AES-256-GCM encrypted
         amount করব।
      ====================================================== */

      const transactions =
        await Transaction.create(
          [
            {
              senderId,

              receiverId:
                recipientUser._id,

              amount:
                normalizedAmount,

              currency:
                "BDT",

              type:
                "TRANSFER",

              status:
                "COMPLETED",

              reference:
                typeof reference ===
                  "string" &&
                reference.trim()
                  ? reference.trim()
                  : "Send Money",

              riskScore:
                "LOW",
            },
          ],
          {
            session,
          }
        );

      const transaction =
        transactions[0];

      if (!transaction) {
        throw new Error(
          "Transaction creation failed."
        );
      }

      /* =====================================================
         COMMIT
      ====================================================== */

      await session.commitTransaction();

      /* =====================================================
         RESPONSE
      ====================================================== */

      res.status(200).json({
        success: true,

        message:
          "Transfer completed successfully.",

        transaction: {
          id:
            transaction._id,

          amount:
            normalizedAmount,

          currency:
            transaction.currency,

          type:
            transaction.type,

          status:
            transaction.status,

          reference:
            transaction.reference,

          createdAt:
            transaction.createdAt,
        },

        wallet: {
          balance:
            senderWallet.balance,
        },
      });
    } catch (
      error: unknown
    ) {
      /*
       * যদি transaction এখনও active থাকে,
       * rollback করব।
       */
      if (
        session.inTransaction()
      ) {
        await session.abortTransaction();
      }

      console.error(
        "SEND MONEY ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Transfer failed.",
      });
    } finally {
      await session.endSession();
    }
  };