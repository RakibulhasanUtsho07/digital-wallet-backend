export interface ComplianceScreeningInput {
  name: string;
  dateOfBirth: string;
  correlationId: string;
}

export interface ComplianceScreeningResult {
  sanctionsPotentialMatch:
    boolean;

  pepOrIpPotentialMatch:
    boolean;

  adverseMediaPotentialMatch:
    boolean;

  screeningReference:
    string;

  screenedAt:
    string;
}

/* =========================================================
   SCREENING PROVIDER INTERFACE
========================================================= */

export interface IComplianceScreeningProvider {
  readonly name:
    string;

  screen(
    input:
      ComplianceScreeningInput
  ): Promise<ComplianceScreeningResult>;
}

/* =========================================================
   MOCK PROVIDER

   Development and automated testing only.
========================================================= */

export class MockComplianceScreeningProvider
  implements
    IComplianceScreeningProvider {
  readonly name =
    "MOCK_COMPLIANCE_SCREENING";

  async screen(
    input:
      ComplianceScreeningInput
  ): Promise<ComplianceScreeningResult> {
    if (
      process.env.NODE_ENV ===
      "production"
    ) {
      throw new Error(
        "Mock compliance screening is prohibited in production."
      );
    }

    const normalizedName =
      input.name
        .normalize("NFKC")
        .trim()
        .toLocaleLowerCase(
          "en"
        );

    /*
     * Reserved test keywords make negative scenarios
     * deterministic in local development.
     */
    const sanctionsMatch =
      normalizedName.includes(
        "test sanctions"
      );

    const pepMatch =
      normalizedName.includes(
        "test pep"
      );

    const adverseMediaMatch =
      normalizedName.includes(
        "test adverse"
      );

    return {
      sanctionsPotentialMatch:
        sanctionsMatch,

      pepOrIpPotentialMatch:
        pepMatch,

      adverseMediaPotentialMatch:
        adverseMediaMatch,

      screeningReference:
        `MOCK-SCREEN-${input.correlationId}`,

      screenedAt:
        new Date().toISOString(),
    };
  }
}

/* =========================================================
   HELPER
========================================================= */

export function requiresComplianceReview(
  result:
    ComplianceScreeningResult
): boolean {
  return (
    result
      .sanctionsPotentialMatch ||
    result
      .pepOrIpPotentialMatch ||
    result
      .adverseMediaPotentialMatch
  );
}