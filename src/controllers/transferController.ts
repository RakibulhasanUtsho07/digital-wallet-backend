import { Response } from "express";

import mongoose, {
  type ClientSession,
} from "mongoose";

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
  encryptData,
  normalizeEmail,
  normalizePhone,
} from "../utils/crypto.js";

import {
  verifyPassword,
} from "../utils/password.js";

/* =========================================================
   HELPERS
========================================================= */

/*
 * Normal text fields:
 * recipient, reference etc.
 */
const toTrimmedString = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

/*
 * Password MUST NOT be trimmed.
 *
 * Login password verification-এর সময়
 * exact value preserve করতে হবে।
 */
const toRawString = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value
    : "";
};

/* =========================================================
   FIND RECIPIENT
   Supports:
   - Email
   - Phone
========================================================= */

const findRecipient = async (
  identifier: string,
  session?: ClientSession
) => {
  const raw =
    identifier.trim();

  if (!raw) {
    return null;
  }

  /* =======================================================
     EMAIL
  ======================================================== */

  if (raw.includes("@")) {
    const normalizedEmail =
      normalizeEmail(raw);

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailRegex.test(
        normalizedEmail
      )
    ) {
      return null;
    }

    const emailLookup =
      createLookupHash(
        normalizedEmail
      );

    const query =
      User.findOne({
        emailLookup,
      });

    if (session) {
      query.session(
        session
      );
    }

    return query;
  }

  /* =======================================================
     PHONE
  ======================================================== */

  const normalizedPhone =
    normalizePhone(raw);

  const digits =
    normalizedPhone.replace(
      /\D/g,
      ""
    );

  /*
   * Generic international-style length check.
   */
  if (
    digits.length < 8 ||
    digits.length > 15
  ) {
    return null;
  }

  const phoneLookup =
    createLookupHash(
      normalizedPhone
    );

  const query =
    User.findOne({
      phoneLookup,
    });

  if (session) {
    query.session(
      session
    );
  }

  return query;
};

/* =========================================================
   VALIDATE RECIPIENT

   POST /api/transfers/validate-recipient
========================================================= */

export const validateRecipient =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const senderId =
        req.user?._id;

      /* =====================================================
         AUTH
      ====================================================== */

      if (!senderId) {
        res.status(401).json({
          success: false,
          valid: false,

          message:
            "Authentication required.",
        });

        return;
      }

      /* =====================================================
         RECIPIENT INPUT
      ====================================================== */

      const recipient =
        toTrimmedString(
          req.body.recipient
        );

      if (!recipient) {
        res.status(400).json({
          success: false,
          valid: false,

          message:
            "Enter a phone number or email address.",
        });

        return;
      }

      /* =====================================================
         FIND ACCOUNT
      ====================================================== */

      const recipientUser =
        await findRecipient(
          recipient
        );

      if (!recipientUser) {
        res.status(404).json({
          success: false,
          valid: false,

          message:
            "No account found for this phone number or email.",
        });

        return;
      }

      /* =====================================================
         SELF TRANSFER
      ====================================================== */

      if (
        recipientUser._id.toString() ===
        senderId.toString()
      ) {
        res.status(400).json({
          success: false,
          valid: false,

          message:
            "You cannot send money to your own account.",
        });

        return;
      }

      /* =====================================================
         SUCCESS
      ====================================================== */

      res.status(200).json({
        success: true,
        valid: true,

        recipient: {
          name:
            recipientUser.name,
        },
      });
    } catch (error) {
      console.error(
        "VALIDATE RECIPIENT ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        valid: false,

        message:
          "Unable to verify recipient.",
      });
    }
  };

/* =========================================================
   SEND MONEY

   POST /api/transfers
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

      const {
        recipient,
        amount,
        reference,
        password,
      } = req.body;

      const senderId =
        req.user?._id;

      /* =====================================================
         AUTH CHECK
      ====================================================== */

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
         PASSWORD REQUIRED
      ====================================================== */

      /*
       * IMPORTANT:
       * Password trim করা হচ্ছে না।
       */
      const enteredPassword =
        toRawString(
          password
        );

      if (!enteredPassword) {
        await session.abortTransaction();

        res.status(400).json({
          success: false,

          message:
            "Your login password is required to confirm this transfer.",
        });

        return;
      }

      /* =====================================================
         GET SENDER + PASSWORD HASH
      ====================================================== */

      const senderUser =
        await User.findById(
          senderId
        )
          .select(
            "+password"
          )
          .session(
            session
          );

      if (!senderUser) {
        await session.abortTransaction();

        res.status(401).json({
          success: false,

          message:
            "Authentication failed.",
        });

        return;
      }

      const storedPassword =
        senderUser.get(
          "password"
        ) as
          | string
          | undefined;

      if (!storedPassword) {
        await session.abortTransaction();

        res.status(401).json({
          success: false,

          message:
            "Authentication failed.",
        });

        return;
      }

      /* =====================================================
         VERIFY LOGIN PASSWORD
      ====================================================== */

      const passwordMatched =
        await verifyPassword(
          storedPassword,
          enteredPassword
        );

      if (!passwordMatched) {
        await session.abortTransaction();

        res.status(401).json({
          success: false,

          message:
            "Incorrect password.",
        });

        return;
      }

      /* =====================================================
         RECIPIENT
      ====================================================== */

      const recipientValue =
        toTrimmedString(
          recipient
        );

      if (!recipientValue) {
        await session.abortTransaction();

        res.status(400).json({
          success: false,

          message:
            "Recipient phone number or email is required.",
        });

        return;
      }

      /* =====================================================
         VERIFY RECIPIENT AGAIN

         Frontend validation alone trusted নয়।
         Final transfer-এর সময় backend আবার check করে।
      ====================================================== */

      const recipientUser =
        await findRecipient(
          recipientValue,
          session
        );

      if (!recipientUser) {
        await session.abortTransaction();

        res.status(404).json({
          success: false,

          message:
            "No account found for this phone number or email.",
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
            "You cannot send money to your own account.",
        });

        return;
      }

      /* =====================================================
         AMOUNT VALIDATION
      ====================================================== */

      const parsedAmount =
        Number(
          amount
        );

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
       * Maximum 2 decimal places.
       */
      const normalizedAmount =
        Math.round(
          parsedAmount * 100
        ) / 100;

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
         SENDER WALLET
      ====================================================== */

      const senderWallet =
        await Wallet.findOne({
          userId:
            senderId,
        }).session(
          session
        );

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
         BALANCE CHECK
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
         RECEIVER WALLET
      ====================================================== */

      const receiverWallet =
        await Wallet.findOne({
          userId:
            recipientUser._id,
        }).session(
          session
        );

      if (!receiverWallet) {
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

      receiverWallet.balance +=
        normalizedAmount;

      await senderWallet.save({
        session,
      });

      await receiverWallet.save({
        session,
      });

      /* =====================================================
         ENCRYPT TRANSACTION AMOUNT

         Store money in minor units (poisha) before encryption.

         Example:
         ৳500.00 -> 50000 -> encrypt("50000")
      ====================================================== */

      const amountInMinorUnits =
        Math.round(
          normalizedAmount * 100
        );

      if (
        !Number.isSafeInteger(
          amountInMinorUnits
        ) ||
        amountInMinorUnits <= 0
      ) {
        throw new Error(
          "Unable to securely process transaction amount."
        );
      }

      const amountEncrypted =
        encryptData(
          String(
            amountInMinorUnits
          )
        );

      /* =====================================================
         CREATE TRANSACTION

         - Password is NEVER stored.
         - Plaintext amount is NOT stored.
         - Only amountEncrypted is persisted.
      ====================================================== */

      const transactions =
        await Transaction.create(
          [
            {
              senderId,

              receiverId:
                recipientUser._id,

              amountEncrypted,

              currency:
                "BDT",

              type:
                "TRANSFER",

              status:
                "COMPLETED",

              reference:
                toTrimmedString(
                  reference
                ) ||
                "Send Money",

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
         COMMIT TRANSACTION
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
          _id:
            transaction._id.toString(),

          amount:
            normalizedAmount,

          status:
            transaction.status,

          currency:
            transaction.currency,

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
    } catch (error) {
      /* =====================================================
         ROLLBACK
      ====================================================== */

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