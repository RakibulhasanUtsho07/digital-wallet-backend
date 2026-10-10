import mongoose from "mongoose";

import {
  getSupportPaymentDetail,
  searchSupportPayments,
} from "../../../services/supportPaymentService.js";
import {
  getSupportTransactionDetail,
  searchSupportTransactions,
} from "../../../services/supportTransactionService.js";
import {
  getSupportCustomerProfile,
  searchSupportCustomers,
} from "../../../services/supportCustomerService.js";

import {
  buildSupportCaseIntelligence,
  type SupportCaseReport,
} from "./supportCaseIntelligenceService.js";

import {
  triageSupportCase,
} from "./supportCaseTriageService.js";

import {
  recommendSupportPlaybooks,
} from "../playbooks/supportPlaybookRecommendationService.js";

export interface SupportInvestigationResult {
  summary: string;
  verification: "verified" | "partial" | "unknown";
  confidence: "high" | "medium" | "low";
  facts: Array<{ label: string; value: string | number | boolean | null }>;
  sources: Array<{ type: string; label: string; reference: string }>;
  suggestedActions: Array<{ label: string; href?: string }>;
  data: Record<string, unknown>;
}

type SupportPayment = Awaited<ReturnType<typeof getSupportPaymentDetail>>;
type SupportTransaction = Awaited<ReturnType<typeof getSupportTransactionDetail>>;

type CustomerSearchRow = Awaited<ReturnType<typeof searchSupportCustomers>>["customers"][number];


function dedupeSources(
  sources: SupportInvestigationResult["sources"],
): SupportInvestigationResult["sources"] {
  return Array.from(
    new Map(
      sources.map(
        (source) => [
          `${source.type}:${source.reference}`,
          source,
        ],
      ),
    ).values(),
  );
}

function dedupeActions(
  actions: SupportInvestigationResult["suggestedActions"],
): SupportInvestigationResult["suggestedActions"] {
  return Array.from(
    new Map(
      actions.map(
        (action) => [
          `${action.label}:${action.href ?? ""}`,
          action,
        ],
      ),
    ).values(),
  );
}

function mergeCaseReport(
  base: SupportInvestigationResult,
  caseReport: SupportCaseReport,
): SupportInvestigationResult {
  const triage =
    triageSupportCase(
      caseReport,
    );

  return {
    ...base,

    summary: [
      base.summary,
      "",
      caseReport.agentSummary,
      "",
      `Customer-facing first response: ${caseReport.customerFacingMessage}`,
    ].join("\n"),

    verification:
      caseReport.verification === "verified"
        ? "verified"
        : base.verification === "verified"
          ? "verified"
          : caseReport.verification,

    confidence:
      caseReport.confidence === "high"
        ? "high"
        : base.confidence,

    facts: [
      ...base.facts,
      {
        label:
          "Case resolution",
        value:
          caseReport.resolution,
      },
      {
        label:
          "Internal escalation required",
        value:
          caseReport.escalation.required,
      },
      {
        label:
          "Escalation team",
        value:
          caseReport.escalation.team,
      },
      {
        label:
          "Correlated signals",
        value:
          caseReport.signals.length,
      },
      {
        label:
          "Auto severity",
        value:
          triage.severity,
      },
      {
        label:
          "Auto priority",
        value:
          triage.priority,
      },
      {
        label:
          "Recommended queue",
        value:
          triage.queue,
      },
      {
        label:
          "Response target (minutes)",
        value:
          triage.responseTargetMinutes,
      },
    ],

    sources:
      dedupeSources([
        ...base.sources,
        ...caseReport.sources,
      ]),

    suggestedActions:
      dedupeActions([
        ...(triage.escalationRequired
          ? [
              {
                label:
                  `Review ${triage.queue.replace("_", "/")} handoff`,
              },
            ]
          : []),
        {
          label:
            "Save to AI Support Case Workspace",
        },
        ...caseReport.suggestedActions,
        ...base.suggestedActions,
      ]),

    data: {
      ...base.data,
      caseReport,
      triage,
      playbooks:
        recommendSupportPlaybooks({
          report:
            caseReport,
          triage,
        }).map(
          (item) => ({
            playbookId:
              item.playbook.id,
            title:
              item.playbook.title,
            score:
              item.score,
            confidence:
              item.confidence,
            reasons:
              item.reasons,
            customerMessageTemplate:
              item.playbook.customerMessageTemplate,
            steps:
              item.playbook.steps,
          }),
        ),
    },
  };
}

async function enrichPaymentDiagnosis(
  payment: Exclude<SupportPayment, null>,
  base: SupportInvestigationResult,
  primaryCustomerId?: string | null,
): Promise<SupportInvestigationResult> {
  const caseReport =
    await buildSupportCaseIntelligence({
      payment: {
        id:
          payment.id,
        paymentId:
          payment.paymentId,
        customerId:
          payment.customerId ??
          payment.customer?.id ??
          null,
        sourceType:
          payment.sourceType,
        provider:
          payment.provider,
        status:
          payment.status,
        failure:
          payment.failure,
        timestamps:
          payment.timestamps,
      },
      customerIds: [
        payment.customerId ??
          payment.customer?.id ??
          "",
      ],
      primaryCustomerId:
        primaryCustomerId ??
        payment.customerId ??
        payment.customer?.id ??
        null,
    });

  return mergeCaseReport(
    base,
    caseReport,
  );
}

async function enrichTransactionDiagnosis(
  transaction: Exclude<SupportTransaction, null>,
  base: SupportInvestigationResult,
  primaryCustomerId?: string | null,
): Promise<SupportInvestigationResult> {
  const caseReport =
    await buildSupportCaseIntelligence({
      transaction: {
        id:
          transaction.id,
        status:
          transaction.status,
        type:
          transaction.type,
        riskScore:
          transaction.riskScore,
        sender:
          transaction.sender
            ? {
                id:
                  transaction.sender.id,
              }
            : null,
        receiver:
          transaction.receiver
            ? {
                id:
                  transaction.receiver.id,
              }
            : null,
        timestamps:
          transaction.timestamps,
      },
      customerIds: [
        transaction.sender?.id ??
          "",
        transaction.receiver?.id ??
          "",
      ],
      primaryCustomerId:
        primaryCustomerId ??
        null,
    });

  return mergeCaseReport(
    base,
    caseReport,
  );
}

const PAYMENT_ID_PATTERN = /\b(?:pay|payment|ch)_[a-z0-9_-]{6,120}\b/i;
const OBJECT_ID_PATTERN = /\b[0-9a-f]{24}\b/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?8801|01)[3-9]\d{8}/;

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 180);
}

function paymentFailureAdvice(code: string | null): string {
  const normalized = (code ?? "").trim().toLowerCase();

  switch (normalized) {
    case "insufficient_funds":
      return "First support: explain that the provider recorded insufficient funds. Ask the customer to verify available balance or use another funding source before retrying.";
    case "declined":
    case "card_declined":
    case "declined_by_bank":
      return "First support: explain that the provider/issuer declined the payment. Ask the customer to retry once or use another payment method; if repeated, contact the issuing bank/provider.";
    case "authentication_failed":
      return "First support: ask the customer to complete the required authentication step and retry from a fresh checkout session.";
    case "provider_timeout":
    case "provider_error":
    case "bank_unavailable":
      return "First support: this is provider-side processing evidence. Avoid repeated rapid retries; ask the customer to wait briefly and retry, then escalate with the payment reference if it repeats.";
    case "risk_blocked":
      return "First support: do not override the control. Escalate to the authorized risk/security workflow with this payment reference.";
    case "duplicate":
      return "First support: do not create repeated payment attempts until the existing payment state is verified.";
    case "expired":
      return "First support: the payment expired. Ask the customer to start a new payment attempt.";
    case "cancelled":
      return "First support: the payment was cancelled. Confirm whether the customer cancelled it; otherwise collect the reference and escalate if cancellation was unexpected.";
    case "validation_error":
      return "First support: the provider recorded a validation error. Re-check the submitted payment/checkout fields and retry with corrected information.";
    default:
      return "First support: use the recorded status and provider evidence below. If the exact reason is missing, do not guess; collect the reference and escalate with the evidence.";
  }
}

function diagnosePayment(payment: Exclude<SupportPayment, null>): SupportInvestigationResult {
  const status = payment.status.toLowerCase();
  const failureCode = payment.failure?.code ?? null;
  const failureMessage = payment.failure?.message ?? null;
  const customerLabel = payment.customer
    ? `${payment.customer.name} (${payment.customer.email || "no email"})`
    : "Guest / unlinked customer";

  let verification: SupportInvestigationResult["verification"] = "verified";
  let confidence: SupportInvestigationResult["confidence"] = "high";
  let cause = "";

  if (status === "completed") {
    cause = "The payment is recorded as completed successfully.";
  } else if (failureCode || failureMessage) {
    cause = `The payment is recorded as ${payment.status}. ${failureCode ? `Recorded failure code: ${failureCode}.` : ""} ${failureMessage ? `Provider message: ${failureMessage}.` : ""}`.trim();
  } else if (status === "cancelled") {
    cause = "The payment is recorded as cancelled.";
  } else if (status === "expired") {
    cause = "The payment is recorded as expired before completion.";
  } else if (["pending", "authorized", "captured"].includes(status)) {
    verification = "partial";
    confidence = "high";
    cause = `The payment has not failed in the database; it is currently ${payment.status} and has not reached the completed state yet.`;
  } else if (status === "failed") {
    verification = "partial";
    confidence = "medium";
    cause = "The payment is recorded as failed, but the payment record does not contain a verified failure code or provider message.";
  } else {
    verification = "unknown";
    confidence = "low";
    cause = `The payment is recorded as ${payment.status}, but the exact reason for non-completion is not available in the current evidence.`;
  }

  const supportAdvice = paymentFailureAdvice(failureCode ?? (status === "expired" ? "expired" : status === "cancelled" ? "cancelled" : null));

  return {
    summary: [
      `Payment ${payment.paymentId}`,
      `Customer: ${customerLabel}`,
      `Status: ${payment.status}`,
      `Diagnosis: ${cause}`,
      supportAdvice,
    ].join("\n"),
    verification,
    confidence,
    facts: [
      { label: "Payment ID", value: payment.paymentId },
      { label: "Status", value: payment.status },
      { label: "Provider", value: payment.provider },
      { label: "Source", value: payment.sourceType },
      { label: "Mode", value: payment.mode },
      { label: "Amount", value: payment.amount },
      { label: "Currency", value: payment.currency },
      { label: "Failure code", value: failureCode },
      { label: "Failure message", value: failureMessage },
      { label: "Customer", value: payment.customer?.name ?? null },
      { label: "Customer email", value: payment.customer?.email ?? null },
      { label: "Customer KYC", value: payment.customer?.kycStatus ?? null },
      { label: "Created at", value: payment.timestamps.createdAt },
      { label: "Failed at", value: payment.timestamps.failedAt },
      { label: "Completed at", value: payment.timestamps.completedAt },
    ],
    sources: [
      {
        type: "support_payment_record",
        label: "Support payment detail",
        reference: payment.paymentId,
      },
    ],
    suggestedActions: [
      { label: "Open Support Payments", href: "/dashboard/support-dashboard/payments" },
      ...(status !== "completed"
        ? [{ label: "Use the payment reference when escalating" }]
        : []),
    ],
    data: {
      kind: "payment",
      payment,
      firstSupport: supportAdvice,
    },
  };
}

function diagnoseTransaction(
  transaction: Exclude<SupportTransaction, null>,
): SupportInvestigationResult {
  const status = transaction.status.toUpperCase();
  let verification: SupportInvestigationResult["verification"] = "verified";
  let confidence: SupportInvestigationResult["confidence"] = "high";
  let diagnosis = "";
  let firstSupport = "";

  if (status === "COMPLETED") {
    diagnosis = "The transaction is recorded as completed successfully.";
    firstSupport = "First support: confirm completion time and reference with the customer.";
  } else if (status === "PENDING") {
    verification = "partial";
    diagnosis = "The transaction is still pending. The transaction schema does not record a verified pending reason.";
    firstSupport = "First support: explain that it has not reached a final state. Avoid promising success or failure; monitor the status and escalate if it remains pending beyond the platform SLA.";
  } else {
    verification = "partial";
    confidence = transaction.riskScore === "HIGH" ? "medium" : "low";
    diagnosis = "The transaction is recorded as FAILED, but this transaction record does not store a verified failure reason code.";
    firstSupport = transaction.riskScore === "HIGH"
      ? "First support: a HIGH risk score is also recorded. Treat that as context, not as the confirmed cause; route the case to the authorized risk/security review if needed."
      : "First support: do not invent a failure reason. Verify the sender/receiver account state and escalate with the transaction ID if no upstream failure evidence is available.";
  }

  return {
    summary: [
      `Transaction ${transaction.id}`,
      `Status: ${transaction.status}`,
      `Type: ${transaction.type}`,
      `Risk: ${transaction.riskScore}`,
      `Diagnosis: ${diagnosis}`,
      firstSupport,
    ].join("\n"),
    verification,
    confidence,
    facts: [
      { label: "Transaction ID", value: transaction.id },
      { label: "Status", value: transaction.status },
      { label: "Type", value: transaction.type },
      { label: "Risk score", value: transaction.riskScore },
      { label: "Currency", value: transaction.currency },
      { label: "Amount minor units", value: transaction.amountMinorUnits },
      { label: "Reference", value: transaction.reference },
      { label: "Sender", value: transaction.sender?.name ?? null },
      { label: "Sender email", value: transaction.sender?.email ?? null },
      { label: "Sender KYC", value: transaction.sender?.kycStatus ?? null },
      { label: "Receiver", value: transaction.receiver?.name ?? null },
      { label: "Receiver email", value: transaction.receiver?.email ?? null },
      { label: "Receiver KYC", value: transaction.receiver?.kycStatus ?? null },
      { label: "Created at", value: transaction.timestamps.createdAt },
      { label: "Updated at", value: transaction.timestamps.updatedAt },
    ],
    sources: [
      {
        type: "support_transaction_record",
        label: "Support transaction detail",
        reference: transaction.id,
      },
    ],
    suggestedActions: [
      { label: "Open Support Transactions", href: "/dashboard/support-dashboard/transactions" },
      ...(status !== "COMPLETED"
        ? [{ label: "Escalate with the transaction ID if status does not resolve" }]
        : []),
    ],
    data: {
      kind: "transaction",
      transaction,
      firstSupport,
    },
  };
}

function candidateSummary(customers: CustomerSearchRow[]): SupportInvestigationResult {
  const rows = customers.slice(0, 5);

  return {
    summary: [
      "Multiple matching customers were found. Use an exact email, customer ID, payment ID, or transaction ID before giving a payment-failure conclusion.",
      ...rows.map(
        (customer, index) =>
          `${index + 1}. ${customer.name} — ${customer.email || "no email"} — ${customer.id}`,
      ),
    ].join("\n"),
    verification: "verified",
    confidence: "high",
    facts: rows.map((customer) => ({
      label: customer.name,
      value: customer.email || customer.id,
    })),
    sources: rows.map((customer) => ({
      type: "support_customer_record",
      label: "Customer search result",
      reference: customer.id,
    })),
    suggestedActions: [
      { label: "Search with the exact email or customer ID" },
      { label: "Open Support Customers", href: "/dashboard/support-dashboard/customers" },
    ],
    data: {
      kind: "customer_candidates",
      customers: rows,
    },
  };
}

function extractExplicitName(message: string): string | null {
  const patterns = [
    /(?:customer\s+name|user\s+name|name)\s*(?:is|:|=|-)?\s*([a-z][a-z .'-]{1,80})/i,
    /(?:for|of|customer|user)\s+([a-z][a-z .'-]{1,80})/i,
    /(?:কাস্টমারের\s+নাম|কাস্টমার\s+নাম|নাম)\s*(?:হলো|হচ্ছে|:|=|-)?\s*([\u0980-\u09ff][\u0980-\u09ff .'-]{1,80})/i,
    /^([A-Za-z\u0980-\u09FF][A-Za-z\u0980-\u09FF .'-]{1,80})\s+(?:er|এর)\s+(?:payment|transaction|পেমেন্ট|ট্রানজেকশন|লেনদেন)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const candidate = clean(
        match[1]
          .replace(/\b(payment|transaction|failed|failure|pending|check|why|reason|not|successful|success)\b.*$/i, "")
          .replace(/(?:পেমেন্ট|ট্রানজেকশন|লেনদেন|ফেইল|ব্যর্থ|কেন|কারণ).*$/i, "")
          .trim(),
      );

      if (
        candidate.length >= 2 &&
        candidate.split(" ").length <= 6
      ) {
        return candidate;
      }
    }
  }

  return null;
}

function looksLikePlainName(message: string): boolean {
  const value = clean(message);
  if (!value || value.includes("@")) return false;
  if (PAYMENT_ID_PATTERN.test(value) || OBJECT_ID_PATTERN.test(value)) return false;
  const words = value.split(" ");
  return words.length >= 1 && words.length <= 5 && /^[A-Za-z\u0980-\u09FF .'-]+$/.test(value);
}

async function investigateCustomer(
  query: string,
  limit: number,
): Promise<SupportInvestigationResult | null> {
  const customerSearch = await searchSupportCustomers({
    search: query,
    page: 1,
    limit: Math.min(limit, 10),
  });

  if (customerSearch.customers.length === 0) return null;
  if (customerSearch.customers.length > 1) {
    return candidateSummary(customerSearch.customers);
  }

  const customer = customerSearch.customers[0];
  const profile = await getSupportCustomerProfile(customer.id);
  const searchValue = customer.email || customer.id;

  const [payments, transactions] = await Promise.all([
    searchSupportPayments({ search: searchValue, page: 1, limit }),
    searchSupportTransactions({ search: customer.email || customer.name, page: 1, limit }),
  ]);

  const unsuccessfulPayment = payments.payments.find((payment) =>
    ["failed", "pending", "authorized", "captured", "cancelled", "expired"].includes(
      payment.status.toLowerCase(),
    ),
  );

  if (unsuccessfulPayment) {
    const detail = await getSupportPaymentDetail(unsuccessfulPayment.paymentId);
    if (detail) {
      const diagnosis = await enrichPaymentDiagnosis(
        detail,
        diagnosePayment(detail),
        customer.id,
      );
      return {
        ...diagnosis,
        summary: [
          `Customer matched: ${customer.name} (${customer.email || customer.id})`,
          "Latest matching payment requiring support attention:",
          diagnosis.summary,
        ].join("\n"),
        data: {
          ...diagnosis.data,
          customer: profile ?? customer,
          recentPayments: payments.payments.slice(0, limit),
          recentTransactions: transactions.transactions.slice(0, limit),
        },
      };
    }
  }

  const unsuccessfulTransaction = transactions.transactions.find((transaction) =>
    transaction.status !== "COMPLETED",
  );

  if (unsuccessfulTransaction) {
    const detail = await getSupportTransactionDetail(unsuccessfulTransaction.id);
    if (detail) {
      const diagnosis = await enrichTransactionDiagnosis(
        detail,
        diagnoseTransaction(detail),
        customer.id,
      );
      return {
        ...diagnosis,
        summary: [
          `Customer matched: ${customer.name} (${customer.email || customer.id})`,
          "Latest matching transaction requiring support attention:",
          diagnosis.summary,
        ].join("\n"),
        data: {
          ...diagnosis.data,
          customer: profile ?? customer,
          recentPayments: payments.payments.slice(0, limit),
          recentTransactions: transactions.transactions.slice(0, limit),
        },
      };
    }
  }

  const baseSummary: SupportInvestigationResult = {
    summary: `Customer ${customer.name} was found. No recent failed/pending payment or non-completed transaction was found in the first ${limit} matching records. Ask for the exact payment ID or transaction ID if the customer is referring to a specific attempt.`,
    verification: "verified",
    confidence: "high",
    facts: [
      { label: "Customer", value: customer.name },
      { label: "Email", value: customer.email },
      { label: "Customer ID", value: customer.id },
      { label: "KYC", value: customer.kycStatus },
      { label: "Wallet linked", value: customer.walletLinked },
      { label: "Matching payments", value: payments.total },
      { label: "Matching transactions", value: transactions.total },
    ],
    sources: [
      { type: "support_customer_record", label: "Customer profile", reference: customer.id },
    ],
    suggestedActions: [
      { label: "Ask for the exact payment ID or transaction ID" },
      { label: "Open Support Customers", href: "/dashboard/support-dashboard/customers" },
    ],
    data: {
      kind: "customer_summary",
      customer: profile ?? customer,
      recentPayments: payments.payments.slice(0, limit),
      recentTransactions: transactions.transactions.slice(0, limit),
    },
  };

  const caseReport =
    await buildSupportCaseIntelligence({
      customerIds: [
        customer.id,
      ],
      primaryCustomerId:
        customer.id,
      historyLimit:
        limit,
    });

  return mergeCaseReport(
    baseSummary,
    caseReport,
  );
}

export async function investigateSupportIssue(input: {
  message: string;
  resourceId?: string | null;
  limit?: number;
}): Promise<SupportInvestigationResult> {
  const message = clean(input.message);
  const limit = Math.min(12, Math.max(3, input.limit ?? 8));
  const paymentId = input.resourceId?.match(PAYMENT_ID_PATTERN)?.[0] ?? message.match(PAYMENT_ID_PATTERN)?.[0] ?? null;
  const objectId = input.resourceId?.match(OBJECT_ID_PATTERN)?.[0] ?? message.match(OBJECT_ID_PATTERN)?.[0] ?? null;
  const email = message.match(EMAIL_PATTERN)?.[0] ?? null;
  const phone = message.replace(/[\s()-]/g, "").match(PHONE_PATTERN)?.[0] ?? null;

  if (paymentId) {
    const detail = await getSupportPaymentDetail(paymentId);
    if (detail) return enrichPaymentDiagnosis(detail, diagnosePayment(detail));

    const matches = await searchSupportPayments({ search: paymentId, page: 1, limit });
    if (matches.payments.length === 1) {
      const exact = await getSupportPaymentDetail(matches.payments[0].paymentId);
      if (exact) return enrichPaymentDiagnosis(exact, diagnosePayment(exact));
    }

    return {
      summary: `No payment record matched ${paymentId}. Verify the payment ID or search by customer email/name or transaction ID.`,
      verification: "verified",
      confidence: "high",
      facts: [{ label: "Payment ID searched", value: paymentId }],
      sources: [],
      suggestedActions: [{ label: "Verify the payment ID and try again" }],
      data: { kind: "not_found", query: paymentId },
    };
  }

  if (objectId && mongoose.isValidObjectId(objectId)) {
    const transaction = await getSupportTransactionDetail(objectId);
    if (transaction) return enrichTransactionDiagnosis(transaction, diagnoseTransaction(transaction));

    const customer = await getSupportCustomerProfile(objectId);
    if (customer) {
      const byCustomer = await investigateCustomer(customer.email || customer.name, limit);
      if (byCustomer) return byCustomer;
    }
  }

  const explicitName = extractExplicitName(message);
  const customerQuery = email ?? phone ?? explicitName ?? (looksLikePlainName(message) ? message : null);

  if (customerQuery) {
    const customerResult = await investigateCustomer(customerQuery, limit);
    if (customerResult) return customerResult;
  }

  // As a last read-only lookup, use the whole short query against both support
  // search services. This catches idempotency keys/provider references that do
  // not match the standard payment-id patterns.
  if (message.length <= 120) {
    const [payments, transactions] = await Promise.all([
      searchSupportPayments({ search: message, page: 1, limit }),
      searchSupportTransactions({ search: message, page: 1, limit }),
    ]);

    if (payments.payments.length === 1) {
      const detail = await getSupportPaymentDetail(payments.payments[0].paymentId);
      if (detail) return enrichPaymentDiagnosis(detail, diagnosePayment(detail));
    }

    if (transactions.transactions.length === 1) {
      const detail = await getSupportTransactionDetail(transactions.transactions[0].id);
      if (detail) return enrichTransactionDiagnosis(detail, diagnoseTransaction(detail));
    }
  }

  return {
    summary: [
      "I can investigate this as first-line support, but I need one reliable lookup value.",
      "Provide any one of: payment ID, transaction ID, customer email, customer ID, or customer name.",
      "For a customer name with multiple matches, I will return candidates and require an exact customer before giving a failure conclusion.",
    ].join("\n"),
    verification: "unknown",
    confidence: "low",
    facts: [],
    sources: [],
    suggestedActions: [
      { label: "Provide payment ID / transaction ID / customer email / name" },
    ],
    data: { kind: "clarification_required" },
  };
}
