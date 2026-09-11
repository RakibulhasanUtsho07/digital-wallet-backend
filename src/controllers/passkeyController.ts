import { randomUUID } from "node:crypto";
import type { Response } from "express";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { AuthRequest } from "../middlewares/authMiddleware.js";
import { PasskeyCredential } from "../models/PasskeyCredential.js";
import { User } from "../models/User.js";
import { WebAuthnFlow } from "../models/WebAuthnFlow.js";
import {
  issuePaymentAuthorization,
  transferOperationHash,
} from "../services/paymentAuthorizationService.js";

const FLOW_TTL_MS = 3 * 60 * 1000;

function config(): { rpName: string; rpID: string; origin: string } {
  const rpName = process.env.WEBAUTHN_RP_NAME?.trim() || "Coffer Digital Wallet";
  const rpID = process.env.WEBAUTHN_RP_ID?.trim() || "localhost";
  const origin = process.env.WEBAUTHN_ORIGIN?.trim() || "http://localhost:3000";
  const parsed = new URL(origin);

  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("WEBAUTHN_ORIGIN must use HTTPS in production.");
  }
  if (parsed.hostname !== rpID && !parsed.hostname.endsWith(`.${rpID}`)) {
    throw new Error("WEBAUTHN_RP_ID must match WEBAUTHN_ORIGIN.");
  }
  return { rpName, rpID, origin: parsed.origin };
}

function userIdOf(req: AuthRequest): string {
  const userId = req.user?._id;
  if (!userId) throw new Error("Authentication required.");
  return userId;
}

function labelOf(value: unknown): string {
  if (typeof value !== "string") return "This device";
  const label = value.replace(/\s+/g, " ").trim();
  return label.length >= 2 ? label.slice(0, 80) : "This device";
}

export async function listPasskeys(req: AuthRequest, res: Response): Promise<void> {
  const userId = userIdOf(req);
  const passkeys = await PasskeyCredential.find({ userId, revokedAt: { $exists: false } })
    .select("label deviceType backedUp transports lastUsedAt createdAt")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, passkeys });
}

export async function createPasskeyRegistrationOptions(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const userId = userIdOf(req);
  const user = await User.findOne({ _id: userId, accountStatus: { $ne: "deleted" }, kycStatus: "verified" })
    .select("name")
    .lean();
  if (!user) {
    res.status(403).json({ success: false, message: "Verified KYC is required to register a passkey." });
    return;
  }

  const passkeys = await PasskeyCredential.find({ userId, revokedAt: { $exists: false } })
    .select("credentialId transports")
    .lean();
  const { rpName, rpID } = config();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: userId,
    userDisplayName: user.name,
    attestationType: "none",
    timeout: FLOW_TTL_MS,
    supportedAlgorithmIDs: [-7, -257],
    excludeCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
  });

  const flowId = randomUUID();
  await WebAuthnFlow.create({
    flowId,
    userId,
    kind: "PASSKEY_REGISTRATION",
    challenge: options.challenge,
    expiresAt: new Date(Date.now() + FLOW_TTL_MS),
  });
  res.json({ success: true, flowId, options });
}

export async function verifyPasskeyRegistration(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const userId = userIdOf(req);
  const flowId = typeof req.body?.flowId === "string" ? req.body.flowId.trim() : "";
  const response = req.body?.response as RegistrationResponseJSON | undefined;
  if (!flowId || !response || typeof response.id !== "string") {
    res.status(400).json({ success: false, message: "Invalid passkey registration response." });
    return;
  }

  const flow = await WebAuthnFlow.findOneAndDelete({
    flowId,
    userId,
    kind: "PASSKEY_REGISTRATION",
    expiresAt: { $gt: new Date() },
  }).select("+challenge");
  if (!flow?.challenge) {
    res.status(400).json({ success: false, message: "Passkey registration expired. Please try again." });
    return;
  }

  const { rpID, origin } = config();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: flow.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!verification.verified) {
    res.status(400).json({ success: false, message: "Passkey registration could not be verified." });
    return;
  }

  const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo;
  const passkey = await PasskeyCredential.findOneAndUpdate(
    { credentialId: credential.id },
    {
      $setOnInsert: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        label: labelOf(req.body?.label),
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  if (passkey.userId.toString() !== userId) {
    res.status(409).json({ success: false, message: "This passkey is already registered to another account." });
    return;
  }

  res.status(201).json({ success: true, message: "Device passkey registered.", passkeyId: passkey.id });
}

export async function createPaymentAuthenticationOptions(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const userId = userIdOf(req);
  const idempotencyKey = req.get("Idempotency-Key")?.trim() || "";
  const operationHash = transferOperationHash({
    recipient: req.body?.recipient,
    amount: req.body?.amount,
    reference: req.body?.reference,
    idempotencyKey,
  });
  const passkeys = await PasskeyCredential.find({ userId, revokedAt: { $exists: false } })
    .select("credentialId transports")
    .lean();
  if (!passkeys.length) {
    res.status(404).json({ success: false, code: "PASSKEY_NOT_REGISTERED", message: "Register a device passkey first." });
    return;
  }

  const { rpID } = config();
  const options = await generateAuthenticationOptions({
    rpID,
    timeout: FLOW_TTL_MS,
    userVerification: "required",
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports as AuthenticatorTransportFuture[],
    })),
  });
  const flowId = randomUUID();
  await WebAuthnFlow.create({
    flowId,
    userId,
    kind: "PAYMENT_AUTHENTICATION",
    challenge: options.challenge,
    operationHash,
    expiresAt: new Date(Date.now() + FLOW_TTL_MS),
  });
  res.json({ success: true, flowId, options });
}

export async function verifyPaymentAuthentication(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const userId = userIdOf(req);
  const flowId = typeof req.body?.flowId === "string" ? req.body.flowId.trim() : "";
  const response = req.body?.response as AuthenticationResponseJSON | undefined;
  if (!flowId || !response || typeof response.id !== "string") {
    res.status(400).json({ success: false, message: "Invalid passkey authentication response." });
    return;
  }

  const flow = await WebAuthnFlow.findOneAndDelete({
    flowId,
    userId,
    kind: "PAYMENT_AUTHENTICATION",
    expiresAt: { $gt: new Date() },
  }).select("+challenge +operationHash");
  if (!flow?.challenge || !flow.operationHash) {
    res.status(400).json({ success: false, message: "Payment authentication expired. Please try again." });
    return;
  }

  const passkey = await PasskeyCredential.findOne({
    userId,
    credentialId: response.id,
    revokedAt: { $exists: false },
  }).select("+publicKey credentialId counter transports");
  if (!passkey) {
    res.status(400).json({ success: false, message: "The selected passkey is not registered." });
    return;
  }

  const { rpID, origin } = config();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: flow.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports as AuthenticatorTransportFuture[],
    },
  });
  if (!verification.verified || !verification.authenticationInfo.userVerified) {
    res.status(401).json({ success: false, message: "Device verification failed." });
    return;
  }

  passkey.counter = verification.authenticationInfo.newCounter;
  passkey.lastUsedAt = new Date();
  await passkey.save();
  const authorization = await issuePaymentAuthorization(userId, flow.operationHash);
  res.json({ success: true, authorization });
}

export async function revokePasskey(req: AuthRequest, res: Response): Promise<void> {
  const userId = userIdOf(req);
  const result = await PasskeyCredential.updateOne(
    { _id: req.params.id, userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
  if (result.matchedCount !== 1) {
    res.status(404).json({ success: false, message: "Passkey not found." });
    return;
  }
  res.json({ success: true, message: "Passkey revoked." });
}
