/** Normalise a LinkedIn URL for matching (drop protocol, www, query, trailing /). */
export const normLinkedinUrl = (u: string | null | undefined): string => {
  if (!u) return '';
  return u.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[?#]/)[0]
    .replace(/\/+$/, '');
};

/**
 * Fuzzy comparator for "is this the same person?" between two free-text
 * names (e.g. a CSV name and a bank-verified name). Strips whitespace,
 * lowercases, then compares as a sorted-token set so "John Doe" and
 * "DOE JOHN" match. Also matches when one is a strict subset of the other
 * (one side may include a middle name the other dropped).
 */
export function namesAreEquivalent(a: string, b: string): boolean {
  const tok = (s: string) =>
    s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).sort();
  const ta = tok(a);
  const tb = tok(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.join(' ') === tb.join(' ')) return true;
  // Subset match — every short-side token appears in the long side.
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.includes(t));
}
