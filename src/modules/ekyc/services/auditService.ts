import {
  createHash,
} from "node:crypto";

import mongoose from "mongoose";

import {
  EKYCAuditEvent,
} from "../models/EKYCAuditEvent.js";

/* =========================================================
   TYPES
========================================================= */

export type AuditActorType =
  | "USER"
  | "SYSTEM"
  | "ADMIN";

export interface AppendAuditEventInput {
  verificationId: string;
  eventType: string;
  actorType: AuditActorType;
  actorIdHash?: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditChainVerification {
  valid: boolean;
  totalEvents: number;
  invalidSequence?: number;
  reason?: string;
}

/* =========================================================
   CANONICAL JSON

   Object keys are sorted before hashing so that the same
   event always generates the same SHA-256 hash.
========================================================= */

function stableJson(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "null";
  }

  if (value instanceof Date) {
    return JSON.stringify(
      value.toISOString()
    );
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((item) =>
        stableJson(item)
      )
      .join(",")}]`;
  }

  if (
    typeof value === "object"
  ) {
    const entries =
      Object.entries(
        value as Record<
          string,
          unknown
        >
      ).sort(
        ([left], [right]) =>
          left.localeCompare(
            right
          )
      );

    return `{${entries
      .map(
        ([key, child]) =>
          `${JSON.stringify(
            key
          )}:${stableJson(
            child
          )}`
      )
      .join(",")}}`;
  }

  return (
    JSON.stringify(value) ??
    "null"
  );
}

/* =========================================================
   EVENT HASH
========================================================= */

function calculateEventHash(input: {
  verificationId: string;
  sequence: number;
  eventType: string;
  actorType: AuditActorType;
  actorIdHash: string | null;
  correlationId: string;
  metadata: Record<string, unknown>;
  previousHash: string;
  createdAt: string;
}): string {
  return createHash(
    "sha256"
  )
    .update(
      stableJson(input),
      "utf8"
    )
    .digest("hex");
}

/* =========================================================
   INPUT VALIDATION
========================================================= */

function normalizeEventType(
  value: string
): string {
  const normalized =
    value
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9_]/g,
        "_"
      )
      .slice(0, 100);

  if (!normalized) {
    throw new Error(
      "Audit event type is required."
    );
  }

  return normalized;
}

function normalizeCorrelationId(
  value: string
): string {
  const normalized =
    value
      .trim()
      .slice(0, 120);

  if (!normalized) {
    throw new Error(
      "Audit correlation ID is required."
    );
  }

  return normalized;
}

/* =========================================================
   APPEND AUDIT EVENT
========================================================= */

export async function appendAuditEvent(
  input: AppendAuditEventInput
): Promise<void> {
  if (
    !mongoose.Types.ObjectId.isValid(
      input.verificationId
    )
  ) {
    throw new Error(
      "Invalid e-KYC verification ID."
    );
  }

  const eventType =
    normalizeEventType(
      input.eventType
    );

  const correlationId =
    normalizeCorrelationId(
      input.correlationId
    );

  const metadata =
    input.metadata || {};

  /*
   * A unique index on:
   *
   * verificationId + sequence
   *
   * prevents two concurrent events from creating the
   * same chain position. Duplicate conflicts are retried.
   */
  for (
    let attempt = 0;
    attempt < 5;
    attempt += 1
  ) {
    const previousEvent =
      await EKYCAuditEvent
        .findOne({
          verificationId:
            input.verificationId,
        })
        .sort({
          sequence: -1,
        })
        .select(
          "sequence eventHash"
        )
        .lean();

    const sequence =
      (
        previousEvent
          ?.sequence || 0
      ) + 1;

    const previousHash =
      previousEvent
        ?.eventHash ||
      "0".repeat(64);

    const createdAt =
      new Date();

    const actorIdHash =
      input.actorIdHash ||
      null;

    const eventHash =
      calculateEventHash({
        verificationId:
          input.verificationId,

        sequence,
        eventType,

        actorType:
          input.actorType,

        actorIdHash,

        correlationId,
        metadata,
        previousHash,

        createdAt:
          createdAt.toISOString(),
      });

    try {
      await EKYCAuditEvent.create({
        verificationId:
          input.verificationId,

        sequence,
        eventType,

        actorType:
          input.actorType,

        ...(input.actorIdHash
          ? {
              actorIdHash:
                input.actorIdHash,
            }
          : {}),

        correlationId,
        metadata,
        previousHash,
        eventHash,
        createdAt,
      });

      return;
    } catch (error) {
      const isDuplicateConflict =
        error instanceof
          mongoose.mongo
            .MongoServerError &&
        error.code === 11000;

      if (
        !isDuplicateConflict
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    "Unable to append the e-KYC audit event after concurrent-write retries."
  );
}

/* =========================================================
   VERIFY AUDIT HASH CHAIN
========================================================= */

export async function verifyAuditChain(
  verificationId: string
): Promise<AuditChainVerification> {
  if (
    !mongoose.Types.ObjectId.isValid(
      verificationId
    )
  ) {
    throw new Error(
      "Invalid e-KYC verification ID."
    );
  }

  const events =
    await EKYCAuditEvent
      .find({
        verificationId,
      })
      .sort({
        sequence: 1,
      })
      .lean();

  let expectedPreviousHash =
    "0".repeat(64);

  for (
    let index = 0;
    index < events.length;
    index += 1
  ) {
    const event =
      events[index];

    if (!event) {
      continue;
    }

    const expectedSequence =
      index + 1;

    if (
      event.sequence !==
      expectedSequence
    ) {
      return {
        valid: false,
        totalEvents:
          events.length,
        invalidSequence:
          event.sequence,
        reason:
          "Audit sequence gap detected.",
      };
    }

    if (
      event.previousHash !==
      expectedPreviousHash
    ) {
      return {
        valid: false,
        totalEvents:
          events.length,
        invalidSequence:
          event.sequence,
        reason:
          "Audit previous hash mismatch detected.",
      };
    }

    const calculatedHash =
      calculateEventHash({
        verificationId:
          event.verificationId.toString(),

        sequence:
          event.sequence,

        eventType:
          event.eventType,

        actorType:
          event.actorType,

        actorIdHash:
          event.actorIdHash ||
          null,

        correlationId:
          event.correlationId,

        metadata:
          event.metadata,

        previousHash:
          event.previousHash,

        createdAt:
          new Date(
            event.createdAt
          ).toISOString(),
      });

    if (
      calculatedHash !==
      event.eventHash
    ) {
      return {
        valid: false,
        totalEvents:
          events.length,
        invalidSequence:
          event.sequence,
        reason:
          "Audit event hash mismatch detected.",
      };
    }

    expectedPreviousHash =
      event.eventHash;
  }

  return {
    valid: true,
    totalEvents:
      events.length,
  };
}