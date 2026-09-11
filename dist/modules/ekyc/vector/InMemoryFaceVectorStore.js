"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryFaceVectorStore = void 0;
const node_crypto_1 = require("node:crypto");
const fieldEncryption_js_1 = require("../security/fieldEncryption.js");
function cosineSimilarity(left, right) {
    if (left.length !== right.length || left.length === 0)
        return 0;
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index += 1) {
        const a = left[index];
        const b = right[index];
        dot += a * b;
        leftNorm += a * a;
        rightNorm += b * b;
    }
    if (leftNorm === 0 || rightNorm === 0)
        return 0;
    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
function validateVector(vector) {
    if (!Array.isArray(vector) || vector.length === 0 || vector.length > 4_096) {
        throw new Error("Face vector dimensions are invalid.");
    }
    if (vector.some((value) => !Number.isFinite(value))) {
        throw new Error("Face vector contains invalid values.");
    }
}
class InMemoryFaceVectorStore {
    templates = new Map();
    async findDuplicate(vector, threshold) {
        validateVector(vector);
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
            throw new Error("Vector score threshold must be between 0 and 1.");
        }
        let best;
        let bestScore = -1;
        for (const template of this.templates.values()) {
            const score = cosineSimilarity(vector, template.vector);
            if (score > bestScore) {
                best = template;
                bestScore = score;
            }
        }
        if (!best || bestScore < threshold)
            return null;
        return { pointId: best.pointId, score: bestScore, pseudonymousUserRef: best.userRef };
    }
    async saveVerifiedTemplate(userId, verificationId, vector) {
        validateVector(vector);
        const pointId = (0, node_crypto_1.createHash)("sha256").update(`memory-vector:${verificationId}`).digest("hex");
        this.templates.set(verificationId, {
            pointId,
            verificationId,
            userRef: (0, fieldEncryption_js_1.keyedLookupHash)(userId, "vector-user"),
            vector: [...vector],
        });
    }
    async removeVerifiedTemplate(verificationId) {
        this.templates.delete(verificationId);
    }
}
exports.InMemoryFaceVectorStore = InMemoryFaceVectorStore;
exports.default = InMemoryFaceVectorStore;
