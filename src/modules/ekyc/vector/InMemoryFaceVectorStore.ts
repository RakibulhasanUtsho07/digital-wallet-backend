import { createHash } from "node:crypto";
import { keyedLookupHash } from "../security/fieldEncryption.js";
import type { FaceDuplicateMatch, IFaceVectorStore } from "./QdrantFaceVectorStore.js";

interface StoredTemplate {
  pointId: string;
  verificationId: string;
  userRef: string;
  vector: number[];
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function validateVector(vector: number[]): void {
  if (!Array.isArray(vector) || vector.length === 0 || vector.length > 4_096) {
    throw new Error("Face vector dimensions are invalid.");
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Face vector contains invalid values.");
  }
}

export class InMemoryFaceVectorStore implements IFaceVectorStore {
  private readonly templates = new Map<string, StoredTemplate>();

  async findDuplicate(vector: number[], threshold: number): Promise<FaceDuplicateMatch | null> {
    validateVector(vector);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error("Vector score threshold must be between 0 and 1.");
    }
    let best: StoredTemplate | undefined;
    let bestScore = -1;
    for (const template of this.templates.values()) {
      const score = cosineSimilarity(vector, template.vector);
      if (score > bestScore) {
        best = template;
        bestScore = score;
      }
    }
    if (!best || bestScore < threshold) return null;
    return { pointId: best.pointId, score: bestScore, pseudonymousUserRef: best.userRef };
  }

  async saveVerifiedTemplate(userId: string, verificationId: string, vector: number[]): Promise<void> {
    validateVector(vector);
    const pointId = createHash("sha256").update(`memory-vector:${verificationId}`).digest("hex");
    this.templates.set(verificationId, {
      pointId,
      verificationId,
      userRef: keyedLookupHash(userId, "vector-user"),
      vector: [...vector],
    });
  }

  async removeVerifiedTemplate(verificationId: string): Promise<void> {
    this.templates.delete(verificationId);
  }
}

export default InMemoryFaceVectorStore;
