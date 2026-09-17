export interface AiSanitizedText {
  content: string;
  detections: ReadonlyArray<
    "bearer_token" | "api_secret" | "jwt" | "credential_assignment"
  >;
}

function replaceAndTrack(
  text: string,
  pattern: RegExp,
  replacement: string,
  detection: AiSanitizedText["detections"][number],
  detections: Set<AiSanitizedText["detections"][number]>,
): string {
  if (!pattern.test(text)) {
    pattern.lastIndex = 0;
    return text;
  }

  pattern.lastIndex = 0;
  detections.add(detection);
  return text.replace(pattern, replacement);
}

export function sanitizeAiText(value: string): AiSanitizedText {
  const detections = new Set<
    AiSanitizedText["detections"][number]
  >();
  let content = value;

  content = replaceAndTrack(
    content,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
    "Bearer [REDACTED]",
    "bearer_token",
    detections,
  );

  content = replaceAndTrack(
    content,
    /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b/g,
    "[REDACTED_SECRET]",
    "api_secret",
    detections,
  );

  content = replaceAndTrack(
    content,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    "[REDACTED_TOKEN]",
    "jwt",
    detections,
  );

  content = replaceAndTrack(
    content,
    /\b(password|passcode|otp|api[ _-]?secret|secret key)\s*[:=]\s*[^\s,;]+/gi,
    "$1: [REDACTED]",
    "credential_assignment",
    detections,
  );

  return {
    content: content.trim(),
    detections: [...detections],
  };
}
