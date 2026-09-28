import mongoose from "mongoose";

import { Transaction } from "../../../../models/Transaction.js";
import { decryptData } from "../../../../utils/crypto.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

function isEncryptedValue(value: unknown): value is EncryptedValue {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedValue>;
  return (
    typeof candidate.encrypted === "string" &&
    typeof candidate.iv === "string" &&
    typeof candidate.authTag === "string"
  );
}

function decryptOptional(value: unknown): string | null {
  if (!isEncryptedValue(value)) return null;
  try {
    return decryptData(value);
  } catch {
    return null;
  }
}

function amountFromEncrypted(value: unknown): number | null {
  const raw = decryptOptional(value);
  if (raw === null) return null;
  const minor = Number(raw);
  if (!Number.isSafeInteger(minor) || minor < 0) return null;
  return minor / 100;
}

export const userTransactionDetailTool: AiToolDefinition = {
  id: "user.transaction.detail",

  async execute({ actor, payload }) {
    if (
      actor.actorType !== "user" ||
      !actor.userId ||
      !mongoose.isValidObjectId(actor.userId)
    ) {
      throw new CofferAiError({
        code: "AI_USER_SCOPE_REQUIRED",
        message: "A personal account context is required.",
        statusCode: 403,
      });
    }

    const resourceId =
      typeof payload.resourceId === "string"
        ? payload.resourceId.trim()
        : "";

    if (!resourceId || !mongoose.isValidObjectId(resourceId)) {
      throw new CofferAiError({
        code: "AI_TRANSACTION_REFERENCE_REQUIRED",
        message: "Please provide a valid transaction ID.",
        statusCode: 422,
      });
    }

    const ownerId = new mongoose.Types.ObjectId(actor.userId);

    const transaction = await Transaction.findOne({
      _id: new mongoose.Types.ObjectId(resourceId),
      $or: [
        { senderId: ownerId },
        { receiverId: ownerId },
      ],
    })
      .select(
        "_id senderId receiverId amount amountEncrypted reference referenceEncrypted currency type status riskScore createdAt updatedAt",
      )
      .lean();

    if (!transaction) {
      throw new CofferAiError({
        code: "AI_TRANSACTION_NOT_FOUND",
        message: "I could not find that transaction in your account.",
        statusCode: 404,
      });
    }

    const senderId = String(transaction.senderId);
    const receiverId = String(transaction.receiverId);
    const direction = senderId === actor.userId ? "OUT" : "IN";
    const decryptedAmount = amountFromEncrypted(
      transaction.amountEncrypted,
    );

    const amount =
      decryptedAmount ??
      (typeof transaction.amount === "number" &&
      Number.isFinite(transaction.amount) &&
      transaction.amount >= 0
        ? transaction.amount
        : null);

    const reference =
      decryptOptional(transaction.referenceEncrypted) ??
      (typeof transaction.reference === "string"
        ? transaction.reference.trim() || null
        : null);
    const status = String(transaction.status ?? "UNKNOWN");
    const failed = status.toUpperCase() === "FAILED";

    const summary = failed
      ? "This transaction is recorded as FAILED. The Transaction record does not store a verified failure reason, so Coffer AI cannot state an exact cause."
      : `This transaction is recorded as ${status}.`;

    return {
      toolId: "user.transaction.detail" as const,
      title: "Transaction detail",
      summary,
      verification: failed ? ("partial" as const) : ("verified" as const),
      confidence: "high" as const,
      facts: [
        { label: "Transaction ID", value: String(transaction._id) },
        { label: "Direction", value: direction },
        { label: "Type", value: String(transaction.type ?? "") },
        { label: "Status", value: status },
        { label: "Amount", value: amount },
        { label: "Currency", value: String(transaction.currency ?? "BDT") },
        { label: "Risk level", value: String(transaction.riskScore ?? "") },
        { label: "Reference", value: reference },
        {
          label: "Created at",
          value: transaction.createdAt
            ? new Date(transaction.createdAt).toISOString()
            : null,
        },
      ],
      sources: [
        {
          type: "transaction_record",
          label: "Owned transaction record",
          reference: String(transaction._id),
        },
      ],
      suggestedActions: [
        {
          label: "Open transactions",
          href: "/dashboard/transactions",
        },
      ],
      diagnosis: null,
      data: {
        kind: "user_transaction_detail",
        direction,
        status,
        exactFailureCauseRecorded: false,
      },
    };
  },
};
