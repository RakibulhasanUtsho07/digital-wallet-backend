import mongoose from "mongoose";

import {
  CheckoutVerificationChallenge,
} from "../../../models/CheckoutVerificationChallenge.js";
import {
  KYC,
} from "../../../models/KYC.js";
import {
  PaymentAttempt,
} from "../../../models/PaymentAttempt.js";
import {
  ProviderTransaction,
} from "../../../models/ProviderTransaction.js";
import {
  SecurityEvent,
} from "../../../models/SecurityEvent.js";
import {
  SupportActivity,
} from "../../../models/SupportActivity.js";
import {
  SupportTicket,
} from "../../../models/SupportTicket.js";
import {
  Wallet,
} from "../../../models/Wallet.js";
import {
  getSupportCustomerProfile,
} from "../../../services/supportCustomerService.js";

export type SupportCaseResolution =
  | "resolved_by_evidence"
  | "needs_customer_action"
  | "needs_internal_escalation"
  | "insufficient_evidence"
  | "not_failed";

export type SupportCaseEscalationTeam =
  | "none"
  | "payments"
  | "provider"
  | "risk_security"
  | "kyc"
  | "engineering";

export type SupportCaseSignalSeverity =
  | "blocker"
  | "warning"
  | "context"
  | "positive";

export interface SupportCaseSignal {
  code: string;
  title: string;
  detail: string;
  severity: SupportCaseSignalSeverity;
  confirmedCause: boolean;
  evidenceRefs: string[];
}

export interface SupportCaseTimelineItem {
  at: string;
  category:
    | "payment"
    | "provider"
    | "verification"
    | "wallet"
    | "kyc"
    | "security"
    | "support"
    | "transaction";
  label: string;
  reference: string | null;
}

export interface SupportCaseCustomerContext {
  id: string;
  name: string;
  email: string;
  role: string;
  accountStatus: string;
  emailVerified: boolean;
  wallet: {
    id: string;
    status: string;
    balance: number;
    pendingBalance: number;
    currency: string;
  } | null;
  kyc: {
    status: string;
    provider: string;
    rejectionReason: string | null;
    submittedAt: string | null;
    verifiedAt: string | null;
  } | null;
  recentSecurityEvents: Array<{
    eventType: string;
    title: string;
    status: string;
    detail: string | null;
    createdAt: string;
  }>;
  recentSupportTickets: Array<{
    id: string;
    ticketNumber: string;
    subject: string;
    category: string;
    priority: string;
    status: string;
    waitingOn: string;
    relatedReference: string | null;
    slaDueAt: string;
    lastActivityAt: string;
    createdAt: string;
  }>;
  recentSupportActivities: Array<{
    eventType: string;
    summary: string;
    actorName: string;
    ticketId: string;
    createdAt: string;
  }>;
}

export interface SupportCaseReport {
  subject: {
    kind: "payment" | "transaction" | "customer";
    id: string;
    status: string | null;
  };
  resolution: SupportCaseResolution;
  verification: "verified" | "partial" | "unknown";
  confidence: "high" | "medium" | "low";
  confirmedCause: {
    code: string;
    label: string;
    evidenceRefs: string[];
  } | null;
  signals: SupportCaseSignal[];
  customers: SupportCaseCustomerContext[];
  paymentLifecycle: {
    attempts: Array<{
      attemptId: string;
      provider: string;
      operation: string;
      status: string;
      failureCode: string | null;
      failureMessage: string | null;
      attemptNumber: number;
      startedAt: string | null;
      completedAt: string | null;
      createdAt: string;
    }>;
    providerTransactions: Array<{
      providerTransactionId: string;
      provider: string;
      mode: string;
      externalTransactionId: string;
      transactionType: string;
      status: string;
      providerEventType: string | null;
      correlationId: string | null;
      providerCreatedAt: string | null;
      createdAt: string;
    }>;
    verificationChallenges: Array<{
      challengeId: string;
      channel: string;
      attempts: number;
      maxAttempts: number;
      expiresAt: string;
      consumedAt: string | null;
      createdAt: string;
    }>;
  } | null;
  escalation: {
    required: boolean;
    team: SupportCaseEscalationTeam;
    reason: string;
  };
  agentSummary: string;
  agentChecklist: string[];
  customerFacingMessage: string;
  timeline: SupportCaseTimelineItem[];
  sources: Array<{
    type: string;
    label: string;
    reference: string;
  }>;
  suggestedActions: Array<{
    label: string;
    href?: string;
  }>;
}

interface PaymentContextInput {
  id: string;
  paymentId: string;
  customerId: string | null;
  sourceType: string;
  provider: string;
  status: string;
  failure: {
    code: string | null;
    message: string | null;
  } | null;
  timestamps: {
    createdAt: string;
    updatedAt: string;
    authorizedAt: string | null;
    capturedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    cancelledAt: string | null;
    expiredAt: string | null;
  };
}

interface TransactionContextInput {
  id: string;
  status: string;
  type: string;
  riskScore: string;
  sender: {
    id: string;
  } | null;
  receiver: {
    id: string;
  } | null;
  timestamps: {
    createdAt: string | null;
    updatedAt: string | null;
  };
}

function toIso(
  value: Date | string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}

function uniqueStrings(
  values: Array<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(
      values
        .map((value) =>
          value?.trim(),
        )
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    ),
  );
}

function normalizeFailureCode(
  value: string | null | undefined,
): string {
  return (
    value
      ?.trim()
      .toLowerCase() ||
    ""
  );
}

function mapEscalationForFailureCode(
  code: string,
): SupportCaseEscalationTeam {
  if (
    [
      "risk_blocked",
    ].includes(code)
  ) {
    return "risk_security";
  }

  if (
    [
      "provider_error",
      "provider_timeout",
      "timeout",
      "network_error",
      "bank_unavailable",
    ].includes(code)
  ) {
    return "provider";
  }

  if (
    [
      "validation_error",
    ].includes(code)
  ) {
    return "payments";
  }

  return "none";
}

function isCustomerResolvableFailure(
  code: string,
): boolean {
  return [
    "insufficient_funds",
    "declined",
    "card_declined",
    "declined_by_bank",
    "authentication_failed",
    "expired",
    "cancelled",
  ].includes(code);
}

function customerMessageForFailure(
  input: {
    status: string | null;
    failureCode: string;
    failureMessage: string | null;
    needsInternalEscalation: boolean;
  },
): string {
  const code =
    input.failureCode;

  if (
    input.status?.toLowerCase() ===
    "completed"
  ) {
    return "Your payment is recorded as completed. If the balance or merchant order does not reflect it yet, please share the payment reference so support can check the downstream update.";
  }

  switch (code) {
    case "insufficient_funds":
      return "The payment could not complete because the payment source reported insufficient funds. Please verify the available balance or use another eligible payment source before trying again.";

    case "declined":
    case "card_declined":
    case "declined_by_bank":
      return "The payment was declined by the payment provider or issuer. Please verify the payment method and try once more, or use another payment method. If it is repeatedly declined, contact the issuer/provider.";

    case "authentication_failed":
      return "The payment did not complete because the required verification or authentication step was not completed successfully. Please start a fresh checkout and complete the verification step.";

    case "expired":
      return "The previous payment attempt expired before completion. Please start a new payment attempt.";

    case "cancelled":
      return "The payment is recorded as cancelled. If you did not cancel it, support can review the payment reference further.";

    case "risk_blocked":
      return "The payment requires additional internal review. Support cannot override this control, but the case can be routed to the authorized review team.";

    case "provider_error":
    case "provider_timeout":
    case "timeout":
    case "network_error":
    case "bank_unavailable":
      return "The payment provider did not complete the request normally. Please avoid repeated rapid retries. Wait briefly and try again once; support can escalate the reference if the problem continues.";

    case "validation_error":
      return "The provider rejected part of the payment request as invalid. Please re-check the checkout/payment information before trying again.";

    default:
      return input.needsInternalEscalation
        ? "The payment did not complete, and support has enough evidence to route the case for internal review. We will use the payment reference and recorded system evidence for the escalation."
        : "The payment did not complete, but the exact cause is not recorded in the available evidence. Support should not guess the reason; please keep the payment reference for further investigation.";
  }
}

async function loadCustomerContext(
  customerId: string,
  historyLimit: number,
): Promise<SupportCaseCustomerContext | null> {
  if (
    !mongoose.Types.ObjectId.isValid(
      customerId,
    )
  ) {
    return null;
  }

  const profile =
    await getSupportCustomerProfile(
      customerId,
    );

  if (!profile) {
    return null;
  }

  const [
    wallet,
    kyc,
    securityEvents,
    tickets,
  ] =
    await Promise.all([
      Wallet.findOne({
        userId:
          customerId,
      })
        .select(
          "_id balance pendingBalance currency status createdAt updatedAt",
        )
        .lean(),

      KYC.findOne({
        userId:
          customerId,
      })
        .select(
          "status provider rejectionReason submittedAt verifiedAt createdAt updatedAt",
        )
        .lean(),

      SecurityEvent.find({
        userId:
          customerId,
      })
        .select(
          "eventType title status detail createdAt",
        )
        .sort({
          createdAt: -1,
        })
        .limit(
          historyLimit,
        )
        .lean(),

      SupportTicket.find({
        customerUserId:
          customerId,
      })
        .select(
          "_id ticketNumber subject category priority status waitingOn relatedReference slaDueAt lastActivityAt createdAt",
        )
        .sort({
          lastActivityAt: -1,
        })
        .limit(
          historyLimit,
        )
        .lean(),
    ]);

  const ticketIds =
    tickets.map(
      (ticket) =>
        ticket._id,
    );

  const activities =
    ticketIds.length
      ? await SupportActivity.find({
          ticketId: {
            $in:
              ticketIds,
          },
        })
          .select(
            "ticketId eventType summary actorName createdAt",
          )
          .sort({
            createdAt: -1,
          })
          .limit(
            Math.max(
              historyLimit,
              historyLimit * 2,
            ),
          )
          .lean()
      : [];

  return {
    id:
      profile.id,

    name:
      profile.name,

    email:
      profile.email,

    role:
      profile.role,

    accountStatus:
      profile.accountStatus,

    emailVerified:
      profile.emailVerified,

    wallet:
      wallet
        ? {
            id:
              wallet._id.toString(),
            status:
              wallet.status,
            balance:
              wallet.balance,
            pendingBalance:
              wallet.pendingBalance,
            currency:
              wallet.currency,
          }
        : null,

    kyc:
      kyc
        ? {
            status:
              kyc.status,
            provider:
              kyc.provider,
            rejectionReason:
              kyc.rejectionReason ??
              null,
            submittedAt:
              toIso(
                kyc.submittedAt,
              ),
            verifiedAt:
              toIso(
                kyc.verifiedAt,
              ),
          }
        : null,

    recentSecurityEvents:
      securityEvents.map(
        (event) => ({
          eventType:
            event.eventType,
          title:
            event.title,
          status:
            event.status,
          detail:
            event.detail ??
            null,
          createdAt:
            toIso(
              event.createdAt,
            ) ??
            new Date(0).toISOString(),
        }),
      ),

    recentSupportTickets:
      tickets.map(
        (ticket) => ({
          id:
            ticket._id.toString(),
          ticketNumber:
            ticket.ticketNumber,
          subject:
            ticket.subject,
          category:
            ticket.category,
          priority:
            ticket.priority,
          status:
            ticket.status,
          waitingOn:
            ticket.waitingOn,
          relatedReference:
            ticket.relatedReference ??
            null,
          slaDueAt:
            toIso(
              ticket.slaDueAt,
            ) ??
            new Date(0).toISOString(),
          lastActivityAt:
            toIso(
              ticket.lastActivityAt,
            ) ??
            new Date(0).toISOString(),
          createdAt:
            toIso(
              ticket.createdAt,
            ) ??
            new Date(0).toISOString(),
        }),
      ),

    recentSupportActivities:
      activities.map(
        (activity) => ({
          eventType:
            activity.eventType,
          summary:
            activity.summary,
          actorName:
            activity.actorName,
          ticketId:
            activity.ticketId.toString(),
          createdAt:
            toIso(
              activity.createdAt,
            ) ??
            new Date(0).toISOString(),
        }),
      ),
  };
}

async function loadPaymentLifecycle(
  payment: PaymentContextInput,
  limit: number,
) {
  if (
    !mongoose.Types.ObjectId.isValid(
      payment.id,
    )
  ) {
    return null;
  }

  const paymentObjectId =
    new mongoose.Types.ObjectId(
      payment.id,
    );

  const [
    attempts,
    providerTransactions,
    verificationChallenges,
  ] =
    await Promise.all([
      PaymentAttempt.find({
        paymentId:
          paymentObjectId,
      })
        .select(
          "attemptId provider operation status failureCode failureMessage attemptNumber startedAt completedAt createdAt",
        )
        .sort({
          createdAt: -1,
        })
        .limit(limit)
        .lean(),

      ProviderTransaction.find({
        paymentId:
          paymentObjectId,
      })
        .select(
          "providerTransactionId provider mode externalTransactionId transactionType status providerEventType correlationId providerCreatedAt createdAt",
        )
        .sort({
          createdAt: -1,
        })
        .limit(limit)
        .lean(),

      CheckoutVerificationChallenge.find({
        paymentId:
          payment.paymentId,
      })
        .select(
          "challengeId channel attempts maxAttempts expiresAt consumedAt createdAt",
        )
        .sort({
          createdAt: -1,
        })
        .limit(limit)
        .lean(),
    ]);

  return {
    attempts:
      attempts.map(
        (attempt) => ({
          attemptId:
            attempt.attemptId,
          provider:
            attempt.provider,
          operation:
            attempt.operation,
          status:
            attempt.status,
          failureCode:
            attempt.failureCode ??
            null,
          failureMessage:
            attempt.failureMessage ??
            null,
          attemptNumber:
            attempt.attemptNumber,
          startedAt:
            toIso(
              attempt.startedAt,
            ),
          completedAt:
            toIso(
              attempt.completedAt,
            ),
          createdAt:
            toIso(
              attempt.createdAt,
            ) ??
            new Date(0).toISOString(),
        }),
      ),

    providerTransactions:
      providerTransactions.map(
        (item) => ({
          providerTransactionId:
            item.providerTransactionId,
          provider:
            item.provider,
          mode:
            item.mode,
          externalTransactionId:
            item.externalTransactionId,
          transactionType:
            item.transactionType,
          status:
            item.status,
          providerEventType:
            item.providerEventType ??
            null,
          correlationId:
            item.correlationId ??
            null,
          providerCreatedAt:
            toIso(
              item.providerCreatedAt,
            ),
          createdAt:
            toIso(
              item.createdAt,
            ) ??
            new Date(0).toISOString(),
        }),
      ),

    verificationChallenges:
      verificationChallenges.map(
        (challenge) => ({
          challengeId:
            challenge.challengeId,
          channel:
            challenge.channel,
          attempts:
            challenge.attempts,
          maxAttempts:
            challenge.maxAttempts,
          expiresAt:
            toIso(
              challenge.expiresAt,
            ) ??
            new Date(0).toISOString(),
          consumedAt:
            toIso(
              challenge.consumedAt,
            ),
          createdAt:
            toIso(
              challenge.createdAt,
            ) ??
            new Date(0).toISOString(),
        }),
      ),
  };
}

function pushTimeline(
  timeline: SupportCaseTimelineItem[],
  value: SupportCaseTimelineItem | null,
): void {
  if (
    value &&
    value.at
  ) {
    timeline.push(value);
  }
}

function buildSignals(input: {
  payment?: PaymentContextInput | null;
  transaction?: TransactionContextInput | null;
  customers: SupportCaseCustomerContext[];
  paymentLifecycle: SupportCaseReport["paymentLifecycle"];
}): {
  signals: SupportCaseSignal[];
  confirmedCause: SupportCaseReport["confirmedCause"];
} {
  const signals:
    SupportCaseSignal[] = [];

  let confirmedCause:
    SupportCaseReport["confirmedCause"] =
    null;

  const paymentFailureCode =
    normalizeFailureCode(
      input.payment?.failure?.code,
    );

  if (
    input.payment &&
    (
      paymentFailureCode ||
      input.payment.failure?.message
    )
  ) {
    const code =
      paymentFailureCode ||
      "provider_failure_message";

    confirmedCause = {
      code,
      label:
        input.payment.failure?.message ||
        `Recorded payment failure: ${code}`,
      evidenceRefs: [
        `payment:${input.payment.paymentId}`,
      ],
    };

    signals.push({
      code:
        "payment_recorded_failure",
      title:
        "Payment record contains direct failure evidence",
      detail:
        input.payment.failure?.message ||
        `Failure code: ${code}`,
      severity:
        code === "risk_blocked"
          ? "blocker"
          : "warning",
      confirmedCause:
        true,
      evidenceRefs:
        confirmedCause.evidenceRefs,
    });
  }

  const failedAttempt =
    input.paymentLifecycle?.attempts.find(
      (attempt) =>
        attempt.status ===
          "failed" &&
        (
          attempt.failureCode ||
          attempt.failureMessage
        ),
    );

  if (failedAttempt) {
    const attemptCode =
      normalizeFailureCode(
        failedAttempt.failureCode,
      ) ||
      "attempt_failure";

    signals.push({
      code:
        "payment_attempt_failure",
      title:
        "Payment attempt recorded a failure",
      detail: [
        `Attempt ${failedAttempt.attemptNumber}`,
        failedAttempt.failureCode
          ? `code ${failedAttempt.failureCode}`
          : null,
        failedAttempt.failureMessage,
      ]
        .filter(Boolean)
        .join(" · "),
      severity:
        attemptCode ===
          "risk_blocked"
          ? "blocker"
          : "warning",
      confirmedCause:
        Boolean(
          !confirmedCause &&
          input.payment?.status.toLowerCase() ===
            "failed",
        ),
      evidenceRefs: [
        `payment_attempt:${failedAttempt.attemptId}`,
      ],
    });

    if (
      !confirmedCause &&
      input.payment?.status.toLowerCase() ===
        "failed"
    ) {
      confirmedCause = {
        code:
          attemptCode,
        label:
          failedAttempt.failureMessage ||
          `Payment attempt failure: ${attemptCode}`,
        evidenceRefs: [
          `payment_attempt:${failedAttempt.attemptId}`,
        ],
      };
    }
  }

  const failedProviderTransaction =
    input.paymentLifecycle?.providerTransactions.find(
      (item) =>
        [
          "failed",
          "cancelled",
        ].includes(
          item.status,
        ),
    );

  if (
    failedProviderTransaction
  ) {
    signals.push({
      code:
        "provider_transaction_non_success",
      title:
        "Provider-side transaction is not successful",
      detail:
        `${failedProviderTransaction.provider} ${failedProviderTransaction.transactionType} is ${failedProviderTransaction.status}.`,
      severity:
        "warning",
      confirmedCause:
        false,
      evidenceRefs: [
        `provider_transaction:${failedProviderTransaction.providerTransactionId}`,
      ],
    });
  }

  const now =
    Date.now();

  const expiredVerification =
    input.paymentLifecycle?.verificationChallenges.find(
      (challenge) =>
        !challenge.consumedAt &&
        new Date(
          challenge.expiresAt,
        ).getTime() <
          now,
    );

  if (expiredVerification) {
    signals.push({
      code:
        "checkout_verification_not_completed",
      title:
        "Checkout verification challenge was not completed",
      detail:
        `The ${expiredVerification.channel} verification challenge expired without being consumed.`,
      severity:
        "warning",
      confirmedCause:
        false,
      evidenceRefs: [
        `checkout_verification:${expiredVerification.challengeId}`,
      ],
    });
  }

  const exhaustedVerification =
    input.paymentLifecycle?.verificationChallenges.find(
      (challenge) =>
        !challenge.consumedAt &&
        challenge.attempts >=
          challenge.maxAttempts,
    );

  if (exhaustedVerification) {
    signals.push({
      code:
        "checkout_verification_attempt_limit",
      title:
        "Checkout verification reached its attempt limit",
      detail:
        `Verification attempts: ${exhaustedVerification.attempts}/${exhaustedVerification.maxAttempts}.`,
      severity:
        "blocker",
      confirmedCause:
        false,
      evidenceRefs: [
        `checkout_verification:${exhaustedVerification.challengeId}`,
      ],
    });
  }

  for (
    const customer of
    input.customers
  ) {
    if (
      customer.wallet?.status ===
        "FROZEN" ||
      customer.wallet?.status ===
        "BLOCKED"
    ) {
      signals.push({
        code:
          "wallet_restricted",
        title:
          `${customer.name}'s wallet is ${customer.wallet.status}`,
        detail:
          "This is a real account restriction. It is relevant context, but it is not automatically the confirmed cause of a specific payment unless the payment evidence says so.",
        severity:
          "blocker",
        confirmedCause:
          false,
        evidenceRefs: [
          `wallet:${customer.wallet.id}`,
        ],
      });
    }

    if (
      customer.kyc?.status ===
      "rejected"
    ) {
      signals.push({
        code:
          "kyc_rejected",
        title:
          `${customer.name}'s KYC is rejected`,
        detail:
          customer.kyc.rejectionReason
            ? `Recorded rejection reason: ${customer.kyc.rejectionReason}`
            : "KYC is rejected. No rejection reason is exposed in this case report.",
        severity:
          "warning",
        confirmedCause:
          false,
        evidenceRefs: [
          `kyc:${customer.id}`,
        ],
      });
    } else if (
      customer.kyc &&
      [
        "pending",
        "under_review",
      ].includes(
        customer.kyc.status,
      )
    ) {
      signals.push({
        code:
          "kyc_not_final",
        title:
          `${customer.name}'s KYC is ${customer.kyc.status}`,
        detail:
          "KYC has not reached a verified final state. Treat this as account context unless a payment rule explicitly links the payment failure to KYC.",
        severity:
          "context",
        confirmedCause:
          false,
        evidenceRefs: [
          `kyc:${customer.id}`,
        ],
      });
    }

    const warningSecurityEvent =
      customer.recentSecurityEvents.find(
        (event) =>
          event.status ===
            "warning" ||
          event.eventType ===
            "SUSPICIOUS_LOGIN" ||
          event.eventType ===
            "WALLET_FROZEN",
      );

    if (warningSecurityEvent) {
      signals.push({
        code:
          "recent_security_warning",
        title:
          `Recent security context for ${customer.name}`,
        detail:
          `${warningSecurityEvent.title} (${warningSecurityEvent.eventType}).`,
        severity:
          warningSecurityEvent.eventType ===
          "WALLET_FROZEN"
            ? "blocker"
            : "context",
        confirmedCause:
          false,
        evidenceRefs: [
          `security_event:${warningSecurityEvent.eventType}:${warningSecurityEvent.createdAt}`,
        ],
      });
    }

    const repeatedReferenceTicket =
      input.payment
        ? customer.recentSupportTickets.find(
            (ticket) =>
              ticket.relatedReference ===
              input.payment?.paymentId,
          )
        : input.transaction
          ? customer.recentSupportTickets.find(
              (ticket) =>
                ticket.relatedReference ===
                input.transaction?.id,
            )
          : null;

    if (repeatedReferenceTicket) {
      signals.push({
        code:
          "existing_support_case",
        title:
          "An existing support ticket already references this issue",
        detail:
          `${repeatedReferenceTicket.ticketNumber} is ${repeatedReferenceTicket.status} with ${repeatedReferenceTicket.priority} priority.`,
        severity:
          repeatedReferenceTicket.status ===
          "Escalated"
            ? "warning"
            : "context",
        confirmedCause:
          false,
        evidenceRefs: [
          `support_ticket:${repeatedReferenceTicket.ticketNumber}`,
        ],
      });
    }
  }

  if (
    input.transaction?.riskScore ===
    "HIGH"
  ) {
    signals.push({
      code:
        "transaction_high_risk",
      title:
        "Transaction has a HIGH risk score",
      detail:
        "The risk score is relevant context and may require authorized risk review, but it is not automatically the verified reason the transaction failed.",
      severity:
        "warning",
      confirmedCause:
        false,
      evidenceRefs: [
        `transaction:${input.transaction.id}`,
      ],
    });
  }

  return {
    signals,
    confirmedCause,
  };
}

function chooseEscalation(input: {
  payment?: PaymentContextInput | null;
  transaction?: TransactionContextInput | null;
  signals: SupportCaseSignal[];
  confirmedCause: SupportCaseReport["confirmedCause"];
  paymentLifecycle: SupportCaseReport["paymentLifecycle"];
}): SupportCaseReport["escalation"] {
  const failureCode =
    normalizeFailureCode(
      input.confirmedCause?.code,
    );

  const mappedTeam =
    mapEscalationForFailureCode(
      failureCode,
    );

  if (
    mappedTeam !==
    "none"
  ) {
    return {
      required:
        true,
      team:
        mappedTeam,
      reason:
        `Verified failure evidence requires ${mappedTeam.replace("_", "/")} review.`,
    };
  }

  if (
    input.transaction?.riskScore ===
    "HIGH" ||
    input.signals.some(
      (signal) =>
        signal.code ===
          "wallet_restricted" ||
        signal.code ===
          "recent_security_warning" &&
        signal.severity ===
          "blocker",
    )
  ) {
    return {
      required:
        true,
      team:
        "risk_security",
      reason:
        "The case contains a wallet/security restriction or high-risk transaction context that Support must not override.",
    };
  }

  const failedAttempts =
    input.paymentLifecycle?.attempts.filter(
      (attempt) =>
        attempt.status ===
        "failed",
    ).length ??
    0;

  if (
    failedAttempts >=
      2 &&
    !isCustomerResolvableFailure(
      failureCode,
    )
  ) {
    return {
      required:
        true,
      team:
        "provider",
      reason:
        "Multiple payment attempts failed without a customer-resolvable verified cause.",
    };
  }

  if (
    input.payment &&
    input.payment.status.toLowerCase() ===
      "failed" &&
    !input.confirmedCause
  ) {
    return {
      required:
        true,
      team:
        "payments",
      reason:
        "The payment is failed but no exact failure cause is recorded. Escalate with the payment and provider evidence instead of guessing.",
    };
  }

  if (
    input.paymentLifecycle?.providerTransactions.some(
      (item) =>
        item.status ===
        "failed",
    ) &&
    !input.confirmedCause
  ) {
    return {
      required:
        true,
      team:
        "provider",
      reason:
        "Provider-side failure is visible, but no exact failure code is available.",
    };
  }

  return {
    required:
      false,
    team:
      "none",
    reason:
      "No mandatory internal escalation was identified from the current evidence.",
  };
}

function chooseResolution(input: {
  payment?: PaymentContextInput | null;
  transaction?: TransactionContextInput | null;
  confirmedCause: SupportCaseReport["confirmedCause"];
  escalation: SupportCaseReport["escalation"];
}): {
  resolution: SupportCaseResolution;
  verification: SupportCaseReport["verification"];
  confidence: SupportCaseReport["confidence"];
} {
  const paymentStatus =
    input.payment?.status.toLowerCase();

  const transactionStatus =
    input.transaction?.status.toUpperCase();

  if (
    paymentStatus ===
      "completed" ||
    transactionStatus ===
      "COMPLETED"
  ) {
    return {
      resolution:
        "not_failed",
      verification:
        "verified",
      confidence:
        "high",
    };
  }

  if (
    input.confirmedCause
  ) {
    return {
      resolution:
        input.escalation.required
          ? "needs_internal_escalation"
          : "needs_customer_action",
      verification:
        "verified",
      confidence:
        "high",
    };
  }

  if (
    input.escalation.required
  ) {
    return {
      resolution:
        "needs_internal_escalation",
      verification:
        "partial",
      confidence:
        "medium",
    };
  }

  return {
    resolution:
      "insufficient_evidence",
    verification:
      "partial",
    confidence:
      "medium",
  };
}

function makeAgentChecklist(input: {
  payment?: PaymentContextInput | null;
  transaction?: TransactionContextInput | null;
  confirmedCause: SupportCaseReport["confirmedCause"];
  escalation: SupportCaseReport["escalation"];
  signals: SupportCaseSignal[];
}): string[] {
  const items: string[] = [];

  if (
    input.payment
  ) {
    items.push(
      `Confirm the customer is referring to payment ${input.payment.paymentId}.`,
    );
  }

  if (
    input.transaction
  ) {
    items.push(
      `Confirm the customer is referring to transaction ${input.transaction.id}.`,
    );
  }

  if (
    input.confirmedCause
  ) {
    items.push(
      `Explain only the verified cause: ${input.confirmedCause.label}.`,
    );
  } else {
    items.push(
      "Do not invent an exact cause. Tell the customer the final/non-final state that is verified.",
    );
  }

  if (
    input.signals.some(
      (signal) =>
        signal.code ===
        "wallet_restricted",
    )
  ) {
    items.push(
      "Do not unfreeze/unblock the wallet from Support. Route through the authorized security workflow.",
    );
  }

  if (
    input.signals.some(
      (signal) =>
        signal.code ===
        "checkout_verification_not_completed" ||
        signal.code ===
        "checkout_verification_attempt_limit",
    )
  ) {
    items.push(
      "If appropriate, ask the customer to begin a fresh checkout and complete the verification step; never request or expose an OTP/code.",
    );
  }

  if (
    input.escalation.required
  ) {
    items.push(
      `Escalate to ${input.escalation.team.replace("_", "/")} with the payment/transaction reference and evidence already collected.`,
    );
  } else {
    items.push(
      "After the recommended customer step, re-check the exact same reference before opening a new escalation.",
    );
  }

  return Array.from(
    new Set(items),
  );
}

function buildAgentSummary(input: {
  subjectKind: "payment" | "transaction" | "customer";
  subjectId: string;
  subjectStatus: string | null;
  confirmedCause: SupportCaseReport["confirmedCause"];
  signals: SupportCaseSignal[];
  escalation: SupportCaseReport["escalation"];
  customers: SupportCaseCustomerContext[];
}): string {
  const primaryCustomer =
    input.customers[0];

  const contextSignals =
    input.signals
      .filter(
        (signal) =>
          !signal.confirmedCause,
      )
      .slice(0, 4)
      .map(
        (signal) =>
          `- ${signal.title}: ${signal.detail}`,
      );

  return [
    `Deep case report: ${input.subjectKind} ${input.subjectId}`,
    input.subjectStatus
      ? `Verified state: ${input.subjectStatus}`
      : null,
    primaryCustomer
      ? `Customer: ${primaryCustomer.name} (${primaryCustomer.email || primaryCustomer.id})`
      : null,
    input.confirmedCause
      ? `Verified cause: ${input.confirmedCause.label}`
      : "Verified cause: no exact cause is proven by the current evidence.",
    contextSignals.length
      ? `Correlated context:\n${contextSignals.join("\n")}`
      : "Correlated context: no additional blocker/warning was found.",
    input.escalation.required
      ? `Escalation: ${input.escalation.team.replace("_", "/")} — ${input.escalation.reason}`
      : "Escalation: not mandatory from the current evidence.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function buildSupportCaseIntelligence(input: {
  payment?: PaymentContextInput | null;
  transaction?: TransactionContextInput | null;
  customerIds?: string[];
  primaryCustomerId?: string | null;
  historyLimit?: number;
}): Promise<SupportCaseReport> {
  const historyLimit =
    Math.min(
      12,
      Math.max(
        3,
        input.historyLimit ??
          6,
      ),
    );

  const customerIds =
    uniqueStrings([
      input.primaryCustomerId,
      ...(input.customerIds ??
        []),
      input.payment?.customerId,
      input.transaction?.sender?.id,
      input.transaction?.receiver?.id,
    ]).filter(
      (customerId) =>
        mongoose.Types.ObjectId.isValid(
          customerId,
        ),
    );

  const customerContexts =
    (
      await Promise.all(
        customerIds.map(
          (customerId) =>
            loadCustomerContext(
              customerId,
              historyLimit,
            ),
        ),
      )
    ).filter(
      (
        customer,
      ): customer is SupportCaseCustomerContext =>
        Boolean(customer),
    );

  if (
    input.primaryCustomerId
  ) {
    customerContexts.sort(
      (left, right) => {
        if (
          left.id ===
          input.primaryCustomerId
        ) {
          return -1;
        }

        if (
          right.id ===
          input.primaryCustomerId
        ) {
          return 1;
        }

        return 0;
      },
    );
  }

  const paymentLifecycle =
    input.payment
      ? await loadPaymentLifecycle(
          input.payment,
          historyLimit,
        )
      : null;

  const {
    signals,
    confirmedCause,
  } =
    buildSignals({
      payment:
        input.payment,
      transaction:
        input.transaction,
      customers:
        customerContexts,
      paymentLifecycle,
    });

  const escalation =
    chooseEscalation({
      payment:
        input.payment,
      transaction:
        input.transaction,
      signals,
      confirmedCause,
      paymentLifecycle,
    });

  const {
    resolution,
    verification,
    confidence,
  } =
    chooseResolution({
      payment:
        input.payment,
      transaction:
        input.transaction,
      confirmedCause,
      escalation,
    });

  const subjectKind =
    input.payment
      ? "payment"
      : input.transaction
        ? "transaction"
        : "customer";

  const subjectId =
    input.payment?.paymentId ??
    input.transaction?.id ??
    customerContexts[0]?.id ??
    "unknown";

  const subjectStatus =
    input.payment?.status ??
    input.transaction?.status ??
    null;

  const timeline:
    SupportCaseTimelineItem[] = [];

  if (
    input.payment
  ) {
    pushTimeline(
      timeline,
      {
        at:
          input.payment.timestamps.createdAt,
        category:
          "payment",
        label:
          `Payment created (${input.payment.status})`,
        reference:
          input.payment.paymentId,
      },
    );

    if (
      input.payment.timestamps.authorizedAt
    ) {
      pushTimeline(
        timeline,
        {
          at:
            input.payment.timestamps.authorizedAt,
          category:
            "payment",
          label:
            "Payment authorized",
          reference:
            input.payment.paymentId,
        },
      );
    }

    if (
      input.payment.timestamps.capturedAt
    ) {
      pushTimeline(
        timeline,
        {
          at:
            input.payment.timestamps.capturedAt,
          category:
            "payment",
          label:
            "Payment captured",
          reference:
            input.payment.paymentId,
        },
      );
    }

    if (
      input.payment.timestamps.failedAt
    ) {
      pushTimeline(
        timeline,
        {
          at:
            input.payment.timestamps.failedAt,
          category:
            "payment",
          label:
            "Payment marked failed",
          reference:
            input.payment.paymentId,
        },
      );
    }

    if (
      input.payment.timestamps.completedAt
    ) {
      pushTimeline(
        timeline,
        {
          at:
            input.payment.timestamps.completedAt,
          category:
            "payment",
          label:
            "Payment completed",
          reference:
            input.payment.paymentId,
        },
      );
    }
  }

  if (
    input.transaction?.timestamps.createdAt
  ) {
    pushTimeline(
      timeline,
      {
        at:
          input.transaction.timestamps.createdAt,
        category:
          "transaction",
        label:
          `Transaction created (${input.transaction.status}, risk ${input.transaction.riskScore})`,
        reference:
          input.transaction.id,
      },
    );
  }

  for (
    const attempt of
    paymentLifecycle?.attempts ??
    []
  ) {
    pushTimeline(
      timeline,
      {
        at:
          attempt.completedAt ??
          attempt.startedAt ??
          attempt.createdAt,
        category:
          "provider",
        label:
          `Payment attempt #${attempt.attemptNumber}: ${attempt.status}${attempt.failureCode ? ` (${attempt.failureCode})` : ""}`,
        reference:
          attempt.attemptId,
      },
    );
  }

  for (
    const providerEvent of
    paymentLifecycle?.providerTransactions ??
    []
  ) {
    pushTimeline(
      timeline,
      {
        at:
          providerEvent.providerCreatedAt ??
          providerEvent.createdAt,
        category:
          "provider",
        label:
          `${providerEvent.provider} ${providerEvent.transactionType}: ${providerEvent.status}`,
        reference:
          providerEvent.providerTransactionId,
      },
    );
  }

  for (
    const challenge of
    paymentLifecycle?.verificationChallenges ??
    []
  ) {
    pushTimeline(
      timeline,
      {
        at:
          challenge.consumedAt ??
          challenge.createdAt,
        category:
          "verification",
        label:
          challenge.consumedAt
            ? `Checkout ${challenge.channel} verification completed`
            : `Checkout ${challenge.channel} verification not completed`,
        reference:
          challenge.challengeId,
      },
    );
  }

  for (
    const customer of
    customerContexts
  ) {
    if (
      customer.kyc?.submittedAt
    ) {
      pushTimeline(
        timeline,
        {
          at:
            customer.kyc.submittedAt,
          category:
            "kyc",
          label:
            `${customer.name}: KYC submitted`,
          reference:
            customer.id,
        },
      );
    }

    if (
      customer.kyc?.verifiedAt
    ) {
      pushTimeline(
        timeline,
        {
          at:
            customer.kyc.verifiedAt,
          category:
            "kyc",
          label:
            `${customer.name}: KYC verified`,
          reference:
            customer.id,
        },
      );
    }

    for (
      const event of
      customer.recentSecurityEvents
    ) {
      pushTimeline(
        timeline,
        {
          at:
            event.createdAt,
          category:
            "security",
          label:
            `${customer.name}: ${event.title}`,
          reference:
            event.eventType,
        },
      );
    }

    for (
      const ticket of
      customer.recentSupportTickets
    ) {
      pushTimeline(
        timeline,
        {
          at:
            ticket.lastActivityAt,
          category:
            "support",
          label:
            `${ticket.ticketNumber}: ${ticket.subject} (${ticket.status})`,
          reference:
            ticket.ticketNumber,
        },
      );
    }
  }

  timeline.sort(
    (left, right) =>
      new Date(
        right.at,
      ).getTime() -
      new Date(
        left.at,
      ).getTime(),
  );

  const failureCode =
    normalizeFailureCode(
      confirmedCause?.code,
    );

  const customerFacingMessage =
    input.payment
      ? customerMessageForFailure({
          status:
            input.payment.status,
          failureCode,
          failureMessage:
            input.payment.failure?.message ??
            null,
          needsInternalEscalation:
            escalation.required,
        })
      : input.transaction
        ? input.transaction.status ===
          "COMPLETED"
          ? "The transaction is recorded as completed. Support can confirm the transaction reference and completion time."
          : input.transaction.status ===
              "PENDING"
            ? "The transaction is still pending and has not reached a final state. Support should monitor the same transaction reference and avoid promising success or failure until it updates."
            : escalation.required
              ? "The transaction is recorded as failed and needs internal review. Support will use the transaction reference and system evidence for escalation."
              : "The transaction is recorded as failed, but the exact reason is not stored in the current transaction evidence. Support should not guess the cause."
        : "Support found the customer context. Please provide the exact payment or transaction reference for a failure-specific conclusion.";

  const sources =
    Array.from(
      new Map(
        [
          ...(input.payment
            ? [
                {
                  type:
                    "support_payment_record",
                  label:
                    "Payment record",
                  reference:
                    input.payment.paymentId,
                },
              ]
            : []),

          ...(input.transaction
            ? [
                {
                  type:
                    "support_transaction_record",
                  label:
                    "Transaction record",
                  reference:
                    input.transaction.id,
                },
              ]
            : []),

          ...customerContexts.map(
            (customer) => ({
              type:
                "support_customer_record",
              label:
                "Customer account context",
              reference:
                customer.id,
            }),
          ),

          ...(paymentLifecycle?.attempts.map(
            (attempt) => ({
              type:
                "payment_attempt_record",
              label:
                "Payment attempt",
              reference:
                attempt.attemptId,
            }),
          ) ??
            []),

          ...(paymentLifecycle?.providerTransactions.map(
            (providerTransaction) => ({
              type:
                "provider_transaction_record",
              label:
                "Provider transaction",
              reference:
                providerTransaction.providerTransactionId,
            }),
          ) ??
            []),

          ...customerContexts.flatMap(
            (customer) =>
              customer.recentSupportTickets.map(
                (ticket) => ({
                  type:
                    "support_ticket_record",
                  label:
                    "Related support history",
                  reference:
                    ticket.ticketNumber,
                }),
              ),
          ),
        ].map(
          (source) => [
            `${source.type}:${source.reference}`,
            source,
          ],
        ),
      ).values(),
    );

  const suggestedActions:
    SupportCaseReport["suggestedActions"] =
    [
      {
        label:
          "Open Support Payments",
        href:
          "/dashboard/support-dashboard/payments",
      },
      {
        label:
          "Open Support Transactions",
        href:
          "/dashboard/support-dashboard/transactions",
      },
      {
        label:
          "Open Support Customers",
        href:
          "/dashboard/support-dashboard/customers",
      },
      {
        label:
          "Open Support Tickets",
        href:
          "/dashboard/support-dashboard/tickets",
      },
    ];

  if (
    escalation.required
  ) {
    suggestedActions.unshift({
      label:
        `Escalate to ${escalation.team.replace("_", "/")}`,
    });
  }

  return {
    subject: {
      kind:
        subjectKind,
      id:
        subjectId,
      status:
        subjectStatus,
    },

    resolution,
    verification,
    confidence,
    confirmedCause,
    signals,
    customers:
      customerContexts,
    paymentLifecycle,
    escalation,

    agentSummary:
      buildAgentSummary({
        subjectKind,
        subjectId,
        subjectStatus,
        confirmedCause,
        signals,
        escalation,
        customers:
          customerContexts,
      }),

    agentChecklist:
      makeAgentChecklist({
        payment:
          input.payment,
        transaction:
          input.transaction,
        confirmedCause,
        escalation,
        signals,
      }),

    customerFacingMessage,
    timeline:
      timeline.slice(
        0,
        30,
      ),
    sources,
    suggestedActions,
  };
}
