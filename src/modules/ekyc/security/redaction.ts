const NID = /\b(?:\d{10}|\d{13}|\d{17})\b/g;
const BD_PHONE = /\b(?:\+?88)?01\d{9}\b/g;
const SECRET_KEY = /(authorization|api[-_]?key|secret|token|cookie)/i;

export function maskNID(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return "********";
  return `${digits.slice(0, 4)}${"*".repeat(Math.max(4, digits.length - 8))}${digits.slice(-4)}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return `${digits.slice(0, 4)}*****${digits.slice(-2)}`;
}

export function redactText(value: string): string {
  return value.replace(NID, maskNID).replace(BD_PHONE, maskPhone);
}

export function redactForLog(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactForLog(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        redactForLog(child, childKey),
      ])
    );
  }
  return value;
}
