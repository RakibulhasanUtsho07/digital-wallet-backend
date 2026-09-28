import crypto from "node:crypto";

import {
  AiSupportAlert,
  type AiSupportAlertSeverity,
  type AiSupportAlertStatus,
  type AiSupportAlertType,
} from "../../../models/AiSupportAlert.js";
import {
  AiSupportCase,
} from "../../../models/AiSupportCase.js";
import {
  AiSupportIncident,
} from "../../../models/AiSupportIncident.js";
import {
  PaymentAttempt,
} from "../../../models/PaymentAttempt.js";
import {
  ProviderTransaction,
} from "../../../models/ProviderTransaction.js";
import {
  CofferAiError,
} from "../errors/cofferAiError.js";

export interface SupportAlertRuleConfig {
  currentWindowMinutes: number;
  baselineWindowMinutes: number;
  minimumCurrentSamples: number;
  minimumCurrentFailures: number;
  mediumRateDeltaPoints: number;
  highRateDeltaPoints: number;
  criticalRateDeltaPoints: number;
  mediumMultiplier: number;
  highMultiplier: number;
  criticalMultiplier: number;
}

export interface SupportAlertEvaluation {
  evaluatedAt: string;
  currentWindowMinutes: number;
  baselineWindowMinutes: number;
  generated: Array<{
    alertId: string;
    type: AiSupportAlertType;
    severity: AiSupportAlertSeverity;
    title: string;
    fingerprint: string;
  }>;
  resolved: string[];
  metrics: {
    paymentAttemptsCurrent: number;
    paymentFailuresCurrent: number;
    paymentFailureRateCurrent: number;
    paymentAttemptsBaseline: number;
    paymentFailuresBaseline: number;
    paymentFailureRateBaseline: number;
    activeCases: number;
    breachedCases: number;
    highRiskSlaCases: number;
    openIncidents: number;
  };
}

interface RateEvidence {
  currentWindowMinutes: number;
  baselineWindowMinutes: number;
  currentTotal: number;
  currentFailures: number;
  currentRate: number;
  baselineTotal: number;
  baselineFailures: number;
  baselineRate: number;
  deltaRatePoints: number;
  multiplier: number | null;
}

interface CandidateAlert {
  type: AiSupportAlertType;
  severity: AiSupportAlertSeverity;
  fingerprint: string;
  title: string;
  summary: string;
  source: {
    provider: string | null;
    failureCode: string | null;
    queue: string | null;
  };
  evidence: RateEvidence;
  reasonCodes: string[];
}

const DEFAULT_RULES: SupportAlertRuleConfig = {
  currentWindowMinutes: 15,
  baselineWindowMinutes: 60,
  minimumCurrentSamples: 8,
  minimumCurrentFailures: 3,
  mediumRateDeltaPoints: 12,
  highRateDeltaPoints: 20,
  criticalRateDeltaPoints: 30,
  mediumMultiplier: 1.5,
  highMultiplier: 2,
  criticalMultiplier: 3,
};

function roundRate(
  value: number,
): number {
  return Number(
    value.toFixed(2),
  );
}

function ratePercent(
  failures: number,
  total: number,
): number {
  if (
    total <=
    0
  ) {
    return 0;
  }

  return roundRate(
    failures /
      total *
      100,
  );
}

function rateMultiplier(
  currentRate: number,
  baselineRate: number,
): number | null {
  if (
    baselineRate <=
    0
  ) {
    return currentRate >
      0
      ? null
      : 1;
  }

  return roundRate(
    currentRate /
      baselineRate,
  );
}

function makeFingerprint(
  type: AiSupportAlertType,
  parts: Array<string | null | undefined>,
): string {
  const normalized =
    [
      type,
      ...parts.map(
        (value) =>
          value
            ?.trim()
            .toLowerCase() ||
          "-",
      ),
    ].join("|");

  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 24);
}

function makeAlertId(): string {
  const now =
    new Date();

  const date =
    `${now.getUTCFullYear()}${String(
      now.getUTCMonth() +
        1,
    ).padStart(
      2,
      "0",
    )}${String(
      now.getUTCDate(),
    ).padStart(
      2,
      "0",
    )}`;

  return `ALT-${date}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function chooseSpikeSeverity(
  evidence: RateEvidence,
  rules: SupportAlertRuleConfig,
): AiSupportAlertSeverity | null {
  if (
    evidence.currentFailures <
      rules.minimumCurrentFailures ||
    evidence.currentTotal <
      rules.minimumCurrentSamples
  ) {
    return null;
  }

  const multiplier =
    evidence.multiplier;

  const critical =
    evidence.deltaRatePoints >=
      rules.criticalRateDeltaPoints &&
    (
      multiplier ===
        null ||
      multiplier >=
        rules.criticalMultiplier
    );

  if (
    critical
  ) {
    return "critical";
  }

  const high =
    evidence.deltaRatePoints >=
      rules.highRateDeltaPoints &&
    (
      multiplier ===
        null ||
      multiplier >=
        rules.highMultiplier
    );

  if (
    high
  ) {
    return "high";
  }

  const medium =
    evidence.deltaRatePoints >=
      rules.mediumRateDeltaPoints &&
    (
      multiplier ===
        null ||
      multiplier >=
        rules.mediumMultiplier
    );

  return medium
    ? "medium"
    : null;
}

function evidenceFromCounts(input: {
  currentWindowMinutes: number;
  baselineWindowMinutes: number;
  currentTotal: number;
  currentFailures: number;
  baselineTotal: number;
  baselineFailures: number;
}): RateEvidence {
  const currentRate =
    ratePercent(
      input.currentFailures,
      input.currentTotal,
    );

  const baselineRate =
    ratePercent(
      input.baselineFailures,
      input.baselineTotal,
    );

  return {
    currentWindowMinutes:
      input.currentWindowMinutes,
    baselineWindowMinutes:
      input.baselineWindowMinutes,
    currentTotal:
      input.currentTotal,
    currentFailures:
      input.currentFailures,
    currentRate,
    baselineTotal:
      input.baselineTotal,
    baselineFailures:
      input.baselineFailures,
    baselineRate,
    deltaRatePoints:
      roundRate(
        currentRate -
          baselineRate,
      ),
    multiplier:
      rateMultiplier(
        currentRate,
        baselineRate,
      ),
  };
}

function normalizedStatus(
  value: string | null | undefined,
): string {
  return value
    ?.trim()
    .toLowerCase() ??
    "";
}

function isFailureStatus(
  value: string | null | undefined,
): boolean {
  return [
    "failed",
    "failure",
    "cancelled",
    "error",
  ].includes(
    normalizedStatus(
      value,
    ),
  );
}

async function loadAttemptWindow(
  start: Date,
  end: Date,
) {
  return PaymentAttempt.find({
    createdAt: {
      $gte:
        start,
      $lt:
        end,
    },
  })
    .select(
      "provider status failureCode createdAt",
    )
    .lean();
}

async function loadProviderWindow(
  start: Date,
  end: Date,
) {
  return ProviderTransaction.find({
    createdAt: {
      $gte:
        start,
      $lt:
        end,
    },
  })
    .select(
      "provider status createdAt",
    )
    .lean();
}

function candidateFromRate(input: {
  type: AiSupportAlertType;
  title: string;
  summaryPrefix: string;
  source: CandidateAlert["source"];
  evidence: RateEvidence;
  rules: SupportAlertRuleConfig;
  reasonCodes: string[];
}): CandidateAlert | null {
  const severity =
    chooseSpikeSeverity(
      input.evidence,
      input.rules,
    );

  if (
    !severity
  ) {
    return null;
  }

  const sourceLabel =
    input.source.provider ??
    input.source.failureCode ??
    input.source.queue ??
    "platform";

  return {
    type:
      input.type,
    severity,
    fingerprint:
      makeFingerprint(
        input.type,
        [
          sourceLabel,
        ],
      ),
    title:
      input.title,
    summary:
      `${input.summaryPrefix} Current failure rate is ${input.evidence.currentRate}% (${input.evidence.currentFailures}/${input.evidence.currentTotal}) versus ${input.evidence.baselineRate}% (${input.evidence.baselineFailures}/${input.evidence.baselineTotal}) in the baseline window. This is an operational signal, not a proven root cause.`,
    source:
      input.source,
    evidence:
      input.evidence,
    reasonCodes:
      input.reasonCodes,
  };
}

function countByProvider(
  rows: Array<{
    provider?: string;
    status?: string;
  }>,
) {
  const result =
    new Map<
      string,
      {
        total: number;
        failures: number;
      }
    >();

  for (
    const row of
    rows
  ) {
    const provider =
      row.provider
        ?.trim()
        .toLowerCase() ||
      "unknown";

    const stats =
      result.get(
        provider,
      ) ?? {
        total: 0,
        failures: 0,
      };

    stats.total += 1;

    if (
      isFailureStatus(
        row.status,
      )
    ) {
      stats.failures += 1;
    }

    result.set(
      provider,
      stats,
    );
  }

  return result;
}

function countFailureCodes(
  rows: Array<{
    failureCode?: string | null;
    status?: string;
  }>,
) {
  const result =
    new Map<
      string,
      number
    >();

  for (
    const row of
    rows
  ) {
    if (
      !isFailureStatus(
        row.status,
      )
    ) {
      continue;
    }

    const code =
      row.failureCode
        ?.trim()
        .toLowerCase();

    if (
      !code
    ) {
      continue;
    }

    result.set(
      code,
      (
        result.get(
          code,
        ) ??
        0
      ) +
        1,
    );
  }

  return result;
}

function scaledBaselineCount(
  baselineCount: number,
  baselineWindowMinutes: number,
  currentWindowMinutes: number,
): number {
  if (
    baselineWindowMinutes <=
    0
  ) {
    return 0;
  }

  return baselineCount *
    (
      currentWindowMinutes /
      baselineWindowMinutes
    );
}

async function upsertAlert(
  candidate: CandidateAlert,
): Promise<{
  alertId: string;
  created: boolean;
}> {
  const now =
    new Date();

  const existing =
    await AiSupportAlert.findOne({
      fingerprint:
        candidate.fingerprint,
      status: {
        $in: [
          "open",
          "acknowledged",
        ],
      },
    });

  if (
    existing
  ) {
    existing.type =
      candidate.type;
    existing.severity =
      candidate.severity;
    existing.title =
      candidate.title;
    existing.summary =
      candidate.summary;
    existing.source =
      candidate.source;
    existing.evidence =
      candidate.evidence;
    existing.reasonCodes =
      candidate.reasonCodes;
    existing.lastDetectedAt =
      now;

    await existing.save();

    return {
      alertId:
        existing.alertId,
      created:
        false,
    };
  }

  const created =
    await AiSupportAlert.create({
      alertId:
        makeAlertId(),
      fingerprint:
        candidate.fingerprint,
      type:
        candidate.type,
      severity:
        candidate.severity,
      status:
        "open",
      title:
        candidate.title,
      summary:
        candidate.summary,
      source:
        candidate.source,
      evidence:
        candidate.evidence,
      reasonCodes:
        candidate.reasonCodes,
      firstDetectedAt:
        now,
      lastDetectedAt:
        now,
      acknowledgedAt:
        null,
      acknowledgedByUserId:
        null,
      resolvedAt:
        null,
    });

  return {
    alertId:
      created.alertId,
    created:
      true,
  };
}

async function resolveInactiveAlerts(
  activeFingerprints: string[],
): Promise<string[]> {
  const rows =
    await AiSupportAlert.find({
      status: {
        $in: [
          "open",
          "acknowledged",
        ],
      },
      fingerprint: {
        $nin:
          activeFingerprints,
      },
      type: {
        $in: [
          "payment_failure_rate_spike",
          "provider_failure_spike",
          "failure_code_spike",
          "support_case_inflow_spike",
          "sla_pressure",
          "critical_incident",
        ],
      },
    });

  const resolved: string[] =
    [];

  for (
    const row of
    rows
  ) {
    row.status =
      "resolved";
    row.resolvedAt =
      new Date();

    await row.save();

    resolved.push(
      row.alertId,
    );
  }

  return resolved;
}

export async function evaluateSupportProactiveAlerts(input?: {
  rules?: Partial<SupportAlertRuleConfig>;
}): Promise<SupportAlertEvaluation> {
  const rules: SupportAlertRuleConfig = {
    ...DEFAULT_RULES,
    ...input?.rules,
  };

  const now =
    new Date();

  const currentStart =
    new Date(
      now.getTime() -
        rules.currentWindowMinutes *
          60_000,
    );

  const baselineEnd =
    currentStart;

  const baselineStart =
    new Date(
      baselineEnd.getTime() -
        rules.baselineWindowMinutes *
          60_000,
    );

  const [
    currentAttempts,
    baselineAttempts,
    currentProviderTransactions,
    baselineProviderTransactions,
    activeCases,
    currentCaseCount,
    baselineCaseCount,
    openIncidents,
  ] =
    await Promise.all([
      loadAttemptWindow(
        currentStart,
        now,
      ),

      loadAttemptWindow(
        baselineStart,
        baselineEnd,
      ),

      loadProviderWindow(
        currentStart,
        now,
      ),

      loadProviderWindow(
        baselineStart,
        baselineEnd,
      ),

      AiSupportCase.find({
        status: {
          $in: [
            "open",
            "investigating",
            "waiting_customer",
            "escalated",
          ],
        },
      })
        .select(
          "status severity priority slaDueAt firstResponseAt createdAt responseTargetMinutes",
        )
        .lean(),

      AiSupportCase.countDocuments({
        createdAt: {
          $gte:
            currentStart,
          $lt:
            now,
        },
      }),

      AiSupportCase.countDocuments({
        createdAt: {
          $gte:
            baselineStart,
          $lt:
            baselineEnd,
        },
      }),

      AiSupportIncident.find({
        status: {
          $nin: [
            "resolved",
            "closed",
          ],
        },
      })
        .select(
          "incidentId severity title queue caseCount",
        )
        .lean(),
    ]);

  const candidates:
    CandidateAlert[] =
    [];

  const currentAttemptFailures =
    currentAttempts.filter(
      (row) =>
        isFailureStatus(
          row.status,
        ),
    ).length;

  const baselineAttemptFailures =
    baselineAttempts.filter(
      (row) =>
        isFailureStatus(
          row.status,
        ),
    ).length;

  const globalEvidence =
    evidenceFromCounts({
      currentWindowMinutes:
        rules.currentWindowMinutes,
      baselineWindowMinutes:
        rules.baselineWindowMinutes,
      currentTotal:
        currentAttempts.length,
      currentFailures:
        currentAttemptFailures,
      baselineTotal:
        baselineAttempts.length,
      baselineFailures:
        baselineAttemptFailures,
    });

  const globalCandidate =
    candidateFromRate({
      type:
        "payment_failure_rate_spike",
      title:
        "Payment failure rate spike detected",
      summaryPrefix:
        "Recent payment-attempt failures are materially above the prior baseline.",
      source: {
        provider:
          null,
        failureCode:
          null,
        queue:
          "payments",
      },
      evidence:
        globalEvidence,
      rules,
      reasonCodes: [
        "PAYMENT_FAILURE_RATE_SPIKE",
        "DETERMINISTIC_RATE_COMPARISON",
      ],
    });

  if (
    globalCandidate
  ) {
    candidates.push(
      globalCandidate,
    );
  }

  const currentProviders =
    countByProvider(
      [
        ...currentAttempts,
        ...currentProviderTransactions,
      ],
    );

  const baselineProviders =
    countByProvider(
      [
        ...baselineAttempts,
        ...baselineProviderTransactions,
      ],
    );

  for (
    const [
      provider,
      current,
    ] of
    currentProviders.entries()
  ) {
    const baseline =
      baselineProviders.get(
        provider,
      ) ?? {
        total: 0,
        failures: 0,
      };

    const evidence =
      evidenceFromCounts({
        currentWindowMinutes:
          rules.currentWindowMinutes,
        baselineWindowMinutes:
          rules.baselineWindowMinutes,
        currentTotal:
          current.total,
        currentFailures:
          current.failures,
        baselineTotal:
          baseline.total,
        baselineFailures:
          baseline.failures,
      });

    const candidate =
      candidateFromRate({
        type:
          "provider_failure_spike",
        title:
          `${provider} failure spike detected`,
        summaryPrefix:
          `The ${provider} provider has a recent failure-rate increase.`,
        source: {
          provider,
          failureCode:
            null,
          queue:
            "provider",
        },
        evidence,
        rules: {
          ...rules,
          minimumCurrentSamples:
            Math.max(
              5,
              Math.floor(
                rules.minimumCurrentSamples /
                  2,
              ),
            ),
        },
        reasonCodes: [
          "PROVIDER_FAILURE_SPIKE",
          `PROVIDER_${provider
            .toUpperCase()
            .replace(
              /[^A-Z0-9]+/g,
              "_",
            )}`,
        ],
      });

    if (
      candidate
    ) {
      candidates.push(
        candidate,
      );
    }
  }

  const currentCodes =
    countFailureCodes(
      currentAttempts,
    );

  const baselineCodes =
    countFailureCodes(
      baselineAttempts,
    );

  for (
    const [
      code,
      currentCount,
    ] of
    currentCodes.entries()
  ) {
    if (
      currentCount <
      rules.minimumCurrentFailures
    ) {
      continue;
    }

    const baselineCount =
      baselineCodes.get(
        code,
      ) ??
      0;

    const normalizedBaseline =
      scaledBaselineCount(
        baselineCount,
        rules.baselineWindowMinutes,
        rules.currentWindowMinutes,
      );

    const multiplier =
      normalizedBaseline >
      0
        ? currentCount /
          normalizedBaseline
        : null;

    const delta =
      currentCount -
      normalizedBaseline;

    const severity:
      AiSupportAlertSeverity | null =
      currentCount >=
          8 &&
        (
          multiplier ===
            null ||
          multiplier >=
            3
        )
        ? "critical"
        : currentCount >=
              5 &&
            (
              multiplier ===
                null ||
              multiplier >=
                2
            )
          ? "high"
          : currentCount >=
              3 &&
            (
              multiplier ===
                null ||
              multiplier >=
                1.5
            )
            ? "medium"
            : null;

    if (
      !severity
    ) {
      continue;
    }

    const evidence:
      RateEvidence = {
      currentWindowMinutes:
        rules.currentWindowMinutes,
      baselineWindowMinutes:
        rules.baselineWindowMinutes,
      currentTotal:
        currentAttempts.length,
      currentFailures:
        currentCount,
      currentRate:
        ratePercent(
          currentCount,
          Math.max(
            1,
            currentAttempts.length,
          ),
        ),
      baselineTotal:
        baselineAttempts.length,
      baselineFailures:
        baselineCount,
      baselineRate:
        ratePercent(
          baselineCount,
          Math.max(
            1,
            baselineAttempts.length,
          ),
        ),
      deltaRatePoints:
        roundRate(
          delta,
        ),
      multiplier:
        multiplier ===
        null
          ? null
          : roundRate(
              multiplier,
            ),
    };

    candidates.push({
      type:
        "failure_code_spike",
      severity,
      fingerprint:
        makeFingerprint(
          "failure_code_spike",
          [
            code,
          ],
        ),
      title:
        `${code} failures are clustering`,
      summary:
        `${currentCount} payment attempt(s) recorded the verified failure code ${code} in the last ${rules.currentWindowMinutes} minutes. The normalized baseline for the same duration is ${roundRate(normalizedBaseline)}. This indicates a repeated recorded failure code, but it does not by itself prove the upstream root cause.`,
      source: {
        provider:
          null,
        failureCode:
          code,
        queue:
          "payments",
      },
      evidence,
      reasonCodes: [
        "FAILURE_CODE_SPIKE",
        `FAILURE_${code
          .toUpperCase()
          .replace(
            /[^A-Z0-9]+/g,
            "_",
          )}`,
      ],
    });
  }

  const normalizedBaselineCaseCount =
    scaledBaselineCount(
      baselineCaseCount,
      rules.baselineWindowMinutes,
      rules.currentWindowMinutes,
    );

  if (
    currentCaseCount >=
      5 &&
    (
      normalizedBaselineCaseCount ===
        0 ||
      currentCaseCount >=
        normalizedBaselineCaseCount *
          2
    )
  ) {
    const caseMultiplier =
      normalizedBaselineCaseCount >
      0
        ? currentCaseCount /
          normalizedBaselineCaseCount
        : null;

    candidates.push({
      type:
        "support_case_inflow_spike",
      severity:
        currentCaseCount >=
          12
          ? "critical"
          : currentCaseCount >=
              8
            ? "high"
            : "medium",
      fingerprint:
        makeFingerprint(
          "support_case_inflow_spike",
          [
            "all",
          ],
        ),
      title:
        "Support case inflow spike detected",
      summary:
        `${currentCaseCount} AI Support case(s) were created in the last ${rules.currentWindowMinutes} minutes versus a normalized baseline of ${roundRate(normalizedBaselineCaseCount)} for the same duration.`,
      source: {
        provider:
          null,
        failureCode:
          null,
        queue:
          "support",
      },
      evidence: {
        currentWindowMinutes:
          rules.currentWindowMinutes,
        baselineWindowMinutes:
          rules.baselineWindowMinutes,
        currentTotal:
          currentCaseCount,
        currentFailures:
          currentCaseCount,
        currentRate:
          100,
        baselineTotal:
          baselineCaseCount,
        baselineFailures:
          baselineCaseCount,
        baselineRate:
          baselineCaseCount >
            0
            ? 100
            : 0,
        deltaRatePoints:
          roundRate(
            currentCaseCount -
              normalizedBaselineCaseCount,
          ),
        multiplier:
          caseMultiplier ===
          null
            ? null
            : roundRate(
                caseMultiplier,
              ),
      },
      reasonCodes: [
        "SUPPORT_CASE_INFLOW_SPIKE",
      ],
    });
  }

  const nowMs =
    now.getTime();

  let breachedCases =
    0;

  let highRiskSlaCases =
    0;

  for (
    const row of
    activeCases
  ) {
    if (
      row.firstResponseAt
    ) {
      continue;
    }

    const dueAt =
      new Date(
        row.slaDueAt,
      ).getTime();

    if (
      dueAt <=
      nowMs
    ) {
      breachedCases +=
        1;
      continue;
    }

    const elapsed =
      nowMs -
      new Date(
        row.createdAt,
      ).getTime();

    const target =
      Math.max(
        1,
        row.responseTargetMinutes,
      ) *
      60_000;

    if (
      elapsed /
        target >=
      0.75
    ) {
      highRiskSlaCases +=
        1;
    }
  }

  if (
    breachedCases >=
      3 ||
    breachedCases +
      highRiskSlaCases >=
      6
  ) {
    candidates.push({
      type:
        "sla_pressure",
      severity:
        breachedCases >=
          8
          ? "critical"
          : breachedCases >=
              5 ||
            breachedCases +
              highRiskSlaCases >=
              10
            ? "high"
            : "medium",
      fingerprint:
        makeFingerprint(
          "sla_pressure",
          [
            "support",
          ],
        ),
      title:
        "Support SLA pressure detected",
      summary:
        `${breachedCases} active case(s) have breached first-response SLA and ${highRiskSlaCases} more have consumed at least 75% of their response window.`,
      source: {
        provider:
          null,
        failureCode:
          null,
        queue:
          "support",
      },
      evidence: {
        currentWindowMinutes:
          rules.currentWindowMinutes,
        baselineWindowMinutes:
          rules.baselineWindowMinutes,
        currentTotal:
          activeCases.length,
        currentFailures:
          breachedCases +
          highRiskSlaCases,
        currentRate:
          ratePercent(
            breachedCases +
              highRiskSlaCases,
            activeCases.length,
          ),
        baselineTotal:
          0,
        baselineFailures:
          0,
        baselineRate:
          0,
        deltaRatePoints:
          0,
        multiplier:
          null,
      },
      reasonCodes: [
        "SLA_PRESSURE",
        "FIRST_RESPONSE_RISK",
      ],
    });
  }

  const criticalIncident =
    openIncidents.find(
      (incident) =>
        incident.severity ===
        "critical",
    );

  if (
    criticalIncident
  ) {
    candidates.push({
      type:
        "critical_incident",
      severity:
        "critical",
      fingerprint:
        makeFingerprint(
          "critical_incident",
          [
            criticalIncident.incidentId,
          ],
        ),
      title:
        `Critical incident active: ${criticalIncident.title}`,
      summary:
        `${criticalIncident.caseCount} correlated case(s) are linked to critical incident ${criticalIncident.incidentId}. This alert tracks Support visibility only and does not perform a financial or security action.`,
      source: {
        provider:
          null,
        failureCode:
          null,
        queue:
          criticalIncident.queue,
      },
      evidence: {
        currentWindowMinutes:
          rules.currentWindowMinutes,
        baselineWindowMinutes:
          rules.baselineWindowMinutes,
        currentTotal:
          criticalIncident.caseCount,
        currentFailures:
          criticalIncident.caseCount,
        currentRate:
          100,
        baselineTotal:
          0,
        baselineFailures:
          0,
        baselineRate:
          0,
        deltaRatePoints:
          0,
        multiplier:
          null,
      },
      reasonCodes: [
        "CRITICAL_INCIDENT_ACTIVE",
        criticalIncident.incidentId,
      ],
    });
  }

  const activeFingerprints =
    Array.from(
      new Set(
        candidates.map(
          (candidate) =>
            candidate.fingerprint,
        ),
      ),
    );

  const generated: SupportAlertEvaluation["generated"] =
    [];

  for (
    const candidate of
    candidates
  ) {
    const result =
      await upsertAlert(
        candidate,
      );

    generated.push({
      alertId:
        result.alertId,
      type:
        candidate.type,
      severity:
        candidate.severity,
      title:
        candidate.title,
      fingerprint:
        candidate.fingerprint,
    });
  }

  const resolved =
    await resolveInactiveAlerts(
      activeFingerprints,
    );

  return {
    evaluatedAt:
      now.toISOString(),
    currentWindowMinutes:
      rules.currentWindowMinutes,
    baselineWindowMinutes:
      rules.baselineWindowMinutes,
    generated,
    resolved,
    metrics: {
      paymentAttemptsCurrent:
        currentAttempts.length,
      paymentFailuresCurrent:
        currentAttemptFailures,
      paymentFailureRateCurrent:
        globalEvidence.currentRate,
      paymentAttemptsBaseline:
        baselineAttempts.length,
      paymentFailuresBaseline:
        baselineAttemptFailures,
      paymentFailureRateBaseline:
        globalEvidence.baselineRate,
      activeCases:
        activeCases.length,
      breachedCases,
      highRiskSlaCases,
      openIncidents:
        openIncidents.length,
    },
  };
}

export async function listSupportAlerts(input?: {
  page?: number;
  limit?: number;
  status?: string | null;
  severity?: string | null;
  type?: string | null;
}) {
  const page =
    Math.max(
      1,
      input?.page ??
        1,
    );

  const limit =
    Math.min(
      50,
      Math.max(
        5,
        input?.limit ??
          20,
      ),
    );

  const query:
    Record<string, unknown> =
    {};

  const validStatuses =
    new Set<AiSupportAlertStatus>([
      "open",
      "acknowledged",
      "resolved",
    ]);

  if (
    input?.status &&
    validStatuses.has(
      input.status as AiSupportAlertStatus,
    )
  ) {
    query.status =
      input.status;
  }

  if (
    input?.severity &&
    [
      "critical",
      "high",
      "medium",
      "low",
    ].includes(
      input.severity,
    )
  ) {
    query.severity =
      input.severity;
  }

  if (
    input?.type &&
    [
      "payment_failure_rate_spike",
      "provider_failure_spike",
      "failure_code_spike",
      "support_case_inflow_spike",
      "sla_pressure",
      "critical_incident",
    ].includes(
      input.type,
    )
  ) {
    query.type =
      input.type;
  }

  const [
    rows,
    total,
  ] =
    await Promise.all([
      AiSupportAlert.find(
        query,
      )
        .sort({
          status: 1,
          severity: 1,
          lastDetectedAt: -1,
        })
        .skip(
          (page -
            1) *
            limit,
        )
        .limit(
          limit,
        )
        .lean(),

      AiSupportAlert.countDocuments(
        query,
      ),
    ]);

  return {
    alerts:
      rows.map(
        (row) => ({
          id:
            row._id.toString(),
          alertId:
            row.alertId,
          type:
            row.type,
          severity:
            row.severity,
          status:
            row.status,
          title:
            row.title,
          summary:
            row.summary,
          source:
            row.source,
          evidence:
            row.evidence,
          reasonCodes:
            row.reasonCodes ??
            [],
          firstDetectedAt:
            row.firstDetectedAt.toISOString(),
          lastDetectedAt:
            row.lastDetectedAt.toISOString(),
          acknowledgedAt:
            row.acknowledgedAt?.toISOString() ??
            null,
          acknowledgedByUserId:
            row.acknowledgedByUserId ??
            null,
          resolvedAt:
            row.resolvedAt?.toISOString() ??
            null,
        }),
      ),
    page,
    limit,
    total,
    pages:
      Math.max(
        1,
        Math.ceil(
          total /
            limit,
        ),
      ),
  };
}

export async function getSupportAlert(
  alertId: string,
) {
  const row =
    await AiSupportAlert.findOne({
      alertId:
        alertId.trim(),
    }).lean();

  if (
    !row
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_ALERT_NOT_FOUND",
      message:
        "The Support proactive alert was not found.",
      statusCode:
        404,
    });
  }

  return {
    id:
      row._id.toString(),
    alertId:
      row.alertId,
    type:
      row.type,
    severity:
      row.severity,
    status:
      row.status,
    title:
      row.title,
    summary:
      row.summary,
    source:
      row.source,
    evidence:
      row.evidence,
    reasonCodes:
      row.reasonCodes ??
      [],
    firstDetectedAt:
      row.firstDetectedAt.toISOString(),
    lastDetectedAt:
      row.lastDetectedAt.toISOString(),
    acknowledgedAt:
      row.acknowledgedAt?.toISOString() ??
      null,
    acknowledgedByUserId:
      row.acknowledgedByUserId ??
      null,
    resolvedAt:
      row.resolvedAt?.toISOString() ??
      null,
  };
}

export async function updateSupportAlert(input: {
  alertId: string;
  supportUserId: string;
  status: "acknowledged" | "resolved";
}) {
  const row =
    await AiSupportAlert.findOne({
      alertId:
        input.alertId.trim(),
    });

  if (
    !row
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_ALERT_NOT_FOUND",
      message:
        "The Support proactive alert was not found.",
      statusCode:
        404,
    });
  }

  if (
    input.status ===
    "acknowledged"
  ) {
    row.status =
      "acknowledged";
    row.acknowledgedAt =
      new Date();
    row.acknowledgedByUserId =
      input.supportUserId;
    row.resolvedAt =
      null;
  } else {
    row.status =
      "resolved";
    row.resolvedAt =
      new Date();
  }

  await row.save();

  return getSupportAlert(
    row.alertId,
  );
}
