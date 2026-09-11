"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpComplianceScreeningProvider = void 0;
const zod_1 = require("zod");
const responseSchema = zod_1.z.object({
    sanctionsPotentialMatch: zod_1.z.boolean(),
    pepOrIpPotentialMatch: zod_1.z.boolean(),
    adverseMediaPotentialMatch: zod_1.z.boolean(),
    screeningReference: zod_1.z.string().min(1).max(200),
    screenedAt: zod_1.z.string().datetime(),
}).strict();
class HttpComplianceScreeningProvider {
    name = "HTTP_COMPLIANCE_SCREENING";
    endpoint;
    apiKey;
    timeoutMs;
    constructor() {
        const endpointValue = process.env.COMPLIANCE_SCREENING_URL?.trim();
        this.apiKey = process.env.COMPLIANCE_SCREENING_API_KEY?.trim() || "";
        this.timeoutMs = Number(process.env.COMPLIANCE_SCREENING_TIMEOUT_MS || 5_000);
        if (!endpointValue || !this.apiKey) {
            throw new Error("COMPLIANCE_SCREENING_URL and COMPLIANCE_SCREENING_API_KEY are required.");
        }
        if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 5_000) {
            throw new Error("COMPLIANCE_SCREENING_TIMEOUT_MS must be between 1000 and 5000.");
        }
        this.endpoint = new URL(endpointValue);
        if (this.endpoint.protocol !== "https:" ||
            this.endpoint.username ||
            this.endpoint.password) {
            throw new Error("The compliance-screening endpoint must be credential-free HTTPS.");
        }
        const allowed = (process.env.COMPLIANCE_SCREENING_ALLOWED_ORIGINS || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => new URL(value).origin);
        if (!allowed.includes(this.endpoint.origin)) {
            throw new Error("The compliance-screening endpoint origin is not allowlisted.");
        }
    }
    async screen(input) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(this.endpoint, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    accept: "application/json",
                    authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(input),
                signal: controller.signal,
                redirect: "error",
                cache: "no-store",
            });
            if (!response.ok) {
                throw new Error(`Compliance-screening provider returned HTTP ${response.status}.`);
            }
            const parsed = responseSchema.safeParse(await response.json());
            if (!parsed.success)
                throw new Error("Compliance-screening provider returned an invalid response.");
            return parsed.data;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.HttpComplianceScreeningProvider = HttpComplianceScreeningProvider;
exports.default = HttpComplianceScreeningProvider;
