"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const baseUrl = process.env.QDRANT_URL?.trim() || "";
const apiKey = process.env.QDRANT_API_KEY?.trim() || "";
const collection = process.env.QDRANT_COLLECTION?.trim() || "ekyc_face_templates_v1";
const vectorSize = Number(process.env.QDRANT_VECTOR_SIZE || 32);
if (!baseUrl)
    throw new Error("QDRANT_URL is required.");
if (!Number.isInteger(vectorSize) || vectorSize < 1 || vectorSize > 4_096) {
    throw new Error("QDRANT_VECTOR_SIZE must be an integer between 1 and 4096.");
}
const url = new URL(baseUrl);
const isLocal = process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
if (url.protocol !== "https:" && !isLocal) {
    throw new Error("Qdrant must use HTTPS outside local development.");
}
if (process.env.NODE_ENV === "production" && !apiKey) {
    throw new Error("QDRANT_API_KEY is required in production.");
}
const endpoint = `${baseUrl.replace(/\/$/, "")}/collections/${encodeURIComponent(collection)}`;
const headers = {
    "content-type": "application/json",
    accept: "application/json",
    ...(apiKey ? { "api-key": apiKey } : {}),
};
async function main() {
    const existing = await fetch(endpoint, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5_000),
    });
    if (existing.ok) {
        const payload = await existing.json();
        const existingSize = payload.result?.config?.params?.vectors?.size;
        if (existingSize !== vectorSize) {
            throw new Error(`Qdrant collection exists with ${String(existingSize)} dimensions; expected ${vectorSize}.`);
        }
        console.log(`Qdrant collection ${collection} already exists with ${vectorSize} dimensions.`);
        return;
    }
    if (existing.status !== 404) {
        throw new Error(`Unable to inspect Qdrant collection (HTTP ${existing.status}).`);
    }
    const created = await fetch(endpoint, {
        method: "PUT",
        headers,
        body: JSON.stringify({
            vectors: {
                size: vectorSize,
                distance: "Cosine",
            },
        }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!created.ok) {
        throw new Error(`Unable to create Qdrant collection (HTTP ${created.status}).`);
    }
    console.log(`Created Qdrant collection ${collection} with ${vectorSize} dimensions.`);
}
void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Qdrant setup failed.");
    process.exit(1);
});
