import { randomInt, randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { keyedLookupHash } from "../security/fieldEncryption.js";
import type { ActiveLivenessAction, ActiveLivenessEvidence } from "../types.js";

const SESSION_TTL_SECONDS = 3 * 60;
const MIN_CAPTURE_DURATION_MS = 6_000;
const MAX_CAPTURE_DURATION_MS = 45_000;
const ACTIONS: ActiveLivenessAction[] = ["BLINK", "TURN_LEFT", "TURN_RIGHT"];

const CREATE_SESSION_LUA = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[2])
return 1
`;

const CONSUME_SESSION_LUA = `
local activeSession = redis.call('GET', KEYS[2])
if activeSession ~= ARGV[1] then
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

interface StoredLivenessSession {
  sessionId: string;
  userRef: string;
  deviceRef: string;
  challenges: ActiveLivenessAction[];
  issuedAt: string;
  expiresAt: string;
}

export interface ActiveLivenessChallengeSession {
  sessionId: string;
  challenges: ActiveLivenessAction[];
  issuedAt: string;
  expiresAt: string;
}

export class ActiveLivenessSessionError extends Error {
  readonly statusCode = 400;

  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "ActiveLivenessSessionError";
  }
}

export function createRandomLivenessSequence(
  randomIndex: (maximum: number) => number = (maximum) => randomInt(maximum)
): ActiveLivenessAction[] {
  const values = [...ACTIONS];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!];
  }
  return values;
}

function sessionKey(sessionId: string): string {
  return `ekyc:active-liveness:session:${sessionId}`;
}

function activeKey(userId: string, deviceId: string): string {
  return [
    "ekyc:active-liveness:active",
    keyedLookupHash(userId, "rate-limit"),
    keyedLookupHash(deviceId, "rate-limit"),
  ].join(":");
}

function sameChallenges(
  left: ActiveLivenessAction[],
  right: ActiveLivenessAction[]
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class ActiveLivenessService {
  constructor(private readonly redis: Redis) {}

  async create(userId: string, deviceId: string): Promise<ActiveLivenessChallengeSession> {
    if (!userId.trim() || !deviceId.trim()) {
      throw new ActiveLivenessSessionError(
        "Authenticated user and verified device are required.",
        "LIVENESS_IDENTITY_REQUIRED"
      );
    }

    const sessionId = randomUUID();
    const issuedAtDate = new Date();
    const expiresAtDate = new Date(issuedAtDate.getTime() + SESSION_TTL_SECONDS * 1_000);
    const record: StoredLivenessSession = {
      sessionId,
      userRef: keyedLookupHash(userId, "rate-limit"),
      deviceRef: keyedLookupHash(deviceId, "rate-limit"),
      challenges: createRandomLivenessSequence(),
      issuedAt: issuedAtDate.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
    };

    await this.redis.eval(
      CREATE_SESSION_LUA,
      2,
      sessionKey(sessionId),
      activeKey(userId, deviceId),
      JSON.stringify(record),
      SESSION_TTL_SECONDS,
      sessionId
    );

    return {
      sessionId,
      challenges: record.challenges,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
    };
  }

  async consume(input: {
    sessionId: string;
    userId: string;
    deviceId: string;
    challenges: ActiveLivenessAction[];
    startedAt: string;
    completedAt: string;
  }): Promise<ActiveLivenessEvidence> {
    if (!/^[0-9a-f-]{36}$/i.test(input.sessionId)) {
      throw new ActiveLivenessSessionError("Invalid liveness session.", "LIVENESS_SESSION_INVALID");
    }

    const raw = await this.redis.eval(
      CONSUME_SESSION_LUA,
      2,
      sessionKey(input.sessionId),
      activeKey(input.userId, input.deviceId),
      input.sessionId
    );

    if (typeof raw !== "string") {
      throw new ActiveLivenessSessionError(
        "The liveness session expired, was replaced, or was already used.",
        "LIVENESS_SESSION_EXPIRED"
      );
    }

    let record: StoredLivenessSession;
    try {
      record = JSON.parse(raw) as StoredLivenessSession;
    } catch {
      throw new ActiveLivenessSessionError("Invalid liveness session.", "LIVENESS_SESSION_INVALID");
    }

    if (
      record.sessionId !== input.sessionId ||
      record.userRef !== keyedLookupHash(input.userId, "rate-limit") ||
      record.deviceRef !== keyedLookupHash(input.deviceId, "rate-limit")
    ) {
      throw new ActiveLivenessSessionError(
        "The liveness session does not belong to this user and device.",
        "LIVENESS_SESSION_OWNERSHIP"
      );
    }

    if (!sameChallenges(record.challenges, input.challenges)) {
      throw new ActiveLivenessSessionError(
        "The completed liveness challenges do not match the issued sequence.",
        "LIVENESS_CHALLENGE_MISMATCH"
      );
    }

    const startedAt = new Date(input.startedAt);
    const completedAt = new Date(input.completedAt);
    const issuedAt = new Date(record.issuedAt);
    const expiresAt = new Date(record.expiresAt);
    const duration = completedAt.getTime() - startedAt.getTime();

    if (
      !Number.isFinite(startedAt.getTime()) ||
      !Number.isFinite(completedAt.getTime()) ||
      startedAt.getTime() < issuedAt.getTime() - 5_000 ||
      completedAt.getTime() > expiresAt.getTime() + 5_000 ||
      duration < MIN_CAPTURE_DURATION_MS ||
      duration > MAX_CAPTURE_DURATION_MS
    ) {
      throw new ActiveLivenessSessionError(
        "The live capture timing is invalid. Please complete a new camera session.",
        "LIVENESS_CAPTURE_TIME_INVALID"
      );
    }

    return {
      sessionId: record.sessionId,
      challenges: record.challenges,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    };
  }
}

export default ActiveLivenessService;
