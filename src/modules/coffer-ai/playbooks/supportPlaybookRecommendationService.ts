import type {
  SupportCaseReport,
} from "../diagnostics/supportCaseIntelligenceService.js";
import type {
  SupportCaseTriageDecision,
} from "../diagnostics/supportCaseTriageService.js";
import {
  getSupportPlaybook,
  listSupportPlaybooks,
  type SupportPlaybookDefinition,
} from "./supportPlaybookRegistry.js";

export interface SupportPlaybookRecommendation {
  playbook: SupportPlaybookDefinition;
  score: number;
  confidence:
    | "high"
    | "medium"
    | "low";
  reasons: string[];
}

function normalize(
  value: string | null | undefined,
): string {
  return value
    ?.trim()
    .toLowerCase() ??
    "";
}

export function recommendSupportPlaybooks(input: {
  report: SupportCaseReport;
  triage?: SupportCaseTriageDecision | null;
}): SupportPlaybookRecommendation[] {
  const causeCode =
    normalize(
      input.report.confirmedCause?.code,
    );

  const signalCodes =
    new Set(
      input.report.signals.map(
        (signal) =>
          normalize(
            signal.code,
          ),
      ),
    );

  const results =
    listSupportPlaybooks()
      .map(
        (playbook) => {
          let score =
            0;
          const reasons:
            string[] =
            [];

          if (
            causeCode &&
            playbook.appliesToCauseCodes.includes(
              causeCode,
            )
          ) {
            score +=
              100;
            reasons.push(
              `verified cause ${causeCode} matches this playbook`,
            );
          }

          const matchingSignals =
            playbook.appliesToSignalCodes.filter(
              (code) =>
                signalCodes.has(
                  normalize(
                    code,
                  ),
                ),
            );

          if (
            matchingSignals.length >
            0
          ) {
            score +=
              Math.min(
                45,
                matchingSignals.length *
                  20,
              );

            reasons.push(
              `matching case signal(s): ${matchingSignals.join(", ")}`,
            );
          }

          if (
            input.triage?.queue ===
            playbook.defaultQueue
          ) {
            score +=
              10;
            reasons.push(
              `recommended queue is ${playbook.defaultQueue}`,
            );
          }

          if (
            playbook.id ===
              "unknown_payment_failure" &&
            input.report.subject.kind ===
              "payment" &&
            input.report.subject.status?.toLowerCase() ===
              "failed" &&
            !input.report.confirmedCause
          ) {
            score +=
              90;

            reasons.push(
              "payment failure is verified but no exact cause is proven",
            );
          }

          if (
            playbook.id ===
              "unknown_payment_failure" &&
            input.report.confirmedCause
          ) {
            score =
              0;
            reasons.length =
              0;
          }

          return {
            playbook,
            score,
            confidence:
              score >=
              100
                ? "high" as const
                : score >=
                    50
                  ? "medium" as const
                  : "low" as const,
            reasons,
          };
        },
      )
      .filter(
        (item) =>
          item.score >
          0,
      )
      .sort(
        (left, right) =>
          right.score -
          left.score,
      );

  if (
    results.length ===
      0 &&
    input.report.subject.kind ===
      "payment"
  ) {
    const fallback =
      getSupportPlaybook(
        "unknown_payment_failure",
      );

    if (
      fallback
    ) {
      results.push({
        playbook:
          fallback,
        score:
          40,
        confidence:
          "low",
        reasons: [
          "no exact approved playbook matched; use the evidence-safe unknown-cause workflow",
        ],
      });
    }
  }

  return results.slice(
    0,
    3,
  );
}
