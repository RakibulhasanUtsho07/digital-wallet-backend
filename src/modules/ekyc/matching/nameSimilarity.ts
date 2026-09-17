export interface NameSimilarityResult {
  score: number;
  requiresTransliteration: boolean;
  normalizedLeft: string;
  normalizedRight: string;
}

const BENGALI = /[\u0980-\u09FF]/u;
const LATIN = /[A-Za-z]/u;

export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaro(left: string, right: string): number {
  if (left === right) return 1;
  if (!left.length || !right.length) return 0;

  const range = Math.max(Math.floor(Math.max(left.length, right.length) / 2) - 1, 0);
  const leftMatched = new Array<boolean>(left.length).fill(false);
  const rightMatched = new Array<boolean>(right.length).fill(false);
  let matches = 0;

  for (let i = 0; i < left.length; i += 1) {
    const start = Math.max(0, i - range);
    const end = Math.min(i + range + 1, right.length);
    for (let j = start; j < end; j += 1) {
      if (rightMatched[j] || left[i] !== right[j]) continue;
      leftMatched[i] = true;
      rightMatched[j] = true;
      matches += 1;
      break;
    }
  }
  if (!matches) return 0;

  const leftChars: string[] = [];
  const rightChars: string[] = [];
  for (let i = 0; i < left.length; i += 1) if (leftMatched[i]) leftChars.push(left[i]!);
  for (let i = 0; i < right.length; i += 1) if (rightMatched[i]) rightChars.push(right[i]!);
  let transpositions = 0;
  for (let i = 0; i < leftChars.length; i += 1) {
    if (leftChars[i] !== rightChars[i]) transpositions += 1;
  }

  return (
    matches / left.length +
    matches / right.length +
    (matches - transpositions / 2) / matches
  ) / 3;
}

export function jaroWinkler(leftInput: string, rightInput: string): NameSimilarityResult {
  const left = normalizeName(leftInput);
  const right = normalizeName(rightInput);
  const crossScript =
    (BENGALI.test(left) && LATIN.test(right) && !BENGALI.test(right)) ||
    (BENGALI.test(right) && LATIN.test(left) && !BENGALI.test(left));

  // Fuzzy distance cannot compare Bengali and Latin transliterations reliably. Compare
  // same-script EC/OCR fields, or use an approved transliteration model before this step.
  if (crossScript) {
    return { score: 0, requiresTransliteration: true, normalizedLeft: left, normalizedRight: right };
  }

  const base = jaro(left, right);
  let prefix = 0;
  while (prefix < Math.min(4, left.length, right.length) && left[prefix] === right[prefix]) {
    prefix += 1;
  }
  const score = Math.round((base + prefix * 0.1 * (1 - base)) * 10_000) / 100;
  return { score, requiresTransliteration: false, normalizedLeft: left, normalizedRight: right };
}

export function bestNameScore(claimedName: string, candidates: Array<string | undefined>): NameSimilarityResult {
  const results = candidates.filter((value): value is string => Boolean(value)).map((value) => jaroWinkler(claimedName, value));
  return results.sort((a, b) => b.score - a.score)[0] ?? {
    score: 0,
    requiresTransliteration: false,
    normalizedLeft: normalizeName(claimedName),
    normalizedRight: "",
  };
}
