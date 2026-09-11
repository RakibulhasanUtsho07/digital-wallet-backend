"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateLiveness = evaluateLiveness;
const node_crypto_1 = require("node:crypto");
const MAX_CAPTURE_AGE_MS = 2 * 60 * 1000;
const MAX_FUTURE_DRIFT_MS = 30 * 1000;
const EVIDENCE_REPLAY_TTL_SECONDS = 24 * 60 * 60;
function isValidScore(score) {
    return (typeof score === "number" &&
        Number.isFinite(score) &&
        score >= 0 &&
        score <= 100);
}
function hashEvidenceId(evidenceId) {
    return (0, node_crypto_1.createHash)("sha256")
        .update(`ekyc-liveness:${evidenceId}`, "utf8")
        .digest("hex");
}
async function evaluateLiveness(result, config, redis, now = new Date()) {
    const reasons = [];
    let conclusive = result.conclusive === true;
    /* =======================================================
       CAPTURE TIME VALIDATION
    ======================================================= */
    const capturedAt = new Date(result.capturedAt);
    const capturedAtMs = capturedAt.getTime();
    const nowMs = now.getTime();
    if (!Number.isFinite(capturedAtMs)) {
        reasons.push("INVALID_CAPTURE_TIME");
        conclusive = false;
    }
    else {
        const captureAgeMs = nowMs - capturedAtMs;
        if (captureAgeMs >
            MAX_CAPTURE_AGE_MS ||
            captureAgeMs <
                -MAX_FUTURE_DRIFT_MS) {
            reasons.push("STALE_OR_INVALID_CAPTURE");
            conclusive = false;
        }
    }
    /* =======================================================
       PASSIVE LIVENESS VALIDATION
    ======================================================= */
    if (!isValidScore(result.passiveScore)) {
        reasons.push("PASSIVE_SCORE_INVALID");
        conclusive = false;
    }
    else if (result.passiveScore <
        config.thresholds
            .passiveLiveness) {
        reasons.push("PASSIVE_SCORE_LOW");
    }
    /* =======================================================
       ACTIVE LIVENESS VALIDATION
    ======================================================= */
    if (result.activeScore !==
        undefined) {
        if (!isValidScore(result.activeScore)) {
            reasons.push("ACTIVE_SCORE_INVALID");
            conclusive = false;
        }
        else if (result.activeScore <
            config.thresholds
                .activeLiveness) {
            reasons.push("ACTIVE_SCORE_LOW");
        }
    }
    if (result.challengePassed ===
        false) {
        reasons.push("ACTIVE_CHALLENGE_FAILED");
    }
    /* =======================================================
       ANTI-SPOOFING ATTACK SIGNALS
    ======================================================= */
    if (Array.isArray(result.attackSignals) &&
        result.attackSignals.length >
            0) {
        reasons.push(...result.attackSignals);
    }
    /* =======================================================
       EVIDENCE REPLAY PROTECTION
    ======================================================= */
    const evidenceId = result.evidenceId?.trim();
    if (!evidenceId ||
        evidenceId.length > 240) {
        reasons.push("LIVENESS_EVIDENCE_INVALID");
        conclusive = false;
    }
    else {
        const evidenceHash = hashEvidenceId(evidenceId);
        /*
         * SET NX নিশ্চিত করে একই liveness evidence
         * একাধিক account বা verification attempt-এ
         * পুনরায় ব্যবহার করা যাবে না।
         */
        const evidenceClaimed = await redis.set(`ekyc:liveness-evidence:${evidenceHash}`, "1", "EX", EVIDENCE_REPLAY_TTL_SECONDS, "NX");
        if (evidenceClaimed !== "OK") {
            reasons.push("LIVENESS_EVIDENCE_REPLAYED");
        }
    }
    return {
        passed: result.passed === true &&
            reasons.length === 0,
        conclusive,
        reasons: [
            ...new Set(reasons),
        ],
    };
}
