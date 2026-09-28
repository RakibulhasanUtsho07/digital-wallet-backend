import type {
  AiToolResult,
} from "../types/cofferAi.types.js";

export interface AiGroundedVerificationResult {
  accepted: boolean;
  reason: string;
}

const IDENTIFIER_PATTERN =
  /\b(?:pay|payment|ch)_[a-z0-9_-]{6,120}\b|\b[0-9a-f]{24}\b/gi;

const LARGE_NUMBER_PATTERN =
  /\b\d{4,}\b/g;

function evidenceText(
  toolResult: AiToolResult,
): string {
  return [
    toolResult.summary,
    ...toolResult.facts.map(
      (fact) =>
        `${fact.label}: ${String(fact.value ?? "")}`,
    ),
    ...toolResult.sources.map(
      (source) =>
        `${source.label}: ${source.reference}`,
    ),
    ...toolResult.suggestedActions.map(
      (action) =>
        action.label,
    ),
  ]
    .join("\n")
    .toLowerCase();
}

function uniqueMatches(
  text: string,
  pattern: RegExp,
): string[] {
  return Array.from(
    new Set(
      text.match(pattern) ?? [],
    ),
  );
}

export function verifyGroundedModelResponse(input: {
  draft: string;
  toolResult: AiToolResult;
}): AiGroundedVerificationResult {
  const draft =
    input.draft.trim();

  if (!draft) {
    return {
      accepted: false,
      reason:
        "EMPTY_DRAFT",
    };
  }

  if (draft.length > 6_000) {
    return {
      accepted: false,
      reason:
        "DRAFT_TOO_LONG",
    };
  }

  const evidence =
    evidenceText(
      input.toolResult,
    );

  const identifiers =
    uniqueMatches(
      draft,
      IDENTIFIER_PATTERN,
    );

  for (const value of identifiers) {
    if (
      !evidence.includes(
        value.toLowerCase(),
      )
    ) {
      return {
        accepted: false,
        reason:
          "UNSUPPORTED_IDENTIFIER",
      };
    }
  }

  const largeNumbers =
    uniqueMatches(
      draft,
      LARGE_NUMBER_PATTERN,
    );

  for (const value of largeNumbers) {
    if (
      !evidence.includes(
        value,
      )
    ) {
      return {
        accepted: false,
        reason:
          "UNSUPPORTED_NUMBER",
      };
    }
  }

  return {
    accepted: true,
    reason:
      "EVIDENCE_TOKEN_CHECK_PASSED",
  };
}
