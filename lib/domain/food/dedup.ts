/**
 * Food library deduplication — pure, no database and no framework.
 *
 * docs/15-FOOD-SPEC.md section 4.1. The match is deterministic and runs
 * before anything is written. The user decides: this module only offers
 * candidates, it never merges anything on its own (FD-10).
 */

export interface LibraryCandidate {
  id: string;
  name: string;
  timesEaten: number;
}

export interface MatchResult {
  /** Exact match on the normalised form, if any. */
  exact: LibraryCandidate | null;
  /** Up to three closest candidates by edit distance, when there is no exact match. */
  suggestions: LibraryCandidate[];
  /** True when neither an exact match nor a suggestion was found. */
  isNew: boolean;
}

/** Lowercase, strip punctuation, collapse whitespace (section 4.1 step 1). */
export function normaliseFoodName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Classic edit-distance, iterative two-row DP — no recursion, no library. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  let currentRow = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    currentRow[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        previousRow[j] + 1, // deletion
        currentRow[j - 1] + 1, // insertion
        previousRow[j - 1] + cost, // substitution
      );
    }
    [previousRow, currentRow] = [currentRow, previousRow];
  }
  return previousRow[b.length];
}

/**
 * The threshold scales with name length so "dal" and "dhal" (short, same
 * distance-1 typo) match while two unrelated four-letter words do not
 * (section 4.1 step 3): distance <= 2 under 12 characters, <= 3 at or above.
 */
function thresholdFor(normalisedLength: number): number {
  return normalisedLength < 12 ? 2 : 3;
}

/**
 * Matches a candidate name against the Home's library. Exact match on the
 * normalised form wins outright; otherwise the closest three within the
 * length-scaled threshold are offered, closest first, ties broken by name for
 * determinism. Below the threshold for everyone, it is new.
 */
export function matchFoodName(
  candidateName: string,
  library: LibraryCandidate[],
): MatchResult {
  const normalisedCandidate = normaliseFoodName(candidateName);

  const exact = library.find(
    (entry) => normaliseFoodName(entry.name) === normalisedCandidate,
  );
  if (exact) {
    return { exact, suggestions: [], isNew: false };
  }

  const threshold = thresholdFor(normalisedCandidate.length);
  const scored = library
    .map((entry) => ({
      entry,
      distance: levenshtein(normalisedCandidate, normaliseFoodName(entry.name)),
    }))
    .filter(({ distance }) => distance <= threshold)
    .sort((a, b) => a.distance - b.distance || a.entry.name.localeCompare(b.entry.name))
    .slice(0, 3)
    .map(({ entry }) => entry);

  return { exact: null, suggestions: scored, isNew: scored.length === 0 };
}
