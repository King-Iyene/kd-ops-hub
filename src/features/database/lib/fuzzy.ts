/**
 * Small fuzzy matcher for the navigation pickers (command palette, table
 * switcher, sidebar search). Pure and dependency free so it can be tested.
 *
 * Ranking, best first: exact match, prefix, start of a word, plain substring,
 * then a subsequence ("kdsf" finds "KDS Finances"). A query with several words
 * needs every word to match somewhere; the word scores add up.
 */

export interface FuzzyMatch {
  /** Higher is better. 0 for an empty query. */
  score: number;
  /** Positions in the original text that matched, ascending, for highlighting. */
  indices: number[];
}

const SCORE_EXACT = 1000;
const SCORE_PREFIX = 900;
const SCORE_WORD_START = 700;
const SCORE_SUBSTRING = 500;
const SCORE_SUBSEQUENCE = 100;

function isWordBoundary(text: string, index: number): boolean {
  if (index === 0) return true;
  return /[^a-z0-9]/i.test(text.charAt(index - 1));
}

function range(start: number, length: number): number[] {
  return Array.from({ length }, (_, i) => start + i);
}

function matchToken(token: string, text: string): FuzzyMatch | null {
  const lowerText = text.toLowerCase();

  if (lowerText === token) return { score: SCORE_EXACT, indices: range(0, token.length) };

  if (lowerText.startsWith(token)) {
    // Shorter names rank above longer ones for the same prefix.
    return { score: SCORE_PREFIX - Math.min(lowerText.length - token.length, 99), indices: range(0, token.length) };
  }

  // Start of a later word ("fin" in "KDS Finances"), earliest one wins.
  let from = 0;
  let firstSubstring = -1;
  for (;;) {
    const at = lowerText.indexOf(token, from);
    if (at === -1) break;
    if (firstSubstring === -1) firstSubstring = at;
    if (isWordBoundary(text, at)) {
      return { score: SCORE_WORD_START - Math.min(at, 99), indices: range(at, token.length) };
    }
    from = at + 1;
  }

  if (firstSubstring !== -1) {
    return { score: SCORE_SUBSTRING - Math.min(firstSubstring, 99), indices: range(firstSubstring, token.length) };
  }

  // Subsequence: every character in order, not necessarily next to each other.
  const indices: number[] = [];
  let cursor = 0;
  for (const ch of token) {
    const at = lowerText.indexOf(ch, cursor);
    if (at === -1) return null;
    indices.push(at);
    cursor = at + 1;
  }
  let adjacent = 0;
  for (let i = 1; i < indices.length; i++) if (indices[i] === indices[i - 1] + 1) adjacent++;
  const span = indices[indices.length - 1] - indices[0] + 1;
  const score = SCORE_SUBSEQUENCE + adjacent * 10 - (span - indices.length);
  return { score: Math.max(1, Math.min(score, SCORE_SUBSTRING - 100)), indices };
}

/** Match a query against one piece of text. `null` means no match. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { score: 0, indices: [] };

  let score = 0;
  const seen = new Set<number>();
  for (const token of tokens) {
    const m = matchToken(token, text);
    if (!m) return null;
    score += m.score;
    for (const i of m.indices) seen.add(i);
  }
  return { score, indices: [...seen].sort((a, b) => a - b) };
}

export interface FuzzyResult<T> {
  item: T;
  match: FuzzyMatch;
}

/**
 * Filter and rank items. With an empty query every item is returned in its
 * original order. Equal scores keep their original order, so callers can
 * pre-sort (pinned first, then by position) and rely on that as the tie-break.
 */
export function fuzzyFilter<T>(items: readonly T[], query: string, getText: (item: T) => string): FuzzyResult<T>[] {
  if (!query.trim()) return items.map((item) => ({ item, match: { score: 0, indices: [] } }));

  const scored: Array<FuzzyResult<T> & { order: number }> = [];
  items.forEach((item, order) => {
    const match = fuzzyMatch(query, getText(item));
    if (match) scored.push({ item, match, order });
  });
  scored.sort((a, b) => b.match.score - a.match.score || a.order - b.order);
  return scored.map(({ item, match }) => ({ item, match }));
}

/** Split text into runs so a renderer can bold the matched characters. */
export function highlightRuns(text: string, indices: readonly number[]): Array<{ text: string; match: boolean }> {
  if (indices.length === 0) return [{ text, match: false }];
  const hit = new Set(indices);
  const runs: Array<{ text: string; match: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const match = hit.has(i);
    const last = runs[runs.length - 1];
    if (last && last.match === match) last.text += text.charAt(i);
    else runs.push({ text: text.charAt(i), match });
  }
  return runs;
}
