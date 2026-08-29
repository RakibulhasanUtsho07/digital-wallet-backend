import mongoose from "mongoose";
import { Response } from "express";

import {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  Notification,
} from "../models/Notification.js";

import {
  NotificationPreference,
} from "../models/NotificationPreference.js";

import {
  decryptData,
} from "../utils/crypto.js";

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

const DEFAULT_PREFERENCES = {
  channels: {
    inApp: true,
    email: true,
    push: false,
  },
  categories: {
    security: true,
    transaction: true,
    budget: true,
    kyc: true,
    receipt: true,
    system: true,
  },
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "07:00",
  },
  digest: "daily" as const,
};

function setPrivateNoStore(
  res: Response
) {
  res.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0"
  );
}

function decryptValue(
  value: unknown
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return "";
  }

  const data =
    value as Partial<EncryptedValue>;

  if (
    typeof data.encrypted !==
      "string" ||
    typeof data.iv !==
      "string" ||
    typeof data.authTag !==
      "string"
  ) {
    return "";
  }

  try {
    return decryptData({
      encrypted:
        data.encrypted,
      iv:
        data.iv,
      authTag:
        data.authTag,
    });
  } catch (
    error
  ) {
    console.error(
      "NOTIFICATION DECRYPT ERROR:",
      error instanceof Error
        ? error.message
        : error
    );

    return "";
  }
}

function decryptAmount(
  value: unknown,
  fallback?: number
) {
  const decrypted =
    decryptValue(
      value
    );

  if (!decrypted) {
    return fallback;
  }

  const minorUnits =
    Number(
      decrypted
    );

  if (
    !Number.isSafeInteger(
      minorUnits
    ) ||
    minorUnits < 0
  ) {
    return fallback;
  }

  return minorUnits /
    100;
}

function normalizeType(
  value: unknown
) {
  switch (value) {
    case "SECURITY":
      return "security" as const;

    case "BUDGET":
      return "budget" as const;

    case "KYC":
      return "kyc" as const;

    case "RECEIPT":
      return "receipt" as const;

    case "TRANSFER":
    case "DEPOSIT":
    case "WITHDRAW":
    case "TRANSACTION":
      return "transaction" as const;

    default:
      return "system" as const;
  }
}

function normalizePriority(
  value: unknown
) {
  switch (value) {
    case "CRITICAL":
      return "critical" as const;

    case "HIGH":
      return "high" as const;

    case "LOW":
      return "low" as const;

    default:
      return "normal" as const;
  }
}

function notificationDTO(
  notification: any
) {
  const amount =
    notification.amountEncrypted
      ? decryptAmount(
          notification.amountEncrypted
        )
      : typeof notification.amount ===
          "number"
        ? notification.amount
        : undefined;

  const merchant =
    decryptValue(
      notification.merchantEncrypted
    ) ||
    notification.merchant ||
    undefined;

  return {
    id:
      String(
        notification._id
      ),

    type:
      normalizeType(
        notification.type
      ),

    priority:
      normalizePriority(
        notification.priority
      ),

    title:
      decryptValue(
        notification.titleEncrypted
      ) ||
      notification.title ||
      "Notification",

    message:
      decryptValue(
        notification.messageEncrypted
      ) ||
      notification.message ||
      "",

    date:
      new Date(
        notification.createdAt ||
          notification.updatedAt ||
          Date.now()
      ).toISOString(),

    isRead:
      Boolean(
        notification.isRead
      ),

    isArchived:
      Boolean(
        notification.isArchived
      ),

    actionLink:
      notification.actionLink ||
      undefined,

    actionText:
      notification.actionText ||
      undefined,

    amount,

    currency:
      amount !==
      undefined
        ? "৳"
        : undefined,

    merchant,
  };
}

function getId(
  req: AuthRequest
) {
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
    !mongoose.Types.ObjectId.isValid(
      id
    )
  ) {
    return null;
  }

  return id;
}

function isTimeValue(
  value: unknown
) {
  return (
    typeof value ===
      "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(
      value
    )
  );
}

/* =========================================================
   GET /api/notifications
========================================================= */

export const getUserNotifications =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized",
        });
        return;
      }

      const notifications =
        await Notification.find({
          userId,
        })
          .sort({
            createdAt: -1,
          })
          .limit(500)
          .lean();

      const safeNotifications =
        notifications.map(
          notificationDTO
        );

      const unreadCount =
        safeNotifications.filter(
          (
            notification
          ) =>
            !notification.isRead &&
            !notification.isArchived
        ).length;

      res.status(
        200
      ).json({
        success: true,
        unreadCount,
        count:
          safeNotifications.length,
        notifications:
          safeNotifications,
      });
    } catch (
      error
    ) {
      console.error(
        "GET NOTIFICATIONS ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to load notifications.",
      });
    }
  };

/* =========================================================
   GET /api/notifications/:id
========================================================= */

export const getNotificationById =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      const id =
        getId(
          req
        );

      if (
        !userId ||
        !id
      ) {
        res.status(
          userId
            ? 400
            : 401
        ).json({
          success: false,
          message:
            userId
              ? "Invalid notification ID."
              : "Not authorized",
        });
        return;
      }

      const notification =
        await Notification.findOne({
          _id: id,
          userId,
        }).lean();

      if (!notification) {
        res.status(
          404
        ).json({
          success: false,
          message:
            "Notification not found.",
        });
        return;
      }

      res.status(
        200
      ).json({
        success: true,
        notification:
          notificationDTO(
            notification
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "GET NOTIFICATION ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to load notification.",
      });
    }
  };

/* =========================================================
   PATCH /api/notifications/:id/read
========================================================= */

export const markNotificationAsRead =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      const id =
        getId(
          req
        );

      if (
        !userId ||
        !id
      ) {
        res.status(
          userId
            ? 400
            : 401
        ).json({
          success: false,
          message:
            userId
              ? "Invalid notification ID."
              : "Not authorized",
        });
        return;
      }

      const notification =
        await Notification.findOneAndUpdate(
          {
            _id: id,
            userId,
          },
          {
            $set: {
              isRead: true,
            },
          },
          {
            new: true,
          }
        );

      if (!notification) {
        res.status(
          404
        ).json({
          success: false,
          message:
            "Notification not found.",
        });
        return;
      }

      res.status(
        200
      ).json({
        success: true,
        message:
          "Notification marked as read.",
        notification:
          notificationDTO(
            notification
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "MARK NOTIFICATION READ ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to update notification.",
      });
    }
  };

/* =========================================================
   PATCH /api/notifications/read-all
========================================================= */

export const markAllNotificationsAsRead =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized",
        });
        return;
      }

      const result =
        await Notification.updateMany(
          {
            userId,
            isArchived: false,
            isRead: false,
          },
          {
            $set: {
              isRead: true,
            },
          }
        );

      res.status(
        200
      ).json({
        success: true,
        message:
          "All notifications marked as read.",
        modifiedCount:
          result.modifiedCount,
      });
    } catch (
      error
    ) {
      console.error(
        "MARK ALL NOTIFICATIONS READ ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to update notifications.",
      });
    }
  };

/* =========================================================
   PATCH /api/notifications/:id/archive
========================================================= */

export const archiveNotification =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      const id =
        getId(
          req
        );

      if (
        !userId ||
        !id
      ) {
        res.status(
          userId
            ? 400
            : 401
        ).json({
          success: false,
          message:
            userId
              ? "Invalid notification ID."
              : "Not authorized",
        });
        return;
      }

      const notification =
        await Notification.findOneAndUpdate(
          {
            _id: id,
            userId,
          },
          {
            $set: {
              isArchived: true,
              isRead: true,
            },
          },
          {
            new: true,
          }
        );

      if (!notification) {
        res.status(
          404
        ).json({
          success: false,
          message:
            "Notification not found.",
        });
        return;
      }

      res.status(
        200
      ).json({
        success: true,
        message:
          "Notification archived.",
        notification:
          notificationDTO(
            notification
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "ARCHIVE NOTIFICATION ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to archive notification.",
      });
    }
  };

/* =========================================================
   DELETE /api/notifications/:id
========================================================= */

export const deleteNotification =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      const id =
        getId(
          req
        );

      if (
        !userId ||
        !id
      ) {
        res.status(
          userId
            ? 400
            : 401
        ).json({
          success: false,
          message:
            userId
              ? "Invalid notification ID."
              : "Not authorized",
        });
        return;
      }

      const deleted =
        await Notification.findOneAndDelete({
          _id: id,
          userId,
        });

      if (!deleted) {
        res.status(
          404
        ).json({
          success: false,
          message:
            "Notification not found.",
        });
        return;
      }

      res.status(
        200
      ).json({
        success: true,
        message:
          "Notification deleted.",
        id,
      });
    } catch (
      error
    ) {
      console.error(
        "DELETE NOTIFICATION ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to delete notification.",
      });
    }
  };

/* =========================================================
   POST /api/notifications/bulk
========================================================= */

export const bulkNotificationAction =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      const ids =
        Array.isArray(
          req.body?.ids
        )
          ? req.body.ids
              .filter(
                (
                  id: unknown
                ) =>
                  typeof id ===
                    "string" &&
                  mongoose.Types.ObjectId.isValid(
                    id
                  )
              )
              .slice(
                0,
                100
              )
          : [];

      const action =
        req.body?.action;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized",
        });
        return;
      }

      if (
        ids.length === 0 ||
        ![
          "read",
          "archive",
          "delete",
        ].includes(
          action
        )
      ) {
        res.status(
          400
        ).json({
          success: false,
          message:
            "Valid notification IDs and action are required.",
        });
        return;
      }

      const query = {
        _id: {
          $in: ids,
        },
        userId,
      };

      let modifiedCount =
        0;

      if (
        action ===
        "delete"
      ) {
        const result =
          await Notification.deleteMany(
            query
          );

        modifiedCount =
          result.deletedCount;
      } else {
        const update =
          action ===
          "archive"
            ? {
                $set: {
                  isArchived: true,
                  isRead: true,
                },
              }
            : {
                $set: {
                  isRead: true,
                },
              };

        const result =
          await Notification.updateMany(
            query,
            update
          );

        modifiedCount =
          result.modifiedCount;
      }

      res.status(
        200
      ).json({
        success: true,
        message:
          `Bulk ${action} completed.`,
        modifiedCount,
      });
    } catch (
      error
    ) {
      console.error(
        "BULK NOTIFICATION ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to update notifications.",
      });
    }
  };

/* =========================================================
   GET /api/notifications/preferences
========================================================= */

export const getNotificationPreferences =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized",
        });
        return;
      }

      const preference =
        await NotificationPreference.findOneAndUpdate(
          {
            userId,
          },
          {
            $setOnInsert: {
              userId,
              ...DEFAULT_PREFERENCES,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
          }
        ).lean();

      res.status(
        200
      ).json({
        success: true,
        preferences: {
          channels:
            preference.channels,
          categories: {
            ...preference.categories,
            security: true,
          },
          quietHours:
            preference.quietHours,
          digest:
            preference.digest,
        },
      });
    } catch (
      error
    ) {
      console.error(
        "GET NOTIFICATION PREFERENCES ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to load notification preferences.",
      });
    }
  };

/* =========================================================
   PUT /api/notifications/preferences
========================================================= */

export const updateNotificationPreferences =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized",
        });
        return;
      }

      const body =
        req.body || {};

      const channels = {
        inApp:
          body.channels?.inApp !==
          false,
        email:
          body.channels?.email !==
          false,
        push:
          body.channels?.push ===
          true,
      };

      const categories = {
        security: true,
        transaction:
          body.categories?.transaction !==
          false,
        budget:
          body.categories?.budget !==
          false,
        kyc:
          body.categories?.kyc !==
          false,
        receipt:
          body.categories?.receipt !==
          false,
        system:
          body.categories?.system !==
          false,
      };

      const quietHours = {
        enabled:
          body.quietHours?.enabled ===
          true,
        start:
          isTimeValue(
            body.quietHours?.start
          )
            ? body.quietHours.start
            : "22:00",
        end:
          isTimeValue(
            body.quietHours?.end
          )
            ? body.quietHours.end
            : "07:00",
      };

      const digest =
        [
          "off",
          "daily",
          "weekly",
        ].includes(
          body.digest
        )
          ? body.digest
          : "daily";

      const preference =
        await NotificationPreference.findOneAndUpdate(
          {
            userId,
          },
          {
            $set: {
              channels,
              categories,
              quietHours,
              digest,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
          }
        ).lean();

      res.status(
        200
      ).json({
        success: true,
        message:
          "Notification preferences saved.",
        preferences: {
          channels:
            preference.channels,
          categories: {
            ...preference.categories,
            security: true,
          },
          quietHours:
            preference.quietHours,
          digest:
            preference.digest,
        },
      });
    } catch (
      error
    ) {
      console.error(
        "UPDATE NOTIFICATION PREFERENCES ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to save notification preferences.",
      });
    }
  };
