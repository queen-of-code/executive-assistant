import type { Issue } from "./types";

// ─── Fuzzy Matching ───────────────────────────────────────────────────────────
//
// Used by /done to match a user's freeform description against open issue titles.
// Strategy: Levenshtein distance for obvious matches; returns ranked candidates
// for ambiguous ones so the caller can ask the user to confirm.
//
// No LLM used here — LLM disambiguation is handled at the command level (Phase 2).

export interface FuzzyMatch {
  issue: Issue;
  score: number;
  /** 0–1, where 1 is a perfect match */
  normalizedScore: number;
}

// Threshold below which a match is considered unambiguous enough to auto-accept
const AUTO_ACCEPT_THRESHOLD = 0.85;

/**
 * Finds the best matching issue(s) for a given query string.
 *
 * Returns:
 *   - { type: "exact", match } — one clear winner above the auto-accept threshold
 *   - { type: "ambiguous", candidates } — multiple close matches; ask the user
 *   - { type: "none" } — nothing close enough
 */
export function matchIssue(
  query: string,
  issues: Issue[]
): | { type: "exact"; match: FuzzyMatch }
  | { type: "ambiguous"; candidates: FuzzyMatch[] }
  | { type: "none" } {
  if (issues.length === 0) return { type: "none" };

  const normalizedQuery = normalize(query);
  const matches: FuzzyMatch[] = issues
    .map((issue) => {
      const normalizedTitle = normalize(issue.title);
      const score = similarity(normalizedQuery, normalizedTitle);
      return { issue, score, normalizedScore: score };
    })
    .filter((m) => m.score > 0.3)
    .sort((a, b) => b.score - a.score);

  if (matches.length === 0) return { type: "none" };

  const best = matches[0];

  // Clear winner
  if (best.score >= AUTO_ACCEPT_THRESHOLD) {
    return { type: "exact", match: best };
  }

  // Multiple candidates within 0.15 of each other — ambiguous
  const threshold = best.score - 0.15;
  const candidates = matches.filter((m) => m.score >= threshold).slice(0, 5);
  if (candidates.length === 1) {
    return { type: "exact", match: candidates[0] };
  }

  return { type: "ambiguous", candidates };
}

// ─── String Normalization ─────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Similarity Scoring ───────────────────────────────────────────────────────

/**
 * Composite similarity: Levenshtein + token overlap.
 * Both components are normalized to [0, 1] and averaged.
 */
function similarity(a: string, b: string): number {
  const lev = levenshteinSimilarity(a, b);
  const token = tokenOverlapSimilarity(a, b);
  // Weight token overlap slightly more — partial phrase matches are meaningful
  return lev * 0.4 + token * 0.6;
}

function levenshteinSimilarity(a: string, b: string): number {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

function tokenOverlapSimilarity(a: string, b: string): number {
  const tokA = new Set(a.split(" ").filter((t) => t.length > 2));
  const tokB = new Set(b.split(" ").filter((t) => t.length > 2));
  if (tokA.size === 0 && tokB.size === 0) return 1;
  if (tokA.size === 0 || tokB.size === 0) return 0;

  let overlap = 0;
  for (const t of tokA) {
    if (tokB.has(t)) overlap++;
  }
  return overlap / Math.max(tokA.size, tokB.size);
}

// ─── Levenshtein Distance ─────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  // Cap at 200 chars to keep this O(n²) operation bounded
  const s = a.slice(0, 200);
  const t = b.slice(0, 200);
  const m = s.length;
  const n = t.length;

  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s[i - 1] === t[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] =
          1 +
          Math.min(
            dp[i - 1][j],   // delete
            dp[i][j - 1],   // insert
            dp[i - 1][j - 1] // replace
          );
      }
    }
  }

  return dp[m][n];
}
