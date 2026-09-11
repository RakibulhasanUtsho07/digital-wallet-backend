"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockECProvider = void 0;
const node_crypto_1 = require("node:crypto");
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
class MockECProvider {
    latencyMs;
    name = "MOCK_EC";
    constructor(latencyMs = Number(process.env.MOCK_EC_LATENCY_MS || 650)) {
        this.latencyMs = latencyMs;
    }
    async simulateLatency() {
        await pause(this.latencyMs);
    }
    async verifyIdentity(request) {
        await this.simulateLatency();
        const hash = (0, node_crypto_1.createHash)("sha256").update(request.nid).digest();
        return {
            nidMatched: !request.nid.endsWith("0000"),
            dateOfBirthMatched: true,
            ecNameEnglish: request.claimedName,
            faceMatchScore: 55 + (hash[0] % 46),
            faceEmbedding: Array.from({ length: 32 }, (_, index) => hash[index] / 255),
            providerReference: `MOCK-${(0, node_crypto_1.randomUUID)()}`,
        };
    }
    async parseOCR(request) {
        await this.simulateLatency();
        return {
            nid: request.nid,
            dateOfBirth: request.dateOfBirth,
            nameEnglish: request.claimedName,
            confidence: request.media.nidFrontUrl.includes("low-quality") ? 58 : 97,
        };
    }
    async checkLiveness(request) {
        await this.simulateLatency();
        const spoof = /(?:screen|print|spoof)/i.test(request.media.selfieUrl);
        return {
            passed: !spoof,
            conclusive: true,
            passiveScore: spoof ? 20 : 96,
            activeScore: spoof ? 25 : 95,
            challengePassed: !spoof,
            evidenceId: `MOCK-LIVE-${(0, node_crypto_1.randomUUID)()}`,
            capturedAt: new Date().toISOString(),
            attackSignals: spoof ? ["SCREEN_REPLAY"] : [],
        };
    }
}
exports.MockECProvider = MockECProvider;
