import type {
  SupportCaseReport,
  SupportCaseSignal,
} from "./supportCaseIntelligenceService.js";

export type SupportCaseSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type SupportCasePriority =
  | "urgent"
  | "high"
  | "medium"
  | "low";

export type SupportCaseQueue =
  | "support"
  | "payments"
  | "provider"
  | "risk_security"
  | "kyc"
  | "engineering";

export interface SupportCaseTriageDecision {
  severity: SupportCaseSeverity;
  priority: SupportCasePriority;
  queue: SupportCaseQueue;
  responseTargetMinutes: number;
  escalationRequired: boolean;
  autoEscalationAllowed: false;
  reasonCodes: string[];
  explanation: string;
}

function hasSignal(
  report: SupportCaseReport,
  code: string,
): boolean {
  return report.signals.some(
    (signal) =>
      signal.code === code,
  );
}

function hasSeverity(
  report: SupportCaseReport,
  severity:
    SupportCaseSignal["severity"],
): boolean {
  return report.signals.some(
    (signal) =>
      signal.severity ===
      severity,
  );
}

function failedAttemptCount(
  report: SupportCaseReport,
): number {
  return (
    report.paymentLifecycle?.attempts.filter(
      (attempt) =>
        attempt.status ===
        "failed",
    ).length ?? 0
  );
}

function hasProviderStateConflict(
  report: SupportCaseReport,
): boolean {
  const paymentState =
    report.subject.kind ===
      "payment"
      ? report.subject.status
          ?.trim()
          .toLowerCase() ??
        null
      : null;

  const providerStates =
    report.paymentLifecycle
      ?.providerTransactions.map(
        (item) =>
          item.status
            .trim()
            .toLowerCase(),
      ) ??
    [];

  if (
    !paymentState ||
    providerStates.length === 0
  ) {
    return false;
  }

  const providerHasFailure =
    providerStates.some(
      (state) =>
        [
          "failed",
          "cancelled",
        ].includes(state),
    );

  const providerHasSuccess =
    providerStates.some(
      (state) =>
        [
          "succeeded",
          "success",
          "completed",
          "captured",
        ].includes(state),
    );

  return (
    (
      paymentState ===
        "completed" &&
      providerHasFailure
    ) ||
    (
      [
        "failed",
        "cancelled",
      ].includes(
        paymentState,
      ) &&
      providerHasSuccess
    )
  );
}

function mapBaseQueue(
  report: SupportCaseReport,
): SupportCaseQueue {
  if (
    hasProviderStateConflict(
      report,
    )
  ) {
    return "engineering";
  }

  if (
    report.escalation.team ===
      "risk_security" ||
    hasSignal(
      report,
      "wallet_restricted",
    ) ||
    hasSignal(
      report,
      "recent_security_warning",
    ) &&
      hasSeverity(
        report,
        "blocker",
      ) ||
    hasSignal(
      report,
      "transaction_high_risk",
    )
  ) {
    return "risk_security";
  }

  if (
    report.escalation.team ===
      "provider" ||
    hasSignal(
      report,
      "provider_transaction_non_success",
    ) ||
    failedAttemptCount(
      report,
    ) >= 2
  ) {
    return "provider";
  }

  if (
    report.escalation.team ===
      "kyc"
  ) {
    return "kyc";
  }

  if (
    report.escalation.team ===
      "payments" ||
    (
      report.subject.kind ===
        "payment" &&
      report.resolution ===
        "insufficient_evidence"
    )
  ) {
    return "payments";
  }

  return "support";
}

function severityFor(
  report: SupportCaseReport,
  queue: SupportCaseQueue,
): SupportCaseSeverity {
  if (
    hasProviderStateConflict(
      report,
    )
  ) {
    return "critical";
  }

  if (
    queue ===
      "risk_security" &&
    (
      hasSignal(
        report,
        "wallet_restricted",
      ) ||
      report.confirmedCause?.code ===
        "risk_blocked"
    )
  ) {
    return "critical";
  }

  if (
    hasSeverity(
      report,
      "blocker",
    ) ||
    queue ===
      "provider" &&
      failedAttemptCount(
        report,
      ) >= 2
  ) {
    return "high";
  }

  if (
    report.resolution ===
      "needs_internal_escalation" ||
    report.verification ===
      "partial" ||
    queue ===
      "payments" ||
    queue ===
      "provider"
  ) {
    return "medium";
  }

  if (
    report.resolution ===
      "not_failed"
  ) {
    return "low";
  }

  return report.confirmedCause
    ? "medium"
    : "low";
}

function priorityFor(
  severity: SupportCaseSeverity,
): SupportCasePriority {
  switch (severity) {
    case "critical":
      return "urgent";

    case "high":
      return "high";

    case "medium":
      return "medium";

    default:
      return "low";
  }
}

function responseTargetFor(
  priority: SupportCasePriority,
): number {
  switch (priority) {
    case "urgent":
      return 15;

    case "high":
      return 30;

    case "medium":
      return 120;

    default:
      return 480;
  }
}

function reasonCodesFor(
  report: SupportCaseReport,
  queue: SupportCaseQueue,
): string[] {
  const codes =
    new Set<string>();

  if (
    hasProviderStateConflict(
      report,
    )
  ) {
    codes.add(
      "STATE_CONFLICT",
    );
  }

  if (
    report.confirmedCause
  ) {
    codes.add(
      "CONFIRMED_CAUSE",
    );
    codes.add(
      `CAUSE_${report.confirmedCause.code
        .toUpperCase()
        .replace(
          /[^A-Z0-9]+/g,
          "_",
        )}`,
    );
  } else {
    codes.add(
      "CAUSE_NOT_PROVEN",
    );
  }

  if (
    report.escalation.required
  ) {
    codes.add(
      "INTERNAL_ESCALATION_REQUIRED",
    );
  }

  if (
    failedAttemptCount(
      report,
    ) >= 2
  ) {
    codes.add(
      "REPEATED_FAILED_ATTEMPTS",
    );
  }

  for (
    const signal of
    report.signals
  ) {
    if (
      signal.severity ===
        "blocker" ||
      signal.severity ===
        "warning"
    ) {
      codes.add(
        `SIGNAL_${signal.code
          .toUpperCase()
          .replace(
            /[^A-Z0-9]+/g,
            "_",
          )}`,
      );
    }
  }

  codes.add(
    `QUEUE_${queue.toUpperCase()}`,
  );

  return [
    ...codes,
  ];
}

export function triageSupportCase(
  report: SupportCaseReport,
): SupportCaseTriageDecision {
  const queue =
    mapBaseQueue(
      report,
    );

  const severity =
    severityFor(
      report,
      queue,
    );

  const priority =
    priorityFor(
      severity,
    );

  const escalationRequired =
    report.escalation.required ||
    queue !== "support";

  const reasonCodes =
    reasonCodesFor(
      report,
      queue,
    );

  const explanation = [
    `Severity ${severity.toUpperCase()} / priority ${priority.toUpperCase()}.`,
    `Recommended queue: ${queue.replace(
      "_",
      "/",
    )}.`,
    report.confirmedCause
      ? `Verified cause: ${report.confirmedCause.label}.`
      : "No exact cause is proven by the current evidence.",
    escalationRequired
      ? "Internal handoff is recommended. Coffer AI does not perform the handoff automatically."
      : "First-line Support can continue with the current evidence.",
  ].join(" ");

  return {
    severity,
    priority,
    queue,
    responseTargetMinutes:
      responseTargetFor(
        priority,
      ),
    escalationRequired,
    autoEscalationAllowed:
      false,
    reasonCodes,
    explanation,
  };
}
