import { randomBytes, randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { keyedLookupHash } from "../security/fieldEncryption.js";
import type { FingerprintEvidence } from "../types.js";

const CAPTURE_TTL_SECONDS = 3 * 60;

const CREATE_CAPTURE_LUA = `
local previousHash = redis.call('GET', KEYS[2])
if previousHash then
  redis.call('DEL', 'ekyc:mock-fingerprint:' .. previousHash)
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[2])
return 1
`;

const CONSUME_CAPTURE_LUA = `
local activeHash = redis.call('GET', KEYS[2])
if activeHash ~= ARGV[1] then
  return nil
end
local payload = redis.call('GET', KEYS[1])
if not payload then
  return nil
end
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
return payload
`;

interface StoredMockCapture {
  captureId: string;
  userRef: string;
  deviceRef: string;
  templateBase64: string;
  qualityScore: number;
  capturedAt: string;
}

export class MockFingerprintError extends Error {
  readonly statusCode = 400;

  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "MockFingerprintError";
  }
}

function captureKey(captureToken: string): string {
  return `ekyc:mock-fingerprint:${keyedLookupHash(captureToken, "fingerprint")}`;
}

function activeCaptureKey(userId: string, deviceId: string): string {
  return [
    "ekyc:mock-fingerprint:active",
    keyedLookupHash(userId, "rate-limit"),
    keyedLookupHash(deviceId, "rate-limit"),
  ].join(":");
}

export class MockFingerprintService {
  constructor(private readonly redis: Redis) {}

  async createCapture(userId: string, deviceId: string): Promise<{
    captureToken: string;
    qualityScore: number;
    capturedAt: string;
    mode: "MOCK";
  }> {
    if (process.env.NODE_ENV === "production") {
      throw new MockFingerprintError(
        "Mock fingerprint capture is prohibited in production.",
        "MOCK_FINGERPRINT_PROHIBITED"
      );
    }
    if (!userId.trim() || !deviceId.trim()) {
      throw new MockFingerprintError(
        "Authenticated user and verified device are required.",
        "FINGERPRINT_IDENTITY_REQUIRED"
      );
    }

    const captureToken = randomUUID();
    const capturedAt = new Date().toISOString();
    const record: StoredMockCapture = {
      captureId: randomUUID(),
      userRef: keyedLookupHash(userId, "rate-limit"),
      deviceRef: keyedLookupHash(deviceId, "rate-limit"),
      // This is synthetic demo data, never a physical fingerprint or fingerprint image.
      templateBase64: randomBytes(64).toString("base64"),
      qualityScore: 96,
      capturedAt,
    };

    await this.redis.eval(
      CREATE_CAPTURE_LUA,
      2,
      captureKey(captureToken),
      activeCaptureKey(userId, deviceId),
      JSON.stringify(record),
      CAPTURE_TTL_SECONDS,
      keyedLookupHash(captureToken, "fingerprint")
    );

    return { captureToken, qualityScore: record.qualityScore, capturedAt, mode: "MOCK" };
  }

  async consumeCapture(
    captureToken: string,
    userId: string,
    deviceId: string
  ): Promise<FingerprintEvidence> {
    if (!/^[0-9a-f-]{36}$/i.test(captureToken)) {
      throw new MockFingerprintError("Invalid fingerprint capture.", "FINGERPRINT_CAPTURE_INVALID");
    }

    const raw = await this.redis.eval(
      CONSUME_CAPTURE_LUA,
      2,
      captureKey(captureToken),
      activeCaptureKey(userId, deviceId),
      keyedLookupHash(captureToken, "fingerprint")
    );
    if (typeof raw !== "string") {
      throw new MockFingerprintError(
        "The fingerprint capture expired or was already used.",
        "FINGERPRINT_CAPTURE_EXPIRED"
      );
    }

    let record: StoredMockCapture;
    try {
      record = JSON.parse(raw) as StoredMockCapture;
    } catch {
      throw new MockFingerprintError("Invalid fingerprint capture.", "FINGERPRINT_CAPTURE_INVALID");
    }

    if (
      record.userRef !== keyedLookupHash(userId, "rate-limit") ||
      record.deviceRef !== keyedLookupHash(deviceId, "rate-limit")
    ) {
      throw new MockFingerprintError(
        "The fingerprint capture does not belong to this user and device.",
        "FINGERPRINT_CAPTURE_OWNERSHIP"
      );
    }

    return {
      captureId: record.captureId,
      mode: "MOCK",
      templateBase64: record.templateBase64,
      qualityScore: record.qualityScore,
      capturedAt: record.capturedAt,
    };
  }
}

export default MockFingerprintService;
