import {
  describe,
  expect,
  it,
} from "vitest";

import {
  triageSupportCase,
} from "../src/modules/coffer-ai/diagnostics/supportCaseTriageService.js";

describe(
  "Support AI case triage",
  () => {
    it(
      "routes verified risk blocks to risk/security without auto escalation",
      () => {
        const report: any = {
          subject: {
            kind: "payment",
            id: "pay_test",
            status: "failed",
          },
          resolution:
            "needs_internal_escalation",
          verification:
            "verified",
          confidence:
            "high",
          confirmedCause: {
            code:
              "risk_blocked",
            label:
              "Risk blocked",
            evidenceRefs: [
              "payment:pay_test",
            ],
          },
          signals: [],
          customers: [],
          paymentLifecycle:
            null,
          escalation: {
            required:
              true,
            team:
              "risk_security",
            reason:
              "Risk review",
          },
          agentSummary:
            "",
          agentChecklist: [],
          customerFacingMessage:
            "",
          timeline: [],
          sources: [],
          suggestedActions: [],
        };

        const result =
          triageSupportCase(
            report,
          );

        expect(
          result.queue,
        ).toBe(
          "risk_security",
        );

        expect(
          result.autoEscalationAllowed,
        ).toBe(
          false,
        );
      },
    );
  },
);
