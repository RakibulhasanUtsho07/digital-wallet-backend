import mongoose from "mongoose";

import { Receipt } from "../../../../models/Receipt.js";
import { decryptData } from "../../../../utils/crypto.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

function decryptOptional(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<EncryptedValue>;
  if (
    typeof candidate.encrypted !== "string" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.authTag !== "string"
  ) {
    return null;
  }

  try {
    return decryptData({
      encrypted: candidate.encrypted,
      iv: candidate.iv,
      authTag: candidate.authTag,
    });
  } catch {
    return null;
  }
}

function decryptMoney(value: unknown): number | null {
  const raw = decryptOptional(value);
  if (raw === null) return null;
  const minor = Number(raw);
  if (!Number.isSafeInteger(minor) || minor < 0) return null;
  return minor / 100;
}

export const userReceiptDetailTool: AiToolDefinition = {
  id: "user.receipt.detail",

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
        code: "AI_RECEIPT_REFERENCE_REQUIRED",
        message: "Please provide a valid receipt ID.",
        statusCode: 422,
      });
    }

    const receipt = await Receipt.findOne({
      _id: new mongoose.Types.ObjectId(resourceId),
      userId: new mongoose.Types.ObjectId(actor.userId),
    })
      .select(
        "_id merchantEncrypted amountEncrypted categoryEncrypted paymentMethodEncrypted receiptNumberEncrypted currency receiptDate status warrantyExpiry returnDeadline isFavorite isAiParsed merchantName amount category paymentMethod receiptNumber createdAt updatedAt",
      )
      .lean();

    if (!receipt) {
      throw new CofferAiError({
        code: "AI_RECEIPT_NOT_FOUND",
        message: "I could not find that receipt in your account.",
        statusCode: 404,
      });
    }

    const merchant =
      decryptOptional(receipt.merchantEncrypted) ||
      (typeof receipt.merchantName === "string" ? receipt.merchantName : null);

    const decryptedAmount = receipt.amountEncrypted
      ? decryptMoney(receipt.amountEncrypted)
      : null;

    const amount =
      decryptedAmount ??
      (typeof receipt.amount === "number" &&
      Number.isFinite(receipt.amount) &&
      receipt.amount >= 0
        ? receipt.amount
        : null);

    const category =
      decryptOptional(receipt.categoryEncrypted) ||
      (typeof receipt.category === "string" ? receipt.category : null);

    const paymentMethod =
      decryptOptional(receipt.paymentMethodEncrypted) ||
      (typeof receipt.paymentMethod === "string" ? receipt.paymentMethod : null);

    const receiptNumber =
      decryptOptional(receipt.receiptNumberEncrypted) ||
      (typeof receipt.receiptNumber === "string" ? receipt.receiptNumber : null);

    return {
      toolId: "user.receipt.detail" as const,
      title: "Receipt detail",
      summary: `Your receipt is recorded with status ${String(receipt.status ?? "normal")}.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Receipt ID", value: String(receipt._id) },
        { label: "Merchant", value: merchant },
        { label: "Amount", value: amount },
        { label: "Currency", value: String(receipt.currency ?? "BDT") },
        { label: "Category", value: category },
        { label: "Payment method", value: paymentMethod },
        { label: "Receipt number", value: receiptNumber },
        { label: "Status", value: String(receipt.status ?? "normal") },
        {
          label: "Receipt date",
          value: receipt.receiptDate
            ? new Date(receipt.receiptDate).toISOString()
            : null,
        },
        {
          label: "Warranty expiry",
          value: receipt.warrantyExpiry
            ? new Date(receipt.warrantyExpiry).toISOString()
            : null,
        },
        {
          label: "Return deadline",
          value: receipt.returnDeadline
            ? new Date(receipt.returnDeadline).toISOString()
            : null,
        },
        { label: "AI parsed", value: Boolean(receipt.isAiParsed) },
      ],
      sources: [
        {
          type: "receipt_record",
          label: "Owned receipt record",
          reference: String(receipt._id),
        },
      ],
      suggestedActions: [
        {
          label: "Open receipts",
          href: "/dashboard/receipts",
        },
      ],
      diagnosis: null,
      data: {
        kind: "user_receipt_detail",
        status: String(receipt.status ?? "normal"),
      },
    };
  },
};
