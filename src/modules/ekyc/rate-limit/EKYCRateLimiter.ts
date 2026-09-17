import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { keyedLookupHash } from "../security/fieldEncryption.js";

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

export class EKYCRateLimitError extends Error {
  readonly statusCode = 429;
  constructor(readonly identifier: "user" | "ip" | "device") {
    super("Maximum e-KYC attempts reached. Please try again later.");
    this.name = "EKYCRateLimitError";
  }
}

export class EKYCRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limit = 3,
    private readonly windowSeconds = 86_400
  ) {}

  async consume(input: { userId: string; ipAddress: string; deviceId: string; attemptId?: string }): Promise<void> {
    const identifiers = [
      ["user", input.userId],
      ["ip", input.ipAddress],
      ["device", input.deviceId],
    ] as const;
    if (identifiers.some(([, value]) => !value?.trim())) throw new Error("All rate-limit identifiers are required.");

    const keys = identifiers.map(([kind, value]) =>
      `ekyc:attempts:${kind}:${keyedLookupHash(value.trim(), "rate-limit")}`
    );
    const [seconds, microseconds] = await this.redis.time();
    const now = Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000);
    const result = await this.redis.eval(
      SLIDING_WINDOW_LUA,
      keys.length,
      ...keys,
      now - this.windowSeconds * 1000,
      now,
      this.limit,
      input.attemptId ?? randomUUID(),
      this.windowSeconds + 60
    ) as [number, number, number];

    if (Number(result[0]) !== 1) {
      const blocked = identifiers[Number(result[1]) - 1]?.[0] ?? "user";
      throw new EKYCRateLimitError(blocked);
    }
  }
}
