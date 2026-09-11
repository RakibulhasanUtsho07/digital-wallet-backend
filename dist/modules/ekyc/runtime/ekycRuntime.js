"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEKYCRuntime = getEKYCRuntime;
exports.startEKYCWorkers = startEKYCWorkers;
exports.stopEKYCRuntime = stopEKYCRuntime;
const HttpComplianceScreeningProvider_js_1 = require("../compliance/HttpComplianceScreeningProvider.js");
const screening_js_1 = require("../compliance/screening.js");
const ekycConfig_js_1 = require("../config/ekycConfig.js");
const CloudinaryPrivateMediaStore_js_1 = require("../media/CloudinaryPrivateMediaStore.js");
const EKYCProviderFactory_js_1 = require("../providers/EKYCProviderFactory.js");
const ekycQueue_js_1 = require("../queue/ekycQueue.js");
const EKYCRateLimiter_js_1 = require("../rate-limit/EKYCRateLimiter.js");
const EKYCOrchestrator_js_1 = require("../services/EKYCOrchestrator.js");
const InMemoryFaceVectorStore_js_1 = require("../vector/InMemoryFaceVectorStore.js");
const QdrantFaceVectorStore_js_1 = require("../vector/QdrantFaceVectorStore.js");
const webhookService_js_1 = require("../webhooks/webhookService.js");
const ekycWorker_js_1 = require("../workers/ekycWorker.js");
let runtimePromise;
let workers;
function createVectorStore() {
    if (process.env.QDRANT_URL?.trim())
        return new QdrantFaceVectorStore_js_1.QdrantFaceVectorStore();
    if (process.env.NODE_ENV === "production") {
        throw new Error("QDRANT_URL is required when advanced e-KYC runs in production.");
    }
    return new InMemoryFaceVectorStore_js_1.InMemoryFaceVectorStore();
}
function createScreeningProvider(useMockEC) {
    const explicitMock = process.env.USE_MOCK_COMPLIANCE_PROVIDER === "true";
    const useMock = explicitMock || (process.env.NODE_ENV !== "production" && useMockEC);
    if (useMock) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("Mock compliance screening is prohibited in production.");
        }
        return new screening_js_1.MockComplianceScreeningProvider();
    }
    return new HttpComplianceScreeningProvider_js_1.HttpComplianceScreeningProvider();
}
async function buildRuntime() {
    const configSnapshot = await ekycConfig_js_1.dynamicEKYCConfig.forceRefresh();
    const redis = (0, ekycQueue_js_1.createRedisConnection)();
    await redis.ping();
    const queue = (0, ekycQueue_js_1.createEKYCQueue)(redis);
    const webhookQueue = (0, webhookService_js_1.createEKYCWebhookQueue)(redis);
    const providerFactory = new EKYCProviderFactory_js_1.EKYCProviderFactory(ekycConfig_js_1.dynamicEKYCConfig);
    const vectorStore = createVectorStore();
    const mediaStore = new CloudinaryPrivateMediaStore_js_1.CloudinaryPrivateMediaStore();
    const screeningProvider = createScreeningProvider(configSnapshot.useMockProvider);
    const limiter = new EKYCRateLimiter_js_1.EKYCRateLimiter(redis, configSnapshot.rateLimit.attempts, configSnapshot.rateLimit.windowSeconds);
    const orchestrator = new EKYCOrchestrator_js_1.EKYCOrchestrator(limiter, queue);
    return {
        redis,
        config: ekycConfig_js_1.dynamicEKYCConfig,
        queue,
        webhookQueue,
        providerFactory,
        vectorStore,
        mediaStore,
        screeningProvider,
        orchestrator,
    };
}
function getEKYCRuntime() {
    if (!runtimePromise) {
        runtimePromise = buildRuntime().catch((error) => {
            runtimePromise = undefined;
            throw error;
        });
    }
    return runtimePromise;
}
async function startEKYCWorkers() {
    if (workers)
        return workers;
    const runtime = await getEKYCRuntime();
    workers = {
        ekyc: (0, ekycWorker_js_1.createEKYCWorker)({
            redis: runtime.redis,
            dynamicConfig: runtime.config,
            providerFactory: runtime.providerFactory,
            vectorStore: runtime.vectorStore,
            webhookQueue: runtime.webhookQueue,
            screeningProvider: runtime.screeningProvider,
            mediaResolver: runtime.mediaStore, // FIX: Added mediaResolver as required by WorkerDependencies
        }),
        webhook: (0, webhookService_js_1.createEKYCWebhookWorker)(runtime.redis),
    };
    return workers;
}
async function stopEKYCRuntime() {
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
