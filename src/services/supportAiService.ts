import { Types } from "mongoose";

import { getSupportTicketDetail } from "./supportTicketService.js";
import { getSupportPaymentDetail } from "./supportPaymentService.js";
import { getSupportTransactionDetail } from "./supportTransactionService.js";

/* =========================================================
   AI TYPES
========================================================= */

export type SupportAiIntent =
  | "Payment Failure"
  | "Refund Issue"
  | "Wallet Issue"
  | "KYC Issue"
  | "Transfer Issue"
  | "Withdrawal Issue"
  | "Security Issue"
  | "Account Issue"
  | "General Support";

export type SupportAiAction =
  | "Investigate payment"
  | "Investigate refund"
  | "Review wallet activity"
  | "Review KYC status"
  | "Investigate transfer"
  | "Investigate withdrawal"
  | "Review security activity"
  | "Review account status"
  | "Review conversation";

export interface SupportAiAnalysis {
  ticketId: string;
  ticketNumber: string;

  provider:
    | "rule-engine";

  mode:
    | "copilot";

  confidence: number;

  summary: string;

  intent: SupportAiIntent;

  suggestedPriority:
    | "Urgent"
    | "High"
    | "Normal"
    | "Low";

  urgency:
    | "Critical"
    | "High"
    | "Moderate"
    | "Low";

  sentiment:
    | "Concerned"
    | "Neutral"
    | "Positive";

  possibleRootCause: string;

  recommendedNextAction:
    SupportAiAction;

  suggestedReply: string;

  verification: {
    status:
      | "verified"
      | "partially_verified"
      | "unverified";
    label: string;
    evidence: string[];
  };

  safety: {
    humanApprovalRequired: true;
    canExecuteFinancialActions: false;
  };

  context: {
    customerName: string;
    customerEmail: string;
    category: string;
    priority: string;
    status: string;
    slaMinutes: number;
    slaBreached: boolean;
    relatedReference: string | null;
    messageCount: number;
  };
}

/* =========================================================
   HELPERS
========================================================= */

const normalize = (
  value: string
): string =>
  value.trim().toLowerCase();

const includesAny = (
  text: string,
  terms: readonly string[]
): boolean =>
  terms.some((term) =>
    text.includes(term)
  );

type EvidenceResult = {
  status:
    | "verified"
    | "partially_verified"
    | "unverified";
  label: string;
  evidence: string[];
  rootCause?: string;
};

/* =========================================================
   VERIFIED BACKEND EVIDENCE
---------------------------------------------------------
The ticket text is a customer claim, not proof. A result is
marked verified only when the related backend record exists
and belongs to the customer who opened the ticket.
========================================================= */

const loadVerifiedEvidence =
  async (ticket: {
    category: string;
    relatedReference: string;
    customer: {
      userId: string;
      kycStatus: string;
      walletLinked: boolean;
    };
  }): Promise<EvidenceResult> => {
    const reference =
      ticket.relatedReference.trim();

    if (
      ticket.category === "Payment" &&
      reference
    ) {
      const payment =
        await getSupportPaymentDetail(
          reference
        );

      if (!payment) {
        return {
          status: "unverified",
          label: "Payment reference not found",
          evidence: [],
        };
      }

      if (
        payment.customerId !==
        ticket.customer.userId
      ) {
        return {
          status: "unverified",
          label: "Reference ownership mismatch",
          evidence: [],
        };
      }

      const evidence = [
        `Payment ${payment.paymentId} is recorded as ${payment.status}.`,
        `Provider: ${payment.provider}; mode: ${payment.mode}.`,
      ];

      if (payment.failure?.code) {
        evidence.push(
          `Recorded failure code: ${payment.failure.code}.`
        );
      }

      if (payment.failure?.message) {
        evidence.push(
          `Recorded provider reason: ${payment.failure.message}.`
        );
      }

      return {
        status: "verified",
        label: "Matched customer payment record",
        evidence,
        rootCause:
          payment.failure?.message
            ? `Verified provider record: ${payment.failure.message}`
            : `The verified payment record is currently ${payment.status}.`,
      };
    }

    if (
      [
        "Transfer",
        "Withdrawal",
        "Deposit",
      ].includes(ticket.category) &&
      reference
    ) {
      const transaction =
        await getSupportTransactionDetail(
          reference
        );

      if (!transaction) {
        return {
          status: "unverified",
          label: "Transaction reference not found",
          evidence: [],
        };
      }

      const belongsToCustomer =
        transaction.sender?.id ===
          ticket.customer.userId ||
        transaction.receiver?.id ===
          ticket.customer.userId;

      if (!belongsToCustomer) {
        return {
          status: "unverified",
          label: "Reference ownership mismatch",
          evidence: [],
        };
      }

      return {
        status: "verified",
        label: "Matched customer transaction record",
        evidence: [
          `Transaction ${transaction.id} is recorded as ${transaction.status}.`,
          `Transaction type: ${transaction.type}; currency: ${transaction.currency}.`,
        ],
        rootCause:
          `The verified transaction record is currently ${transaction.status}.`,
      };
    }

    if (
      ticket.category === "KYC"
    ) {
      return {
        status: "verified",
        label: "Matched customer account record",
        evidence: [
          `Backend KYC status: ${ticket.customer.kycStatus}.`,
          `Wallet linked: ${ticket.customer.walletLinked ? "yes" : "no"}.`,
        ],
        rootCause:
          `The verified account KYC status is ${ticket.customer.kycStatus}.`,
      };
    }

    return {
      status: reference
        ? "partially_verified"
        : "unverified",
      label: reference
        ? "Ticket reference recorded; live evidence unavailable"
        : "No related reference supplied",
      evidence: reference
        ? [
            "The ticket contains a related reference, but this category has no live verification adapter yet.",
          ]
        : [],
    };
  };

/* =========================================================
   INTENT DETECTION
========================================================= */

const inferIntent = (
  category: string,
  text: string
): SupportAiIntent => {
  const categoryMap:
    Record<
      string,
      SupportAiIntent
    > = {
      Payment: "Payment Failure",
      Refund: "Refund Issue",
      Deposit: "Wallet Issue",
      Withdrawal: "Withdrawal Issue",
      Transfer: "Transfer Issue",
      KYC: "KYC Issue",
      Security: "Security Issue",
      Account: "Account Issue",
    };

  if (categoryMap[category]) {
    return categoryMap[category];
  }

  if (
    includesAny(text, [
      "refund",
      "money back",
      "chargeback",
    ])
  ) {
    return "Refund Issue";
  }

  if (
    includesAny(text, [
      "payment",
      "checkout",
      "provider",
      "gateway",
    ])
  ) {
    return "Payment Failure";
  }

  if (
    includesAny(text, [
      "wallet",
      "balance",
      "deducted",
      "deposit",
    ])
  ) {
    return "Wallet Issue";
  }

  if (
    includesAny(text, [
      "kyc",
      "nid",
      "verification",
      "document",
    ])
  ) {
    return "KYC Issue";
  }

  if (
    includesAny(text, [
      "transfer",
      "send money",
      "receiver",
    ])
  ) {
    return "Transfer Issue";
  }

  if (
    includesAny(text, [
      "withdraw",
      "cash out",
    ])
  ) {
    return "Withdrawal Issue";
  }

  if (
    includesAny(text, [
      "security",
      "login",
      "otp",
      "password",
      "2fa",
    ])
  ) {
    return "Security Issue";
  }

  if (
    includesAny(text, [
      "account",
      "profile",
      "locked",
      "suspended",
    ])
  ) {
    return "Account Issue";
  }

  return "General Support";
};

/* =========================================================
   PRIORITY
========================================================= */

const inferPriority = (
  priority: string,
  text: string,
  slaMinutes: number,
  slaBreached: boolean
): SupportAiAnalysis["suggestedPriority"] => {
  if (
    priority === "Urgent" ||
    slaBreached
  ) {
    return "Urgent";
  }

  if (
    priority === "High" ||
    slaMinutes <= 15 ||
    includesAny(text, [
      "deducted",
      "fraud",
      "unauthorized",
      "security",
      "locked",
    ])
  ) {
    return "High";
  }

  if (
    priority === "Low"
  ) {
    return "Low";
  }

  return "Normal";
};

/* =========================================================
   URGENCY
========================================================= */

const inferUrgency = (
  priority: string,
  slaMinutes: number,
  slaBreached: boolean,
  text: string
): SupportAiAnalysis["urgency"] => {
  if (
    priority === "Urgent" ||
    slaBreached ||
    includesAny(text, [
      "fraud",
      "unauthorized",
      "stolen",
      "account takeover",
    ])
  ) {
    return "Critical";
  }

  if (
    priority === "High" ||
    slaMinutes <= 30
  ) {
    return "High";
  }

  if (
    slaMinutes <= 120
  ) {
    return "Moderate";
  }

  return "Low";
};

/* =========================================================
   SENTIMENT
========================================================= */

const inferSentiment = (
  text: string
): SupportAiAnalysis["sentiment"] => {
  if (
    includesAny(text, [
      "angry",
      "frustrated",
      "urgent",
      "worst",
      "scam",
      "fraud",
      "can't",
      "cannot",
      "failed",
      "deducted",
    ])
  ) {
    return "Concerned";
  }

  if (
    includesAny(text, [
      "thank",
      "thanks",
      "great",
      "resolved",
    ])
  ) {
    return "Positive";
  }

  return "Neutral";
};

/* =========================================================
   ROOT CAUSE
========================================================= */

const inferRootCause = (
  intent: SupportAiIntent,
  text: string
): string => {
  if (
    intent === "Payment Failure" &&
    includesAny(text, [
      "timeout",
      "timed out",
      "provider",
    ])
  ) {
    return "Provider timeout or incomplete provider response after payment initiation.";
  }

  if (
    intent === "Payment Failure" &&
    includesAny(text, [
      "failed",
      "declined",
      "rejected",
    ])
  ) {
    return "Payment attempt appears to have failed or been rejected; verify provider status before taking action.";
  }

  if (
    intent === "Refund Issue" &&
    includesAny(text, [
      "pending",
      "missing",
      "not received",
    ])
  ) {
    return "Refund may still be pending or the customer has not received the expected refund yet.";
  }

  if (
    intent === "Wallet Issue" &&
    includesAny(text, [
      "deducted",
      "double",
      "twice",
    ])
  ) {
    return "Wallet balance change may not match the expected transaction outcome.";
  }

  if (
    intent === "KYC Issue"
  ) {
    return "Verification state or submitted identity information requires review.";
  }

  return "Root cause is not yet verified; inspect the linked financial or account context before replying.";
};

/* =========================================================
   NEXT ACTION
========================================================= */

const inferAction = (
  intent: SupportAiIntent
): SupportAiAction => {
  switch (intent) {
    case "Payment Failure":
      return "Investigate payment";

    case "Refund Issue":
      return "Investigate refund";

    case "Wallet Issue":
      return "Review wallet activity";

    case "KYC Issue":
      return "Review KYC status";

    case "Transfer Issue":
      return "Investigate transfer";

    case "Withdrawal Issue":
      return "Investigate withdrawal";

    case "Security Issue":
      return "Review security activity";

    case "Account Issue":
      return "Review account status";

    default:
      return "Review conversation";
  }
};

/* =========================================================
   SUGGESTED REPLY
========================================================= */

const buildSuggestedReply = (
  intent: SupportAiIntent,
  customerName: string
): string => {
  const name =
    customerName || "there";

  switch (intent) {
    case "Payment Failure":
      return `Hi ${name}, thanks for reaching out. We’re reviewing the payment and provider transaction status to verify exactly what happened. We’ll update you as soon as the investigation is complete.`;

    case "Refund Issue":
      return `Hi ${name}, thanks for contacting Coffer Support. We’re checking the refund status and the original transaction so we can confirm where the refund currently stands. We’ll keep you updated.`;

    case "Wallet Issue":
      return `Hi ${name}, we’re reviewing your wallet activity and the related transaction to verify the balance change. We’ll share the next update once the review is complete.`;

    case "KYC Issue":
      return `Hi ${name}, we’re reviewing your verification status and the submitted information. We’ll let you know if any additional information is required.`;

    case "Security Issue":
      return `Hi ${name}, we’re reviewing the security activity on your account. Please avoid sharing any OTP, password, or recovery code while we investigate.`;

    default:
      return `Hi ${name}, thanks for contacting Coffer Support. We’re reviewing your request and will provide the next update as soon as we have verified the relevant information.`;
  }
};

/* =========================================================
   ANALYZE SUPPORT TICKET
========================================================= */

export const analyzeSupportTicket =
  async ({
    ticketId,
  }: {
    ticketId: string;
  }): Promise<SupportAiAnalysis> => {
    if (
      !Types.ObjectId.isValid(
        ticketId
      )
    ) {
      throw new Error(
        "Invalid support ticket ID."
      );
    }

    const ticket =
      await getSupportTicketDetail(
        ticketId
      );

    if (!ticket) {
      throw new Error(
        "Support ticket not found."
      );
    }

    const conversation =
      ticket.messages
        .map(
          (message) =>
            message.body
        )
        .filter(Boolean)
        .join(" ");

    const fullText =
      normalize(
        [
          ticket.subject,
          ticket.description,
          conversation,
        ]
          .filter(Boolean)
          .join(" ")
      );

    const intent =
      inferIntent(
        ticket.category,
        fullText
      );

    const suggestedPriority =
      inferPriority(
        ticket.priority,
        fullText,
        ticket.slaMinutes,
        ticket.slaBreached
      );

    const urgency =
      inferUrgency(
        ticket.priority,
        ticket.slaMinutes,
        ticket.slaBreached,
        fullText
      );

    const sentiment =
      inferSentiment(
        fullText
      );

    const verification =
      await loadVerifiedEvidence({
        category:
          ticket.category,
        relatedReference:
          ticket.relatedReference ??
          "",
        customer: {
          userId:
            ticket.customer.userId,
          kycStatus:
            ticket.customer.kycStatus,
          walletLinked:
            ticket.customer.walletLinked,
        },
      });

    const possibleRootCause =
      verification.rootCause ??
      inferRootCause(
        intent,
        fullText
      );

    const recommendedNextAction =
      inferAction(
        intent
      );

    const baseConfidence =
      Math.round(
        58 +
          (ticket.relatedReference
            ? 7
            : 0) +
          (ticket.messages.length > 0
            ? 6
            : 0) +
          (ticket.category !== "Other"
            ? 5
            : 0)
      );

    const confidence =
      verification.status === "verified"
        ? Math.min(
            98,
            baseConfidence + 18
          )
        : verification.status ===
            "partially_verified"
          ? Math.min(
              78,
              baseConfidence
            )
          : Math.min(
              62,
              baseConfidence
            );

    return {
      ticketId:
        ticket.id,

      ticketNumber:
        ticket.ticketNumber,

      provider:
        "rule-engine",

      mode:
        "copilot",

      confidence,

      summary:
        `${ticket.customer.name} reported a ${intent.toLowerCase()}. The support team should verify the relevant account or financial context before giving a final resolution.`,

      intent,

      suggestedPriority,

      urgency,

      sentiment,

      possibleRootCause,

      recommendedNextAction,

      suggestedReply:
        buildSuggestedReply(
          intent,
          ticket.customer.name
        ),

      verification: {
        status:
          verification.status,
        label:
          verification.label,
        evidence:
          verification.evidence,
      },

      safety: {
        humanApprovalRequired: true,
        canExecuteFinancialActions: false,
      },

      context: {
        customerName:
          ticket.customer.name,

        customerEmail:
          ticket.customer.email,

        category:
          ticket.category,

        priority:
          ticket.priority,

        status:
          ticket.status,

        slaMinutes:
          ticket.slaMinutes,

        slaBreached:
          ticket.slaBreached,

        relatedReference:
          ticket.relatedReference ??
          null,

        messageCount:
          ticket.messages.length,
      },
    };
  };
