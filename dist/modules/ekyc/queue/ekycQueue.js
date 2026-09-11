"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EKYC_QUEUE_NAME = void 0;
exports.createRedisConnection = createRedisConnection;
exports.createEKYCQueue = createEKYCQueue;
exports.enqueueEKYC = enqueueEKYC;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
exports.EKYC_QUEUE_NAME = "ekyc-processing-v1";
const DEFAULT_JOB_OPTIONS = {
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
function createRedisConnection() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        throw new Error("REDIS_URL is required.");
    }
    const parsedUrl = new URL(redisUrl);
    if (process.env.NODE_ENV ===
        "production" &&
        parsedUrl.protocol !==
            "rediss:") {
        throw new Error("Production e-KYC Redis must use a TLS rediss:// connection.");
    }
    return new ioredis_1.default(redisUrl, {
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
function createEKYCQueue(connection) {
    return new bullmq_1.Queue(exports.EKYC_QUEUE_NAME, {
        connection,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
}
/* =========================================================
   ENQUEUE VERIFICATION
========================================================= */
async function enqueueEKYC(queue, data) {
    if (!data.verificationId?.trim() ||
        !data.attemptId?.trim()) {
        throw new Error("Verification ID and attempt ID are required.");
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
    await queue.add("process-verification", {
        verificationId: data.verificationId,
        attemptId: data.attemptId,
    }, {
        ...DEFAULT_JOB_OPTIONS,
        /*
         * attemptId একটি UUID হওয়ায় একই attempt
         * একাধিকবার enqueue হওয়া প্রতিরোধ করবে।
         */
        jobId: data.attemptId,
    });
}
