"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrIssueEKYCDeviceId = getOrIssueEKYCDeviceId;
const node_crypto_1 = require("node:crypto");
const COOKIE_NAME = "coffer_ekyc_device";
function getSecret() {
    const secret = process.env.EKYC_DEVICE_COOKIE_SECRET?.trim();
    if (!secret || secret.length < 32) {
        throw new Error("EKYC_DEVICE_COOKIE_SECRET must contain at least 32 characters.");
    }
    return secret;
}
function signatureFor(id) {
    return (0, node_crypto_1.createHmac)("sha256", getSecret()).update(`ekyc-device:${id}`).digest("base64url");
}
function parseCookieHeader(value) {
    if (!value)
        return {};
    return value.split(";").reduce((result, part) => {
        const index = part.indexOf("=");
        if (index < 1)
            return result;
        const key = part.slice(0, index).trim();
        const raw = part.slice(index + 1).trim();
        try {
            result[key] = decodeURIComponent(raw);
        }
        catch {
            result[key] = raw;
        }
        return result;
    }, {});
}
function verifyToken(value) {
    if (!value || value.length > 200)
        return null;
    const separator = value.lastIndexOf(".");
    if (separator <= 0)
        return null;
    const id = value.slice(0, separator);
    const supplied = value.slice(separator + 1);
    if (!/^[0-9a-f-]{36}$/i.test(id))
        return null;
    const expected = signatureFor(id);
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !(0, node_crypto_1.timingSafeEqual)(left, right))
        return null;
    return id;
}
function getOrIssueEKYCDeviceId(request, response) {
    const cookies = parseCookieHeader(request.headers.cookie);
    const existing = verifyToken(cookies[COOKIE_NAME]);
    if (existing)
        return existing;
    const id = (0, node_crypto_1.randomUUID)();
    const token = `${id}.${signatureFor(id)}`;
    response.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 365 * 24 * 60 * 60 * 1_000,
        path: "/api/ekyc",
    });
    return id;
}
