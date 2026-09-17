import type { Worker } from "bullmq";
import type Redis from "ioredis";
import { ActiveLivenessService } from "../biometrics/activeLivenessService.js";
import { HttpComplianceScreeningProvider } from "../compliance/HttpComplianceScreeningProvider.js";
import {
  MockComplianceScreeningProvider,
  type IComplianceScreeningProvider,
} from "../compliance/screening.js";
import { dynamicEKYCConfig } from "../config/ekycConfig.js";
import { CloudinaryPrivateMediaStore } from "../media/CloudinaryPrivateMediaStore.js";
import { EKYCProviderFactory } from "../providers/EKYCProviderFactory.js";
import {
  createEKYCQueue,
  createRedisConnection,
  type EKYCJobData,
} from "../queue/ekycQueue.js";
import { EKYCRateLimiter } from "../rate-limit/EKYCRateLimiter.js";
import { EKYCOrchestrator } from "../services/EKYCOrchestrator.js";
import { projectEKYCStatusToUser } from "../services/statusProjectionService.js";
import { InMemoryFaceVectorStore } from "../vector/InMemoryFaceVectorStore.js";
import {
  QdrantFaceVectorStore,
  type IFaceVectorStore,
} from "../vector/QdrantFaceVectorStore.js";
import {
  createEKYCWebhookQueue,
  createEKYCWebhookWorker,
  type EKYCWebhookJobData,
} from "../webhooks/webhookService.js";
import { createEKYCWorker } from "../workers/ekycWorker.js";

export interface EKYCRuntime {
  redis: Redis;
  config: typeof dynamicEKYCConfig;
  queue: ReturnType<typeof createEKYCQueue>;
  webhookQueue: ReturnType<typeof createEKYCWebhookQueue>;
  providerFactory: EKYCProviderFactory;
  vectorStore: IFaceVectorStore;
  mediaStore: CloudinaryPrivateMediaStore;
  screeningProvider: IComplianceScreeningProvider;
  activeLiveness: ActiveLivenessService;
  orchestrator: EKYCOrchestrator;
}

interface EKYCWorkerHandles {
  ekyc: Worker<EKYCJobData>;
  webhook: Worker<EKYCWebhookJobData>;
}

let runtimePromise: Promise<EKYCRuntime> | undefined;
let workers: EKYCWorkerHandles | undefined;

function createVectorStore(): IFaceVectorStore {
  if (process.env.QDRANT_URL?.trim()) return new QdrantFaceVectorStore();
  if (process.env.NODE_ENV === "production") {
    throw new Error("QDRANT_URL is required when advanced e-KYC runs in production.");
  }
  return new InMemoryFaceVectorStore();
}

function createScreeningProvider(useMockEC: boolean): IComplianceScreeningProvider {
  const explicitMock = process.env.USE_MOCK_COMPLIANCE_PROVIDER === "true";
  const useMock = explicitMock || (process.env.NODE_ENV !== "production" && useMockEC);
  if (useMock) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Mock compliance screening is prohibited in production.");
    }
    return new MockComplianceScreeningProvider();
  }
  return new HttpComplianceScreeningProvider();
}

async function buildRuntime(): Promise<EKYCRuntime> {
  const configSnapshot = await dynamicEKYCConfig.forceRefresh();
  const redis = createRedisConnection();
  await redis.ping();

  const queue = createEKYCQueue(redis);
  const webhookQueue = createEKYCWebhookQueue(redis);
  const providerFactory = new EKYCProviderFactory(dynamicEKYCConfig);
  const vectorStore = createVectorStore();
  const mediaStore = new CloudinaryPrivateMediaStore();
  const screeningProvider = createScreeningProvider(configSnapshot.useMockProvider);
  const activeLiveness = new ActiveLivenessService(redis);
  const limiter = new EKYCRateLimiter(
    redis,
    configSnapshot.rateLimit.attempts,
    configSnapshot.rateLimit.windowSeconds
  );
  const orchestrator = new EKYCOrchestrator(
    limiter,
    queue,
    projectEKYCStatusToUser
  );

  return {
    redis,
    config: dynamicEKYCConfig,
    queue,
    webhookQueue,
    providerFactory,
    vectorStore,
    mediaStore,
    screeningProvider,
    activeLiveness,
    orchestrator,
  };
}

export function getEKYCRuntime(): Promise<EKYCRuntime> {
  if (!runtimePromise) {
    runtimePromise = buildRuntime().catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

export async function startEKYCWorkers(): Promise<EKYCWorkerHandles> {
  if (workers) return workers;
  const runtime = await getEKYCRuntime();
  workers = {
    ekyc: createEKYCWorker({
      redis: runtime.redis,
      dynamicConfig: runtime.config,
      providerFactory: runtime.providerFactory,
      vectorStore: runtime.vectorStore,
      mediaStore: runtime.mediaStore,
      webhookQueue: runtime.webhookQueue,
      screeningProvider: runtime.screeningProvider,
      projectStatus: projectEKYCStatusToUser,
    }),
    webhook: createEKYCWebhookWorker(runtime.redis),
  };
  return workers;
}

export async function stopEKYCRuntime(): Promise<void> {
  const currentWorkers = workers;
  workers = undefined;
  if (currentWorkers) {
    await Promise.allSettled([
      currentWorkers.ekyc.close(),
      currentWorkers.webhook.close(),
    ]);
  }

  if (runtimePromise) {
    const runtime = await runtimePromise.catch(() => null);
    runtimePromise = undefined;
    if (runtime) {
      await Promise.allSettled([
        runtime.queue.close(),
        runtime.webhookQueue.close(),
      ]);
      await runtime.redis.quit().catch(() => runtime.redis.disconnect());
    }
  }
}
