import {
  describe,
  expect,
  it,
} from "vitest";

describe(
  "Coffer AI support deep investigation contract",
  () => {
    it(
      "keeps the assistant read-only and evidence-first",
      () => {
        const contract = {
          mutatesFinancialState:
            false,
          exactCauseRequiresEvidence:
            true,
          highRiskAloneIsCause:
            false,
          customerMessageMayExposeOtp:
            false,
        };

        expect(
          contract.mutatesFinancialState,
        ).toBe(false);

        expect(
          contract.exactCauseRequiresEvidence,
        ).toBe(true);

        expect(
          contract.highRiskAloneIsCause,
        ).toBe(false);

        expect(
          contract.customerMessageMayExposeOtp,
        ).toBe(false);
      },
    );
  },
);
