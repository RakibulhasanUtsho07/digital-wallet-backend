import crypto from "crypto";

import type {
  Request,
} from "express";

/* =========================================================
   TYPES
========================================================= */

export interface SecurityRequestMetadata {
  device: string;
  browser: string;
  os: string;
  location: string;
  maskedIp: string;
  ipHash: string;
  userAgentHash: string;
}

/* =========================================================
   HELPERS
========================================================= */

const toHeaderString = (
  value:
    | string
    | string[]
    | undefined
): string => {
  if (
    Array.isArray(value)
  ) {
    return value[0] ?? "";
  }

  return value ?? "";
};

const getHashKey =
  (): string => {
    const key =
      process.env
        .SECURITY_METADATA_HMAC_KEY ||
      process.env
        .LOOKUP_HMAC_KEY ||
      process.env
        .JWT_SECRET;

    if (!key) {
      throw new Error(
        "SECURITY_METADATA_HMAC_KEY, LOOKUP_HMAC_KEY or JWT_SECRET is required."
      );
    }

    return key;
  };

export const createSecurityHash = (
  value: string
): string => {
  return crypto
    .createHmac(
      "sha256",
      getHashKey()
    )
    .update(value)
    .digest("hex");
};

/* =========================================================
   IP
========================================================= */

const normalizeIp = (
  req: Request
): string => {
  /*
   * app.set("trust proxy", 1) already exists in the project,
   * therefore Express resolves the trusted forwarded address
   * through req.ip. Avoid reading x-forwarded-for manually.
   */
  const value =
    req.ip ||
    req.socket.remoteAddress ||
    "unknown";

  return value.replace(
    /^::ffff:/,
    ""
  );
};

export const maskIpAddress = (
  ip: string
): string => {
  if (
    !ip ||
    ip === "unknown"
  ) {
    return "Unknown";
  }

  if (
    ip.includes(".")
  ) {
    const parts =
      ip.split(".");

    if (
      parts.length === 4
    ) {
      return `${parts[0]}.${parts[1]}.xx.xx`;
    }
  }

  if (
    ip.includes(":")
  ) {
    const parts =
      ip
        .split(":")
        .filter(Boolean);

    return `${parts
      .slice(0, 3)
      .join(":")}:xxxx:xxxx`;
  }

  return "Masked";
};

/* =========================================================
   USER AGENT PARSING
========================================================= */

const parseBrowser = (
  userAgent: string
): string => {
  if (/Edg\//i.test(userAgent)) {
    return "Edge";
  }

  if (/OPR\//i.test(userAgent)) {
    return "Opera";
  }

  if (/Chrome\//i.test(userAgent)) {
    return "Chrome";
  }

  if (/Firefox\//i.test(userAgent)) {
    return "Firefox";
  }

  if (
    /Safari\//i.test(userAgent) &&
    !/Chrome\//i.test(userAgent)
  ) {
    return "Safari";
  }

  return "Unknown Browser";
};

const parseOs = (
  userAgent: string
): string => {
  if (
    /Windows NT 10/i.test(
      userAgent
    )
  ) {
    return "Windows";
  }

  if (
    /Mac OS X/i.test(
      userAgent
    )
  ) {
    return "macOS";
  }

  if (
    /Android/i.test(
      userAgent
    )
  ) {
    return "Android";
  }

  if (
    /iPhone|iPad|iPod/i.test(
      userAgent
    )
  ) {
    return "iOS";
  }

  if (
    /Linux/i.test(
      userAgent
    )
  ) {
    return "Linux";
  }

  return "Unknown OS";
};

const parseDevice = (
  userAgent: string,
  os: string
): string => {
  if (
    /iPhone/i.test(
      userAgent
    )
  ) {
    return "iPhone";
  }

  if (
    /iPad/i.test(
      userAgent
    )
  ) {
    return "iPad";
  }

  if (
    /Android/i.test(
      userAgent
    )
  ) {
    return /Mobile/i.test(
      userAgent
    )
      ? "Android Phone"
      : "Android Device";
  }

  if (
    os === "macOS"
  ) {
    return "Mac";
  }

  if (
    os === "Windows"
  ) {
    return "Windows PC";
  }

  if (
    os === "Linux"
  ) {
    return "Linux Device";
  }

  return "Unknown Device";
};

/* =========================================================
   LOCATION
========================================================= */

const safeDecode = (
  value: string
): string => {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(
      value
    );
  } catch {
    return value;
  }
};

const getLocation = (
  req: Request
): string => {
  const city =
    safeDecode(
      toHeaderString(
        req.headers[
          "x-vercel-ip-city"
        ]
      )
    );

  const country =
    toHeaderString(
      req.headers[
        "x-vercel-ip-country"
      ]
    );

  if (
    city &&
    country
  ) {
    return `${city}, ${country}`;
  }

  if (country) {
    return country;
  }

  return "Unknown location";
};

/* =========================================================
   PUBLIC API
========================================================= */

export const getSecurityRequestMetadata = (
  req: Request
): SecurityRequestMetadata => {
  const ip =
    normalizeIp(req);

  const userAgent =
    req.get(
      "user-agent"
    ) ||
    "unknown";

  const browser =
    parseBrowser(
      userAgent
    );

  const os =
    parseOs(
      userAgent
    );

  const device =
    parseDevice(
      userAgent,
      os
    );

  return {
    device,
    browser,
    os,
    location:
      getLocation(req),
    maskedIp:
      maskIpAddress(ip),
    ipHash:
      createSecurityHash(ip),
    userAgentHash:
      createSecurityHash(
        userAgent
      ),
  };
};
