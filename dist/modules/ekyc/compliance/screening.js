"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockComplianceScreeningProvider = void 0;
exports.requiresComplianceReview = requiresComplianceReview;
/* =========================================================
   MOCK PROVIDER

   Development and automated testing only.
========================================================= */
class MockComplianceScreeningProvider {
    name = "MOCK_COMPLIANCE_SCREENING";
    async screen(input) {
        if (process.env.NODE_ENV ===
            "production") {
            throw new Error("Mock compliance screening is prohibited in production.");
        }
        const normalizedName = input.name
            .normalize("NFKC")
            .trim()
            .toLocaleLowerCase("en");
        /*
         * Reserved test keywords make negative scenarios
         * deterministic in local development.
         */
        const sanctionsMatch = normalizedName.includes("test sanctions");
        const pepMatch = normalizedName.includes("test pep");
        const adverseMediaMatch = normalizedName.includes("test adverse");
        return {
            sanctionsPotentialMatch: sanctionsMatch,
            pepOrIpPotentialMatch: pepMatch,
            adverseMediaPotentialMatch: adverseMediaMatch,
            screeningReference: `MOCK-SCREEN-${input.correlationId}`,
            screenedAt: new Date().toISOString(),
        };
    }
}
exports.MockComplianceScreeningProvider = MockComplianceScreeningProvider;
/* =========================================================
   HELPER
========================================================= */
function requiresComplianceReview(result) {
    return (result
        .sanctionsPotentialMatch ||
        result
            .pepOrIpPotentialMatch ||
        result
            .adverseMediaPotentialMatch);
}
