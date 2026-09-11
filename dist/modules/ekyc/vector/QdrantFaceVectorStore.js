"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QdrantFaceVectorStore = void 0;
const node_crypto_1 = require("node:crypto");
const fieldEncryption_js_1 = require("../security/fieldEncryption.js");
class QdrantFaceVectorStore {
    apiKey;
    collection;
    baseUrl;
    constructor(baseUrl = process.env.QDRANT_URL || "", apiKey = process.env.QDRANT_API_KEY || "", collection = process.env.QDRANT_COLLECTION ||
        "ekyc_face_templates_v1") {
        this.apiKey = apiKey;
        this.collection = collection;
        if (!baseUrl) {
            throw new Error("QDRANT_URL is required.");
        }
        const parsedUrl = new URL(baseUrl);
        const isLocalDevelopment = process.env.NODE_ENV !==
            "production" &&
            (parsedUrl.hostname ===
                "localhost" ||
                parsedUrl.hostname ===
                    "127.0.0.1");
        if (parsedUrl.protocol !==
            "https:" &&
            !isLocalDevelopment) {
            throw new Error("Qdrant must use HTTPS outside local development.");
        }
        if (process.env.NODE_ENV ===
            "production" &&
            !this.apiKey) {
            throw new Error("QDRANT_API_KEY is required in production.");
        }
        this.baseUrl =
            baseUrl.replace(/\/$/, "");
    }
    validateVector(vector) {
        if (!Array.isArray(vector) ||
            vector.length === 0 ||
            vector.length > 4096) {
            throw new Error("Face vector dimensions are invalid.");
        }
        if (vector.some((value) => !Number.isFinite(value))) {
            throw new Error("Face vector contains invalid values.");
        }
    }
    async request(path, method, body) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                "content-type": "application/json",
                accept: "application/json",
                ...(this.apiKey
                    ? {
                        "api-key": this.apiKey,
                    }
                    : {}),
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(3000),
            redirect: "error",
            cache: "no-store",
        });
        if (!response.ok) {
            throw new Error(`Vector store request failed with status ${response.status}.`);
        }
        return response.json();
    }
    async findDuplicate(vector, scoreThreshold) {
        this.validateVector(vector);
        if (!Number.isFinite(scoreThreshold) ||
            scoreThreshold < 0 ||
            scoreThreshold > 1) {
            throw new Error("Qdrant score threshold must be between 0 and 1.");
        }
        const response = await this.request(`/collections/${encodeURIComponent(this.collection)}/points/search`, "POST", {
            vector,
            limit: 1,
            score_threshold: scoreThreshold,
            with_payload: true,
            with_vector: false,
        });
        const match = response.result?.[0];
        if (!match) {
            return null;
        }
        return {
            pointId: String(match.id),
            score: match.score,
            pseudonymousUserRef: String(match.payload
                ?.userRef ||
                "unknown"),
        };
    }
    async saveVerifiedTemplate(userId, verificationId, vector) {
        this.validateVector(vector);
        await this.request(`/collections/${encodeURIComponent(this.collection)}/points?wait=true`, "PUT", {
            points: [
                {
                    id: (0, node_crypto_1.randomUUID)(),
                    vector,
                    payload: {
                        userRef: (0, fieldEncryption_js_1.keyedLookupHash)(userId, "vector-user"),
                        verificationRef: (0, fieldEncryption_js_1.keyedLookupHash)(verificationId, "vector-user"),
                    },
                },
            ],
        });
    }
}
exports.QdrantFaceVectorStore = QdrantFaceVectorStore;
exports.default = QdrantFaceVectorStore;
