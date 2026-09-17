import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { EKYCAuditEvent } from "../models/EKYCAuditEvent.js";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function appendAuditEvent(input: {
  verificationId: string;
  eventType: string;
  actorType: "USER" | "SYSTEM" | "ADMIN";
  actorIdHash?: string;
  correlationId: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(input.verificationId)) throw new Error("Invalid verification ID.");

  if (input.idempotencyKey) {
    const existing = await EKYCAuditEvent.exists({
      verificationId: input.verificationId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) return;
  }

  // The unique sequence index converts concurrent writers into a retry instead of a forked chain.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const previous = await EKYCAuditEvent.findOne({ verificationId: input.verificationId })
      .sort({ sequence: -1 })
      .select("sequence eventHash")
      .lean();
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.eventHash ?? "0".repeat(64);
  const payload = {
  verificationId:
    input.verificationId,

  sequence,

  eventType:
    input.eventType,

  actorType:
    input.actorType,

  /*
   * actorIdHash না থাকলে property-টি omit হবে।
   * null পাঠানো হবে না।
   */
  ...(input.actorIdHash
    ? {
        actorIdHash:
          input.actorIdHash,
      }
    : {}),

  correlationId:
    input.correlationId,

  ...(input.idempotencyKey
    ? {
        idempotencyKey:
          input.idempotencyKey,
      }
    : {}),

  metadata:
    input.metadata ?? {},

  previousHash,
};
    const eventHash = createHash("sha256").update(stableJson(payload)).digest("hex");
    try {
      await EKYCAuditEvent.create({
        ...payload,
        eventHash,
      });
      return;
    } catch (error) {
      if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error;

      if (input.idempotencyKey) {
        const existing = await EKYCAuditEvent.exists({
          verificationId: input.verificationId,
          idempotencyKey: input.idempotencyKey,
        });
        if (existing) return;
      }
    }
  }
  throw new Error("Unable to append audit event after concurrent-write retries.");
}
