"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EKYCRateLimiter = exports.EKYCRateLimitError = void 0;
const node_crypto_1 = require("node:crypto");
const fieldEncryption_js_1 = require("../security/fieldEncryption.js");
const SLIDING_WINDOW_LUA = `
local cutoff = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local ttl = tonumber(ARGV[5])

for i, key in ipairs(KEYS) do
  redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
  if redis.call('ZCARD', key) >= limit then
    return {0, i, redis.call('ZCARD', key)}
  end
end

for i, key in ipairs(KEYS) do
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, ttl)
end
return {1, 0, 0}
`;
class EKYCRateLimitError extends Error {
    identifier;
    statusCode = 429;
    constructor(identifier) {
        super("Maximum e-KYC attempts reached. Please try again later.");
        this.identifier = identifier;
        this.name = "EKYCRateLimitError";
    }
}
exports.EKYCRateLimitError = EKYCRateLimitError;
class EKYCRateLimiter {
    redis;
    limit;
    windowSeconds;
    constructor(redis, limit = 3, windowSeconds = 86_400) {
        this.redis = redis;
        this.limit = limit;
        this.windowSeconds = windowSeconds;
    }
    async consume(input) {
        const identifiers = [
            ["user", input.userId],
            ["ip", input.ipAddress],
            ["device", input.deviceId],
        ];
        if (identifiers.some(([, value]) => !value?.trim()))
            throw new Error("All rate-limit identifiers are required.");
        const keys = identifiers.map(([kind, value]) => `ekyc:attempts:${kind}:${(0, fieldEncryption_js_1.keyedLookupHash)(value.trim(), "rate-limit")}`);
        const [seconds, microseconds] = await this.redis.time();
        const now = Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000);
        const result = await this.redis.eval(SLIDING_WINDOW_LUA, keys.length, ...keys, now - this.windowSeconds * 1000, now, this.limit, input.attemptId ?? (0, node_crypto_1.randomUUID)(), this.windowSeconds + 60);
        if (Number(result[0]) !== 1) {
            const blocked = identifiers[Number(result[1]) - 1]?.[0] ?? "user";
            throw new EKYCRateLimitError(blocked);
        }
    }
}
exports.EKYCRateLimiter = EKYCRateLimiter;
