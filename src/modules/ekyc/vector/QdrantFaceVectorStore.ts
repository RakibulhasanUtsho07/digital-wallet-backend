import { createHash } from "node:crypto";
import { keyedLookupHash } from "../security/fieldEncryption.js";

export interface FaceDuplicateMatch {
  pointId: string;
  score: number;
  pseudonymousUserRef: string;
}

export interface IFaceVectorStore {
  findDuplicate(vector: number[], scoreThreshold: number): Promise<FaceDuplicateMatch | null>;
  saveVerifiedTemplate(userId: string, verificationId: string, vector: number[]): Promise<void>;
  removeVerifiedTemplate(verificationId: string): Promise<void>;
}

interface QdrantQueryResponse {
  result?: {
    points?: Array<{
      id: string | number;
      score: number;
      payload?: { userRef?: string };
    }>;
  };
}

function pointIdForVerification(verificationId: string): string {
  const bytes = createHash("sha256").update(`ekyc-vector:${verificationId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class QdrantFaceVectorStore implements IFaceVectorStore {
  private readonly baseUrl: string;

  constructor(
    baseUrl = process.env.QDRANT_URL || "",
    private readonly apiKey = process.env.QDRANT_API_KEY || "",
    private readonly collection = process.env.QDRANT_COLLECTION || "ekyc_face_templates_v1",
    private readonly expectedDimensions = Number(process.env.QDRANT_VECTOR_SIZE || 32)
  ) {
    if (!baseUrl) throw new Error("QDRANT_URL is required.");

    const parsedUrl = new URL(baseUrl);
    const local = process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);

    if (parsedUrl.protocol !== "https:" && !local) {
      throw new Error("Qdrant must use HTTPS outside local development.");
    }
    if (process.env.NODE_ENV === "production" && !this.apiKey) {
      throw new Error("QDRANT_API_KEY is required in production.");
    }
    if (
      !Number.isInteger(this.expectedDimensions) ||
      this.expectedDimensions < 1 ||
      this.expectedDimensions > 4_096
    ) {
      throw new Error("QDRANT_VECTOR_SIZE must be an integer between 1 and 4096.");
    }

    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private validateVector(vector: number[]): void {
    if (!Array.isArray(vector) || vector.length !== this.expectedDimensions) {
      throw new Error(
        `Face vector must contain exactly ${this.expectedDimensions} dimensions.`
      );
    }
    if (vector.some((value) => !Number.isFinite(value))) {
      throw new Error("Face vector contains invalid values.");
    }
  }

  private async request(
    path: string,
    method: "POST" | "PUT",
    body: unknown
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(this.apiKey ? { "api-key": this.apiKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3_000),
      redirect: "error",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Vector store request failed with status ${response.status}.`);
    }
    return response.status === 204 ? {} : response.json();
  }

  async findDuplicate(vector: number[], scoreThreshold: number): Promise<FaceDuplicateMatch | null> {
    this.validateVector(vector);
    if (!Number.isFinite(scoreThreshold) || scoreThreshold < 0 || scoreThreshold > 1) {
      throw new Error("Qdrant score threshold must be between 0 and 1.");
    }

    const response = await this.request(
      `/collections/${encodeURIComponent(this.collection)}/points/query`,
      "POST",
      {
        query: vector,
        limit: 1,
        score_threshold: scoreThreshold,
        with_payload: true,
        with_vector: false,
      }
    ) as QdrantQueryResponse;

    const match = response.result?.points?.[0];
    if (!match) return null;
    return {
      pointId: String(match.id),
      score: match.score,
      pseudonymousUserRef: String(match.payload?.userRef || "unknown"),
    };
  }

  async saveVerifiedTemplate(userId: string, verificationId: string, vector: number[]): Promise<void> {
    this.validateVector(vector);
    await this.request(
      `/collections/${encodeURIComponent(this.collection)}/points?wait=true`,
      "PUT",
      {
        points: [{
          id: pointIdForVerification(verificationId),
          vector,
          payload: {
            userRef: keyedLookupHash(userId, "vector-user"),
            verificationRef: keyedLookupHash(verificationId, "vector-user"),
          },
        }],
      }
    );
  }

  async removeVerifiedTemplate(verificationId: string): Promise<void> {
    await this.request(
      `/collections/${encodeURIComponent(this.collection)}/points/delete?wait=true`,
      "POST",
      { points: [pointIdForVerification(verificationId)] }
    );
  }
}

export default QdrantFaceVectorStore;
