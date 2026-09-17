import {
  RevenueEvent,
} from "../models/RevenueEvent.js";

import type {
  RevenueEventInput,
} from "../types/revenue.js";

const sanitizeMetadata = (
  metadata:
    RevenueEventInput["metadata"]
) => {
  if (
    !metadata
  ) {
    return {};
  }

  const safe:
    Record<
      string,
      string | number | boolean
    > = {};

  for (
    const [
      key,
      value,
    ] of Object.entries(
      metadata
    )
  ) {
    if (
      !/^[A-Za-z0-9_.-]{1,50}$/.test(
        key
      )
    ) {
      continue;
    }

    if (
      typeof value ===
        "string" &&
      value.length >
        120
    ) {
      safe[
        key
      ] =
        value.slice(
          0,
          120
        );

      continue;
    }

    if (
      typeof value ===
        "string" ||
      typeof value ===
        "number" ||
      typeof value ===
        "boolean"
    ) {
      safe[
        key
      ] =
        value;
    }
  }

  return safe;
};

export const recordRevenueEvent =
  async (
    input:
      RevenueEventInput
  ) => {
    if (
      !Number.isSafeInteger(
        input.feeMinor
      ) ||
      input.feeMinor <
        0
    ) {
      throw new Error(
        "feeMinor must be a non-negative safe integer."
      );
    }

    const volumeMinor =
      input.volumeMinor ??
      0;

    if (
      !Number.isSafeInteger(
        volumeMinor
      ) ||
      volumeMinor <
        0
    ) {
      throw new Error(
        "volumeMinor must be a non-negative safe integer."
      );
    }

    const result =
      await RevenueEvent.findOneAndUpdate(
        {
          idempotencyKey:
            input.idempotencyKey,
        },
        {
          $setOnInsert: {
            userId:
              input.userId,

            idempotencyKey:
              input.idempotencyKey,

            kind:
              input.kind,

            feeMinor:
              input.feeMinor,

            volumeMinor,

            sourceReference:
              input.sourceReference,

            occurredAt:
              input.occurredAt ??
              new Date(),

            metadata:
              sanitizeMetadata(
                input.metadata
              ),
          },
        },
        {
          upsert:
            true,

          new:
            true,

          setDefaultsOnInsert:
            true,
        }
      );

    return result;
  };
