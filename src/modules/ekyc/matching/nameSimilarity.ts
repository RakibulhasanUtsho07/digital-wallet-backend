export interface NameSimilarityResult {
  score: number;
  requiresTransliteration: boolean;
  normalizedLeft: string;
  normalizedRight: string;
}

type NameScript =
  | "BENGALI"
  | "LATIN"
  | "MIXED"
  | "UNKNOWN";

/* =========================================================
   NORMALIZATION
========================================================= */

export function normalizeName(
  value: string
): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(
      /[\p{P}\p{S}]+/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function detectScript(
  value: string
): NameScript {
  const hasBengali =
    /[\u0980-\u09FF]/u.test(
      value
    );

  const hasLatin =
    /[A-Za-z]/u.test(
      value
    );

  if (
    hasBengali &&
    hasLatin
  ) {
    return "MIXED";
  }

  if (hasBengali) {
    return "BENGALI";
  }

  if (hasLatin) {
    return "LATIN";
  }

  return "UNKNOWN";
}

/* =========================================================
   JARO SIMILARITY
========================================================= */

function jaroSimilarity(
  leftValue: string,
  rightValue: string
): number {
  const left =
    Array.from(
      leftValue
    );

  const right =
    Array.from(
      rightValue
    );

  if (
    leftValue ===
    rightValue
  ) {
    return 1;
  }

  if (
    left.length === 0 ||
    right.length === 0
  ) {
    return 0;
  }

  const matchDistance =
    Math.max(
      Math.floor(
        Math.max(
          left.length,
          right.length
        ) / 2
      ) - 1,
      0
    );

  const leftMatches =
    new Array<boolean>(
      left.length
    ).fill(false);

  const rightMatches =
    new Array<boolean>(
      right.length
    ).fill(false);

  let matches = 0;

  for (
    let leftIndex = 0;
    leftIndex < left.length;
    leftIndex += 1
  ) {
    const start =
      Math.max(
        0,
        leftIndex -
          matchDistance
      );

    const end =
      Math.min(
        leftIndex +
          matchDistance +
          1,
        right.length
      );

    for (
      let rightIndex =
        start;
      rightIndex < end;
      rightIndex += 1
    ) {
      if (
        rightMatches[
          rightIndex
        ] ||
        left[leftIndex] !==
          right[rightIndex]
      ) {
        continue;
      }

      leftMatches[
        leftIndex
      ] = true;

      rightMatches[
        rightIndex
      ] = true;

      matches += 1;
      break;
    }
  }

  if (
    matches === 0
  ) {
    return 0;
  }

  const matchedLeft:
    string[] = [];

  const matchedRight:
    string[] = [];

  for (
    let index = 0;
    index < left.length;
    index += 1
  ) {
    if (
      leftMatches[index]
    ) {
      matchedLeft.push(
        left[index]!
      );
    }
  }

  for (
    let index = 0;
    index < right.length;
    index += 1
  ) {
    if (
      rightMatches[index]
    ) {
      matchedRight.push(
        right[index]!
      );
    }
  }

  let transpositions = 0;

  for (
    let index = 0;
    index <
    matchedLeft.length;
    index += 1
  ) {
    if (
      matchedLeft[index] !==
      matchedRight[index]
    ) {
      transpositions += 1;
    }
  }

  return (
    matches / left.length +
    matches / right.length +
    (
      matches -
      transpositions / 2
    ) /
      matches
  ) / 3;
}

/* =========================================================
   JARO-WINKLER
========================================================= */

function calculateJaroWinkler(
  left: string,
  right: string
): number {
  const baseScore =
    jaroSimilarity(
      left,
      right
    );

  const leftCharacters =
    Array.from(left);

  const rightCharacters =
    Array.from(right);

  let commonPrefixLength = 0;

  while (
    commonPrefixLength <
      Math.min(
        4,
        leftCharacters.length,
        rightCharacters.length
      ) &&
    leftCharacters[
      commonPrefixLength
    ] ===
      rightCharacters[
        commonPrefixLength
      ]
  ) {
    commonPrefixLength += 1;
  }

  return (
    baseScore +
    commonPrefixLength *
      0.1 *
      (1 - baseScore)
  );
}

function sortNameTokens(
  value: string
): string {
  return value
    .split(" ")
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.localeCompare(
          right
        )
    )
    .join(" ");
}

/* =========================================================
   PUBLIC MATCHING
========================================================= */

export function jaroWinkler(
  leftInput: string,
  rightInput: string
): NameSimilarityResult {
  const left =
    normalizeName(
      leftInput
    );

  const right =
    normalizeName(
      rightInput
    );

  const leftScript =
    detectScript(left);

  const rightScript =
    detectScript(right);

  const crossScript =
    (
      leftScript ===
        "BENGALI" &&
      rightScript ===
        "LATIN"
    ) ||
    (
      leftScript ===
        "LATIN" &&
      rightScript ===
        "BENGALI"
    );

  if (crossScript) {
    return {
      score: 0,
      requiresTransliteration:
        true,
      normalizedLeft:
        left,
      normalizedRight:
        right,
    };
  }

  if (
    !left ||
    !right
  ) {
    return {
      score: 0,
      requiresTransliteration:
        false,
      normalizedLeft:
        left,
      normalizedRight:
        right,
    };
  }

  const directScore =
    calculateJaroWinkler(
      left,
      right
    );

  /*
   * Token-sorted comparison handles minor name-order
   * differences without automatically changing scripts.
   */
  const sortedScore =
    calculateJaroWinkler(
      sortNameTokens(left),
      sortNameTokens(right)
    );

  const finalScore =
    Math.max(
      directScore,
      sortedScore
    );

  return {
    score:
      Math.round(
        finalScore * 10_000
      ) / 100,

    requiresTransliteration:
      false,

    normalizedLeft:
      left,

    normalizedRight:
      right,
  };
}

export function bestNameScore(
  claimedName: string,
  candidates:
    Array<
      string | undefined
    >
): NameSimilarityResult {
  const results =
    candidates
      .filter(
        (
          candidate
        ): candidate is string =>
          Boolean(
            candidate?.trim()
          )
      )
      .map(
        (candidate) =>
          jaroWinkler(
            claimedName,
            candidate
          )
      );

  return (
    results.sort(
      (left, right) =>
        right.score -
        left.score
    )[0] || {
      score: 0,

      requiresTransliteration:
        false,

      normalizedLeft:
        normalizeName(
          claimedName
        ),

      normalizedRight:
        "",
    }
  );
}