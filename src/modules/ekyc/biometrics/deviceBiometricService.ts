import { randomUUID } from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type Redis from "ioredis";
import type { DeviceBiometricEvidence } from "../types.js";

const CHALLENGE_TTL_SECONDS = 3 * 60;
const EVIDENCE_TTL_SECONDS = 15 * 60;
const GET_AND_DELETE = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value
`;

interface StoredChallenge {
  userId: string;
  challenge: string;
}

export class DeviceBiometricError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = "DeviceBiometricError";
  }
}

function webAuthnConfig(): { rpName: string; rpID: string; origin: string } {
  const rpName = process.env.WEBAUTHN_RP_NAME?.trim() || "Coffer Digital Wallet";
  const rpID = process.env.WEBAUTHN_RP_ID?.trim() || "localhost";
  const parsed = new URL(process.env.WEBAUTHN_ORIGIN?.trim() || "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new DeviceBiometricError(
      "Device biometric verification requires HTTPS.",
      "BIOMETRIC_HTTPS_REQUIRED",
      503
    );
  }
  if (parsed.hostname !== rpID && !parsed.hostname.endsWith(`.${rpID}`)) {
    throw new DeviceBiometricError(
      "WebAuthn relying-party configuration is invalid.",
      "BIOMETRIC_CONFIG_INVALID",
      503
    );
  }
  return { rpName, rpID, origin: parsed.origin };
}

function challengeKey(sessionId: string): string {
  return `ekyc:device-biometric:challenge:${sessionId}`;
}

function evidenceKey(sessionId: string): string {
  return `ekyc:device-biometric:evidence:${sessionId}`;
}

export class DeviceBiometricService {
  constructor(private readonly redis: Redis) {}

  async create(userId: string, displayName: string) {
    const { rpName, rpID } = webAuthnConfig();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(userId),
      userName: userId,
      userDisplayName: displayName.slice(0, 100) || "Coffer user",
      attestationType: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "discouraged",
        userVerification: "required",
      },
      timeout: 60_000,
    });
    const sessionId = randomUUID();
    const record: StoredChallenge = { userId, challenge: options.challenge };
    await this.redis.set(
      challengeKey(sessionId),
      JSON.stringify(record),
      "EX",
      CHALLENGE_TTL_SECONDS
    );
    return { sessionId, options };
  }

  async verify(input: {
    userId: string;
    sessionId: string;
    response: RegistrationResponseJSON;
  }): Promise<DeviceBiometricEvidence> {
    if (!/^[0-9a-f-]{36}$/i.test(input.sessionId)) {
      throw new DeviceBiometricError("Invalid biometric session.", "BIOMETRIC_SESSION_INVALID");
    }
    const raw = await this.redis.eval(GET_AND_DELETE, 1, challengeKey(input.sessionId));
    if (typeof raw !== "string") {
      throw new DeviceBiometricError(
        "The biometric session expired. Please try again.",
        "BIOMETRIC_SESSION_EXPIRED"
      );
    }
    const record = JSON.parse(raw) as StoredChallenge;
    if (record.userId !== input.userId) {
      throw new DeviceBiometricError(
        "The biometric session does not belong to this account.",
        "BIOMETRIC_SESSION_OWNERSHIP",
        403
      );
    }
    const { rpID, origin } = webAuthnConfig();
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: record.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch {
      throw new DeviceBiometricError(
        "Device biometric verification failed.",
        "BIOMETRIC_VERIFICATION_FAILED"
      );
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new DeviceBiometricError(
        "Device biometric verification failed.",
        "BIOMETRIC_VERIFICATION_FAILED"
      );
    }
    const info = verification.registrationInfo;
    const evidence: DeviceBiometricEvidence = {
      mode: "WEBAUTHN",
      credentialId: info.credential.id,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      verifiedAt: new Date().toISOString(),
    };
    await this.redis.set(
      evidenceKey(input.sessionId),
      JSON.stringify({ userId: input.userId, evidence }),
      "EX",
      EVIDENCE_TTL_SECONDS
    );
    return evidence;
  }

  async consume(
    userId: string,
    sessionId: string | undefined
  ): Promise<DeviceBiometricEvidence | undefined> {
    if (!sessionId) return undefined;
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
      throw new DeviceBiometricError("Invalid biometric session.", "BIOMETRIC_SESSION_INVALID");
    }
    const raw = await this.redis.eval(GET_AND_DELETE, 1, evidenceKey(sessionId));
    if (typeof raw !== "string") {
      throw new DeviceBiometricError(
        "Biometric verification expired. Verify again or continue without it.",
        "BIOMETRIC_SESSION_EXPIRED"
      );
    }
    const record = JSON.parse(raw) as { userId: string; evidence: DeviceBiometricEvidence };
    if (record.userId !== userId) {
      throw new DeviceBiometricError(
        "The biometric proof does not belong to this account.",
        "BIOMETRIC_SESSION_OWNERSHIP",
        403
      );
    }
    return record.evidence;
  }
}
