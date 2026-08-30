import crypto from "crypto";

const BASE32_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (
  input: Buffer
): string => {
  let bits = "";
  let output = "";

  for (const byte of input) {
    bits += byte
      .toString(2)
      .padStart(8, "0");
  }

  for (
    let index = 0;
    index < bits.length;
    index += 5
  ) {
    const chunk = bits
      .slice(index, index + 5)
      .padEnd(5, "0");

    output +=
      BASE32_ALPHABET[
        Number.parseInt(
          chunk,
          2
        )
      ] ?? "";
  }

  return output;
};

export const base32Decode = (
  input: string
): Buffer => {
  const normalized = input
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/\s+/g, "");

  let bits = "";

  for (const character of normalized) {
    const index =
      BASE32_ALPHABET.indexOf(
        character
      );

    if (index < 0) {
      throw new Error(
        "Invalid Base32 secret."
      );
    }

    bits += index
      .toString(2)
      .padStart(5, "0");
  }

  const bytes: number[] = [];

  for (
    let index = 0;
    index + 8 <= bits.length;
    index += 8
  ) {
    bytes.push(
      Number.parseInt(
        bits.slice(
          index,
          index + 8
        ),
        2
      )
    );
  }

  return Buffer.from(bytes);
};

export const generateTotpSecret =
  (): string => {
    return base32Encode(
      crypto.randomBytes(20)
    );
  };

const generateTotpAtCounter = (
  secret: string,
  counter: number
): string => {
  const key =
    base32Decode(secret);

  const buffer =
    Buffer.alloc(8);

  const high = Math.floor(
    counter / 0x100000000
  );
  const low =
    counter >>> 0;

  buffer.writeUInt32BE(
    high,
    0
  );
  buffer.writeUInt32BE(
    low,
    4
  );

  const digest = crypto
    .createHmac(
      "sha1",
      key
    )
    .update(buffer)
    .digest();

  const offset =
    digest[
      digest.length - 1
    ]! & 0x0f;

  const binary =
    (
      ((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff)
    ) >>> 0;

  return String(
    binary % 1_000_000
  ).padStart(6, "0");
};

export const verifyTotp = (
  secret: string,
  code: string,
  nowMs: number = Date.now()
): boolean => {
  const normalized =
    code.replace(/\s+/g, "");

  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  const counter = Math.floor(
    nowMs / 1000 / 30
  );

  for (const drift of [
    -1,
    0,
    1,
  ]) {
    const expected =
      generateTotpAtCounter(
        secret,
        counter + drift
      );

    const a = Buffer.from(
      expected
    );
    const b = Buffer.from(
      normalized
    );

    if (
      a.length === b.length &&
      crypto.timingSafeEqual(
        a,
        b
      )
    ) {
      return true;
    }
  }

  return false;
};

export const buildOtpAuthUri = ({
  secret,
  accountLabel,
}: {
  secret: string;
  accountLabel: string;
}): string => {
  const issuer = "Coffer";

  return (
    `otpauth://totp/${encodeURIComponent(
      `${issuer}:${accountLabel}`
    )}` +
    `?secret=${encodeURIComponent(
      secret
    )}` +
    `&issuer=${encodeURIComponent(
      issuer
    )}` +
    "&algorithm=SHA1&digits=6&period=30"
  );
};
