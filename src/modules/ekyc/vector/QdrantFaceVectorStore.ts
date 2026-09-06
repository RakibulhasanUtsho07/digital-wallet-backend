import {
  randomUUID,
} from "node:crypto";

import {
  keyedLookupHash,
} from "../security/fieldEncryption.js";

export interface FaceDuplicateMatch {
  pointId: string;
  score: number;
  pseudonymousUserRef: string;
}

export interface IFaceVectorStore {
  findDuplicate(
    vector: number[],
    scoreThreshold: number
  ): Promise<FaceDuplicateMatch | null>;

  saveVerifiedTemplate(
    userId: string,
    verificationId: string,
    vector: number[]
  ): Promise<void>;
}

interface QdrantSearchResponse {
  result?: Array<{
    id: string | number;
    score: number;

    payload?: {
      userRef?: string;
    };
  }>;
}

export class QdrantFaceVectorStore
  implements IFaceVectorStore {
  private readonly baseUrl:
    string;

  constructor(
    baseUrl =
      process.env.QDRANT_URL || "",

    private readonly apiKey =
      process.env.QDRANT_API_KEY || "",

    private readonly collection =
      process.env.QDRANT_COLLECTION ||
      "ekyc_face_templates_v1"
  ) {
    if (!baseUrl) {
      throw new Error(
        "QDRANT_URL is required."
      );
    }

    const parsedUrl =
      new URL(baseUrl);

    const isLocalDevelopment =
      process.env.NODE_ENV !==
        "production" &&
      (
        parsedUrl.hostname ===
          "localhost" ||
        parsedUrl.hostname ===
          "127.0.0.1"
      );

    if (
      parsedUrl.protocol !==
        "https:" &&
      !isLocalDevelopment
    ) {
      throw new Error(
        "Qdrant must use HTTPS outside local development."
      );
    }

    if (
      process.env.NODE_ENV ===
        "production" &&
      !this.apiKey
    ) {
      throw new Error(
        "QDRANT_API_KEY is required in production."
      );
    }

    this.baseUrl =
      baseUrl.replace(
        /\/$/,
        ""
      );
  }

  private validateVector(
    vector: number[]
  ): void {
    if (
      !Array.isArray(vector) ||
      vector.length === 0 ||
      vector.length > 4096
    ) {
      throw new Error(
        "Face vector dimensions are invalid."
      );
    }

    if (
      vector.some(
        (value) =>
          !Number.isFinite(
            value
          )
      )
    ) {
      throw new Error(
        "Face vector contains invalid values."
      );
    }
  }

  private async request(
    path: string,
    method: "POST" | "PUT",
    body: unknown
  ): Promise<unknown> {
    const response =
      await fetch(
        `${this.baseUrl}${path}`,
        {
          method,

          headers: {
            "content-type":
              "application/json",

            accept:
              "application/json",

            ...(this.apiKey
              ? {
                  "api-key":
                    this.apiKey,
                }
              : {}),
          },

          body:
            JSON.stringify(
              body
            ),

          signal:
            AbortSignal.timeout(
              3000
            ),

          redirect:
            "error",

          cache:
            "no-store",
        }
      );

    if (!response.ok) {
      throw new Error(
        `Vector store request failed with status ${response.status}.`
      );
    }

    return response.json();
  }

  async findDuplicate(
    vector: number[],
    scoreThreshold: number
  ): Promise<FaceDuplicateMatch | null> {
    this.validateVector(
      vector
    );

    if (
      !Number.isFinite(
        scoreThreshold
      ) ||
      scoreThreshold < 0 ||
      scoreThreshold > 1
    ) {
      throw new Error(
        "Qdrant score threshold must be between 0 and 1."
      );
    }

    const response =
      await this.request(
        `/collections/${encodeURIComponent(
          this.collection
        )}/points/search`,

        "POST",

        {
          vector,
          limit: 1,

          score_threshold:
            scoreThreshold,

          with_payload:
            true,

          with_vector:
            false,
        }
      ) as QdrantSearchResponse;

    const match =
      response.result?.[0];

    if (!match) {
      return null;
    }

    return {
      pointId:
        String(
          match.id
        ),

      score:
        match.score,

      pseudonymousUserRef:
        String(
          match.payload
            ?.userRef ||
          "unknown"
        ),
    };
  }

  async saveVerifiedTemplate(
    userId: string,
    verificationId: string,
    vector: number[]
  ): Promise<void> {
    this.validateVector(
      vector
    );

    await this.request(
      `/collections/${encodeURIComponent(
        this.collection
      )}/points?wait=true`,

      "PUT",

      {
        points: [
          {
            id:
              randomUUID(),

            vector,

            payload: {
              userRef:
                keyedLookupHash(
                  userId,
                  "vector-user"
                ),

              verificationRef:
                keyedLookupHash(
                  verificationId,
                  "vector-user"
                ),
            },
          },
        ],
      }
    );
  }
}

export default QdrantFaceVectorStore;