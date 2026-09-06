import {
  Queue,
  type JobsOptions,
} from "bullmq";

import Redis from "ioredis";

export const EKYC_QUEUE_NAME =
  "ekyc-processing-v1";

export interface EKYCJobData {
  verificationId: string;
  attemptId: string;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 4,

  backoff: {
    type: "exponential",
    delay: 2_000,
  },

  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 10_000,
  },

  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 20_000,
  },
};

/* =========================================================
   REDIS CONNECTION
========================================================= */

export function createRedisConnection(): Redis {
  const redisUrl =
    process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error(
      "REDIS_URL is required."
    );
  }

  const parsedUrl =
    new URL(redisUrl);

  if (
    process.env.NODE_ENV ===
      "production" &&
    parsedUrl.protocol !==
      "rediss:"
  ) {
    throw new Error(
      "Production e-KYC Redis must use a TLS rediss:// connection."
    );
  }

  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: 10_000,
    keepAlive: 10_000,
  });
}

/* =========================================================
   QUEUE CREATION
========================================================= */

export function createEKYCQueue(
  connection: Redis
): Queue<EKYCJobData> {
  return new Queue<EKYCJobData>(
    EKYC_QUEUE_NAME,
    {
      connection,
      defaultJobOptions:
        DEFAULT_JOB_OPTIONS,
    }
  );
}

/* =========================================================
   ENQUEUE VERIFICATION
========================================================= */

export async function enqueueEKYC(
  queue: Queue<EKYCJobData>,
  data: EKYCJobData
): Promise<void> {
  if (
    !data.verificationId?.trim() ||
    !data.attemptId?.trim()
  ) {
    throw new Error(
      "Verification ID and attempt ID are required."
    );
  }

  /*
   * Redis queue-তে শুধু opaque identifiers থাকবে।
   *
   * কখনো queue-তে রাখবেন না:
   * - NID
   * - Date of birth
   * - Customer name
   * - NID images
   * - Selfie
   * - Signed URLs
   * - Face embedding/vector
   */

  await queue.add(
    "process-verification",
    {
      verificationId:
        data.verificationId,
      attemptId:
        data.attemptId,
    },
    {
      ...DEFAULT_JOB_OPTIONS,

      /*
       * attemptId একটি UUID হওয়ায় একই attempt
       * একাধিকবার enqueue হওয়া প্রতিরোধ করবে।
       */
      jobId:
        data.attemptId,
    }
  );
}