import "dotenv/config";
import {
  QdrantFaceVectorStore,
  qdrantFailureCode,
} from "../modules/ekyc/vector/QdrantFaceVectorStore.js";

// Run from the backend directory so dotenv reads the same .env as the API.
// This script only reads collection settings and sends a query; it writes no points.
async function main(): Promise<void> {
  const baseUrl = process.env.QDRANT_URL?.trim();
  const apiKey = process.env.QDRANT_API_KEY?.trim();
  const collection = process.env.QDRANT_COLLECTION?.trim() || "ekyc_face_templates_v1";
  const dimensions = Number(process.env.QDRANT_VECTOR_SIZE || 32);

  if (!baseUrl) throw new Error("QDRANT_URL is missing from the backend environment.");
  if (!apiKey) throw new Error("QDRANT_API_KEY is missing from the backend environment.");
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 4_096) {
    throw new Error("QDRANT_VECTOR_SIZE must be between 1 and 4096.");
  }

  const url = new URL(baseUrl);
  // This output contains only configuration metadata, never credentials or the full URL.
  console.log("Qdrant configuration:", {
    protocol: url.protocol,
    port: url.port || "default",
    collection,
    dimensions,
    apiKeyConfigured: true,
  });

  const store = new QdrantFaceVectorStore(baseUrl, apiKey, collection, dimensions);
  const endpoint = `${baseUrl.replace(/\/$/, "")}/collections/${encodeURIComponent(collection)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { "api-key": apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(
      `COLLECTION_HTTP_${response.status}: backend credentials cannot read this collection.`
    );
  }

  const info = await response.json() as {
    result?: { config?: { params?: { vectors?: { size?: number; distance?: string } } } };
  };
  const vectorConfig = info.result?.config?.params?.vectors;
  if (vectorConfig?.size !== dimensions || vectorConfig.distance !== "Cosine") {
    throw new Error(
      `COLLECTION_CONFIG_MISMATCH: expected an unnamed Cosine vector of size ${dimensions}.`
    );
  }
  console.log("Collection configuration: OK");

  // One nonzero synthetic vector exercises the same query endpoint as the worker.
  const vector = Array.from({ length: dimensions }, (_, index) => index === 0 ? 1 : 0);
  try {
    await store.findDuplicate(vector, 0.92);
  } catch (error: unknown) {
    throw new Error(`QUERY_${qdrantFailureCode(error)}: Qdrant point query failed.`);
  }
  console.log("Qdrant point query: OK");
}

void main().catch((error: unknown) => {
  const safeMessage = error instanceof Error ? error.message : "Qdrant diagnosis failed.";
  if (
    safeMessage.startsWith("COLLECTION_") ||
    safeMessage.startsWith("QUERY_") ||
    safeMessage.startsWith("QDRANT_")
  ) {
    console.error(safeMessage);
  } else if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
    console.error("COLLECTION_TIMEOUT: Qdrant collection request timed out.");
  } else if (error instanceof TypeError) {
    console.error("COLLECTION_NETWORK_ERROR: Qdrant collection request could not connect.");
  } else if (safeMessage.includes("missing from the backend environment") ||
             safeMessage.startsWith("QDRANT_VECTOR_SIZE")) {
    console.error(safeMessage);
  } else {
    console.error("QDRANT_CONFIGURATION_ERROR: check the backend Qdrant URL and settings.");
  }
  process.exitCode = 1;
});
