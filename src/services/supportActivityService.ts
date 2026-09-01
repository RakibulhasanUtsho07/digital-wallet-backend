import {
  SupportActivity,
} from "../models/SupportActivity.js";

import type {
  SupportActivityType,
} from "../types/support.js";

export const recordSupportActivity =
  async ({
    ticketId,
    eventType,
    summary,
    actorAdminId,
    actorUserId,
    actorName,
  }: {
    ticketId: string;
    eventType: SupportActivityType;
    summary: string;
    actorAdminId?: string;
    actorUserId?: string;
    actorName: string;
  }) => {
    await SupportActivity.create({
      ticketId,
      eventType,
      summary:
        summary
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240),
      actorAdminId,
      actorUserId,
      actorName:
        actorName
          .trim()
          .slice(0, 120),
    });
  };
