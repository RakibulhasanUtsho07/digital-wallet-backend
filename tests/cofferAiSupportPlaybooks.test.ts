import {
  describe,
  expect,
  it,
} from "vitest";

import {
  recommendSupportPlaybooks,
} from "../src/modules/coffer-ai/playbooks/supportPlaybookRecommendationService.js";

describe(
  "Support AI playbook recommendations",
  () => {
    it(
      "recommends provider timeout procedure from verified cause",
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
              "provider_timeout",
            label:
              "Provider timed out",
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
              "provider",
            reason:
              "Provider review",
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
          recommendSupportPlaybooks({
            report,
            triage: {
              severity:
                "high",
              priority:
                "high",
              queue:
                "provider",
              responseTargetMinutes:
                30,
              escalationRequired:
                true,
              autoEscalationAllowed:
                false,
              reasonCodes: [],
              explanation:
                "",
            },
          });

        expect(
          result[0]?.playbook.id,
        ).toBe(
          "provider_timeout",
        );
      },
    );
  },
);
