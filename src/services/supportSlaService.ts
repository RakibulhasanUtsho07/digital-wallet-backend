import type {
  SupportTicketPriority,
} from "../types/support.js";

const SLA_MINUTES:
  Record<
    SupportTicketPriority,
    number
  > = {
  Urgent: 30,
  High: 120,
  Normal: 480,
  Low: 1440,
};

export const getSupportSlaMinutes =
  (
    priority:
      SupportTicketPriority
  ) =>
    SLA_MINUTES[
      priority
    ];

export const calculateSupportSlaDueAt =
  (
    priority:
      SupportTicketPriority,
    from:
      Date =
      new Date()
  ) =>
    new Date(
      from.getTime() +
        getSupportSlaMinutes(
          priority
        ) *
          60 *
          1000
    );

export const getSupportSlaRemainingMinutes =
  (
    dueAt:
      Date,
    now:
      Date =
      new Date()
  ) =>
    Math.ceil(
      (
        dueAt.getTime() -
        now.getTime()
      ) /
        60000
    );
