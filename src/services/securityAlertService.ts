import {
  Notification,
} from "../models/Notification.js";
import {
  SecurityPreferences,
} from "../models/SecurityPreferences.js";

export type SecurityAlertKind =
  | "newDevice"
  | "suspiciousActivity"
  | "failedLogin";

export const dispatchSecurityAlert =
  async ({
    userId,
    kind,
    title,
    message,
  }: {
    userId: string;
    kind: SecurityAlertKind;
    title: string;
    message: string;
  }): Promise<void> => {
    try {
      const preferences =
        await SecurityPreferences.findOne({
          userId,
        }).select("alerts");

      const enabled =
        preferences?.alerts?.[kind] ??
        true;

      if (!enabled) {
        return;
      }

      await Notification.create({
        userId,
        title:
          title.slice(0, 160),
        message:
          message.slice(0, 500),
        type: "SYSTEM",
        isRead: false,
      });
    } catch (error) {
      /* Alerts must never block authentication. */
      console.error(
        "SECURITY ALERT DELIVERY ERROR:",
        error
      );
    }
  };
