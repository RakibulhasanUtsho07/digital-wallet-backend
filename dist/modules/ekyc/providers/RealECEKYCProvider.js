"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealECEKYCProvider = exports.ECProviderError = void 0;
const zod_1 = require("zod");
const identitySchema = zod_1.z.object({
    nidMatched: zod_1.z.boolean(),
    dateOfBirthMatched: zod_1.z.boolean(),
    ecNameEnglish: zod_1.z.string().optional(),
    ecNameBangla: zod_1.z.string().optional(),
    faceMatchScore: zod_1.z.number().min(0).max(100),
    faceEmbedding: zod_1.z.array(zod_1.z.number().finite()).max(4096).optional(),
    providerReference: zod_1.z.string().min(1).max(200),
}).strict();
const ocrSchema = zod_1.z.object({
    nid: zod_1.z.string().optional(),
    dateOfBirth: zod_1.z.string().optional(),
    nameEnglish: zod_1.z.string().optional(),
    nameBangla: zod_1.z.string().optional(),
    confidence: zod_1.z.number().min(0).max(100),
}).strict();
const livenessSchema = zod_1.z.object({
    passed: zod_1.z.boolean(),
    conclusive: zod_1.z.boolean(),
    passiveScore: zod_1.z.number().min(0).max(100),
    activeScore: zod_1.z.number().min(0).max(100).optional(),
    challengePassed: zod_1.z.boolean().optional(),
    evidenceId: zod_1.z.string().min(1).max(200),
    capturedAt: zod_1.z.string().datetime(),
    attackSignals: zod_1.z.array(zod_1.z.enum(["SCREEN_REPLAY", "PRINT_ATTACK", "MASK", "MULTIPLE_FACES"])),
}).strict();
class ECProviderError extends Error {
    code;
    transient;
    constructor(message, code, transient) {
        super(message);
        this.code = code;
        this.transient = transient;
        this.name = "ECProviderError";
    }
}
exports.ECProviderError = ECProviderError;
/**
 * Production adapter for an EC/Porichoy contract. The three endpoint response bodies
 * must be mapped by your approved gateway/proxy to the canonical schemas above.
 * Do not infer production URLs, field names, or credentials from public examples.
 */
class RealECEKYCProvider {
    config;
    name = "REAL_EC_PORICHOY";
    constructor(config) {
        this.config = config;
        if (!config.baseUrl || !config.apiKey) {
            throw new Error("Real EC provider is not configured.");
        }
        const origin = new URL(config.baseUrl).origin;
        if (!config.allowedOrigins.includes(origin)) {
            throw new Error("EC gateway origin is not allowlisted.");
        }
        if (new URL(config.baseUrl).protocol !== "https:") {
            throw new Error("EC gateway must use HTTPS.");
        }
    }
    async post(path, payload) {
        const endpoint = new URL(path, this.config.baseUrl);
        if (!this.config.allowedOrigins.includes(endpoint.origin)) {
            throw new ECProviderError("EC gateway origin rejected.", "REQUEST_REJECTED", false);
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "accept": "application/json",
                    [this.config.apiKeyHeader]: `${this.config.apiKeyPrefix}${this.config.apiKey}`,
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
                redirect: "error",
                cache: "no-store",
            });
            if (response.status >= 500 || response.status === 429) {
                throw new ECProviderError("EC gateway is temporarily unavailable.", "UNAVAILABLE", true);
            }
            if (!response.ok) {
                throw new ECProviderError("EC gateway rejected the request.", "REQUEST_REJECTED", false);
            }
            return await response.json();
        }
        catch (error) {
            if (error instanceof ECProviderError)
                throw error;
            if (error instanceof Error && error.name === "AbortError") {
                throw new ECProviderError("EC gateway timed out.", "TIMEOUT", true);
            }
            throw new ECProviderError("EC gateway is unavailable.", "UNAVAILABLE", true);
        }
        finally {
            clearTimeout(timer);
        }
    }
    async verifyIdentity(request) {
        const data = await this.post(this.config.verifyPath, {
            nidNumber: request.nid,
            dateOfBirth: request.dateOfBirth,
            name: request.claimedName,
            photoUrl: request.media.selfieUrl,
            correlationId: request.correlationId,
        });
        const parsed = identitySchema.safeParse(data);
        if (!parsed.success)
            throw new ECProviderError("Invalid identity response.", "INVALID_RESPONSE", false);
        return parsed.data;
    }
    async parseOCR(request) {
        const data = await this.post(this.config.ocrPath, {
            nidFrontUrl: request.media.nidFrontUrl,
            nidBackUrl: request.media.nidBackUrl,
            correlationId: request.correlationId,
        });
        const parsed = ocrSchema.safeParse(data);
        if (!parsed.success)
            throw new ECProviderError("Invalid OCR response.", "INVALID_RESPONSE", false);
        return parsed.data;
    }
    async checkLiveness(request) {
        const data = await this.post(this.config.livenessPath, {
            selfieUrl: request.media.selfieUrl,
            correlationId: request.correlationId,
        });
        const parsed = livenessSchema.safeParse(data);
        if (!parsed.success)
            throw new ECProviderError("Invalid liveness response.", "INVALID_RESPONSE", false);
        return parsed.data;
    }
}
exports.RealECEKYCProvider = RealECEKYCProvider;
