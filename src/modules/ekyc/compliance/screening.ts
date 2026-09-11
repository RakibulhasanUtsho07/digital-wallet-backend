export interface ComplianceScreeningInput {
  name: string;
  dateOfBirth: string;
  correlationId: string;
}

export interface ComplianceScreeningResult {
  sanctionsPotentialMatch: boolean;
  pepOrIpPotentialMatch: boolean;
  adverseMediaPotentialMatch: boolean;
  screeningReference: string;
  screenedAt: string;
}

export interface IComplianceScreeningProvider {
  readonly name: string;
  screen(input: ComplianceScreeningInput): Promise<ComplianceScreeningResult>;
}

/** Development and automated testing only. */
export class MockComplianceScreeningProvider implements IComplianceScreeningProvider {
  readonly name = "MOCK_COMPLIANCE_SCREENING";

  async screen(input: ComplianceScreeningInput): Promise<ComplianceScreeningResult> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Mock compliance screening is prohibited in production.");
    }

    const normalizedName = input.name
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en");

    return {
      sanctionsPotentialMatch: normalizedName.includes("test sanctions"),
      pepOrIpPotentialMatch: normalizedName.includes("test pep"),
      adverseMediaPotentialMatch: normalizedName.includes("test adverse"),
      screeningReference: `MOCK-SCREEN-${input.correlationId}`,
      screenedAt: new Date().toISOString(),
    };
  }
}
