import mongoose from "mongoose";

import {
  Notification,
  type NotificationPriority,
  type NotificationType,
} from "../models/Notification.js";

import {
  NotificationPreference,
} from "../models/NotificationPreference.js";

import {
  encryptData,
} from "../utils/crypto.js";

type CanonicalNotificationType =
  | "SECURITY"
  | "TRANSACTION"
  | "BUDGET"
  | "KYC"
  | "RECEIPT"
  | "SYSTEM";

interface CreateNotificationInput {
  userId:
    | string
    | mongoose.Types.ObjectId;

  type: CanonicalNotificationType;

  priority?: NotificationPriority;

  title: string;
  message: string;

  actionLink?: string;
  actionText?: string;

  amount?: number;
  merchant?: string;

  relatedEntityType?: string;
  relatedEntityId?:
    | string
    | mongoose.Types.ObjectId;

  createdBy?:
    | "SYSTEM"
    | "ADMIN";

  respectPreferences?: boolean;
}

function normalizeText(
  value: unknown,
  maxLength: number
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value
    .trim()
    .slice(
      0,
      maxLength
    );
}

function normalizeActionLink(
  value: unknown
) {
  const link =
    normalizeText(
      value,
      300
    );

  if (!link) {
    return undefined;
  }

  return link.startsWith(
    "/dashboard/"
  )
    ? link
    : undefined;
}

function categoryKey(
  type: CanonicalNotificationType
) {
  return type.toLowerCase() as
    | "security"
    | "transaction"
    | "budget"
    | "kyc"
    | "receipt"
    | "system";
}

function normalizeAmount(
  value: unknown
) {
  if (
    value ===
    undefined
  ) {
    return undefined;
  }

  const amount =
    Number(
      value
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount < 0
  ) {
    return undefined;
  }

  const normalized =
    Math.round(
      amount * 100
    ) / 100;

  return normalized;
}

export async function createNotification(
  input: CreateNotificationInput
) {
  const title =
    normalizeText(
      input.title,
      160
    );

  const message =
    normalizeText(
      input.message,
      1200
    );

  if (
    !title ||
    !message
  ) {
    throw new Error(
      "Notification title and message are required."
    );
  }

  if (
    !mongoose.Types.ObjectId.isValid(
      String(
        input.userId
      )
    )
  ) {
    throw new Error(
      "Invalid notification user ID."
    );
  }

  const respectPreferences =
    input.respectPreferences !==
    false;

  if (
    respectPreferences &&
    input.type !==
      "SECURITY"
  ) {
    const preference =
      await NotificationPreference.findOne({
        userId:
          input.userId,
      }).lean();

    if (preference) {
      const key =
        categoryKey(
          input.type
        );

      if (
        preference.channels.inApp ===
          false ||
        preference.categories[
          key
        ] === false
      ) {
        return null;
      }
    }
  }

  const amount =
    normalizeAmount(
      input.amount
    );

  const amountEncrypted =
    amount ===
    undefined
      ? undefined
      : encryptData(
          String(
            Math.round(
              amount * 100
            )
          )
        );

  const merchant =
    normalizeText(
      input.merchant,
      120
    );

  const relatedEntityId =
    input.relatedEntityId &&
    mongoose.Types.ObjectId.isValid(
      String(
        input.relatedEntityId
      )
    )
      ? new mongoose.Types.ObjectId(
          String(
            input.relatedEntityId
          )
        )
      : undefined;

  return Notification.create({
    userId:
      input.userId,

    titleEncrypted:
      encryptData(
        title
      ),

    messageEncrypted:
      encryptData(
        message
      ),

    amountEncrypted,

    merchantEncrypted:
      merchant
        ? encryptData(
            merchant
          )
        : undefined,

    type:
      input.type as NotificationType,

    priority:
      input.priority ||
      "NORMAL",

    actionLink:
      normalizeActionLink(
        input.actionLink
      ),

    actionText:
      normalizeText(
        input.actionText,
        80
      ) ||
      undefined,

    relatedEntityType:
      normalizeText(
        input.relatedEntityType,
        40
      ) ||
      undefined,

    relatedEntityId,

    createdBy:
      input.createdBy ||
      "SYSTEM",
  });
}
