export type SupportTicketStatus =
  | "Open"
  | "Waiting for Customer"
  | "In Progress"
  | "Escalated"
  | "Resolved";

export type SupportTicketPriority =
  | "Low"
  | "Normal"
  | "High"
  | "Urgent";

export type SupportTicketCategory =
  | "Transfer"
  | "Withdrawal"
  | "Deposit"
  | "KYC"
  | "Security"
  | "Account"
  | "Payment"
  | "Other";

export type SupportWaitingOn =
  | "admin"
  | "customer"
  | "none";

export type SupportMessageVisibility =
  | "public"
  | "internal";

export type SupportAuthorType =
  | "admin"
  | "customer"
  | "system";

export type SupportActivityType =
  | "TICKET_CREATED"
  | "STATUS_CHANGED"
  | "PRIORITY_CHANGED"
  | "CATEGORY_CHANGED"
  | "ASSIGNEE_CHANGED"
  | "CUSTOMER_REPLY"
  | "ADMIN_REPLY"
  | "INTERNAL_NOTE"
  | "ESCALATED"
  | "RESOLVED"
  | "REOPENED";
