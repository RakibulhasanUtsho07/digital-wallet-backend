import type {
  AiDiagnosis,
  AiDiagnosisCause,
  AiOwnedPaymentEvidence,
  AiPossibleDiagnosisCause,
  AiPaymentSubjectType,
  AiSuggestedAction,
} from "../types/cofferAi.types.js";

interface FailureReasonDefinition {
  code: string;
  label: string;
}

const FAILURE_REASON_REGISTRY: Readonly<
  Record<string, FailureReasonDefinition>
> = {
  provider_error: {
    code: "PAYMENT_PROVIDER_ERROR",
    label: "The payment provider recorded a processing error.",
  },
  insufficient_funds: {
    code: "INSUFFICIENT_FUNDS",
    label: "The payment provider recorded insufficient available funds.",
  },
  card_declined: {
    code: "CARD_DECLINED",
    label: "The payment method was declined by the provider.",
  },
  declined_by_bank: {
    code: "DECLINED_BY_BANK",
    label: "The issuing bank declined the payment.",
  },
  declined: {
    code: "PAYMENT_DECLINED",
    label: "The payment provider recorded the payment as declined.",
  },
  expired_card: {
    code: "EXPIRED_PAYMENT_METHOD",
    label: "The payment method was recorded as expired.",
  },
  authentication_failed: {
    code: "PAYMENT_AUTHENTICATION_FAILED",
    label: "The provider recorded a failed payment authentication step.",
  },
  limit_exceeded: {
    code: "PAYMENT_LIMIT_EXCEEDED",
    label: "The provider recorded that a payment limit was exceeded.",
  },
  duplicate: {
    code: "DUPLICATE_PAYMENT",
    label: "The provider recorded this request as a duplicate payment.",
  },
  provider_timeout: {
    code: "PAYMENT_PROVIDER_TIMEOUT",
    label: "The provider recorded a timeout while processing the payment.",
  },
  bank_unavailable: {
    code: "BANK_TEMPORARILY_UNAVAILABLE",
    label: "The provider recorded that the bank was temporarily unavailable.",
  },
  cancelled: {
    code: "PAYMENT_CANCELLED",
    label: "The payment is recorded as cancelled.",
  },
  expired: {
    code: "PAYMENT_EXPIRED",
    label: "The payment is recorded as expired.",
  },
  validation_error: {
    code: "PAYMENT_VALIDATION_ERROR",
    label: "The payment provider recorded a validation failure.",
  },
  risk_blocked: {
    code: "PAYMENT_RISK_BLOCKED",
    label: "The payment was blocked by a recorded risk control.",
  },
};

function normalizeCode(value: string | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
}

function normalizeState(value: string): string {
  return value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

function stateCause(
  state: string,
  subjectType: AiPaymentSubjectType,
): AiDiagnosisCause | undefined {
  const subject =
    subjectType === "wallet_transaction"
      ? "transaction"
      : "payment";

  if (["completed", "succeeded", "success", "paid"].includes(state)) {
    return {
      code: "PAYMENT_COMPLETED_RECORDED",
      label: `The ${subject} is recorded as completed.`,
      evidenceRefs: ["resource.state"],
    };
  }

  if (["reversed", "voided"].includes(state)) {
    return {
      code: "PAYMENT_REVERSED_RECORDED",
      label: `The ${subject} is recorded as reversed.`,
      evidenceRefs: ["resource.state"],
    };
  }

  if (["refunded", "refund_completed"].includes(state)) {
    return {
      code: "PAYMENT_REFUNDED_RECORDED",
      label: `The ${subject} is recorded as refunded.`,
      evidenceRefs: ["resource.state"],
    };
  }

  return undefined;
}

function possibleStateCause(
  state: string,
  subjectType: AiPaymentSubjectType,
): AiPossibleDiagnosisCause | undefined {
  const subject =
    subjectType === "wallet_transaction"
      ? "transaction"
      : "payment";

  if (
    [
      "pending",
      "processing",
      "initiated",
      "authorized",
      "captured",
    ].includes(state)
  ) {
    return {
      code: "PAYMENT_NOT_FINAL",
      label:
        `The ${subject} has not reached a final state yet. No more specific recorded cause is available.`,
      confidence: "high",
      evidenceRefs: ["resource.state"],
    };
  }

  if (["failed", "declined", "cancelled", "canceled"].includes(state)) {
    return {
      code: "PAYMENT_FAILED_WITHOUT_RECORDED_REASON",
      label:
        `The ${subject} is in a failed state, but the available record does not contain a verified reason code.`,
      confidence: "medium",
      evidenceRefs: ["resource.state"],
    };
  }

  return undefined;
}

function nextStepsFor(
  evidence: AiOwnedPaymentEvidence,
): ReadonlyArray<AiSuggestedAction> {
  const state = normalizeState(evidence.state);
  const actions: AiSuggestedAction[] = [
    {
      label:
        evidence.subjectType ===
        "wallet_transaction"
          ? "Review transaction details"
          : "Review payment details",
      href: "/dashboard/transactions",
    },
  ];

  if (
    [
      "pending",
      "processing",
      "initiated",
      "authorized",
      "captured",
    ].includes(state)
  ) {
    actions.push({
      label: "Check again after the payment status updates",
    });
  }

  if (["failed", "declined", "cancelled", "canceled"].includes(state)) {
    actions.push({
      label: "Contact support with this payment reference",
      href: "/dashboard/support",
    });
  }

  return actions;
}

export function diagnosePayment(
  evidence: AiOwnedPaymentEvidence,
): AiDiagnosis {
  const state = normalizeState(evidence.state);
  const failureCode = normalizeCode(evidence.failureCode);
  const recordedFailure = failureCode
    ? FAILURE_REASON_REGISTRY[failureCode]
    : undefined;

  const exactCause: AiDiagnosisCause | undefined = recordedFailure
    ? {
        code: recordedFailure.code,
        label: recordedFailure.label,
        evidenceRefs: ["payment.failureCode"],
      }
    : stateCause(
        state,
        evidence.subjectType,
      );

  const possibleCause = exactCause
    ? undefined
    : possibleStateCause(
        state,
        evidence.subjectType,
      );

  return {
    subjectType:
      evidence.subjectType,
    subjectId: evidence.paymentId,
    state,
    exactCause,
    possibleCauses: possibleCause ? [possibleCause] : [],
    nextSteps: nextStepsFor(evidence),
    verified: Boolean(exactCause && exactCause.evidenceRefs.length > 0),
  };
}
