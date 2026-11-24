/**
 * Small inline formatting for long text cells: **bold**, *italic*, ~~strike~~ and `code`.
 * These are the marks the editor toolbar writes. The result is a list of pieces that React
 * renders as elements, so nothing is ever inserted as raw HTML.
 */

export type InlinePiece =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'italic' | 'strike' | 'code'; text: string };

const PATTERNS: { kind: 'bold' | 'italic' | 'strike' | 'code'; re: RegExp }[] = [
  { kind: 'code', re: /`([^`\n]+)`/ },
  { kind: 'bold', re: /\*\*([^*\n]+)\*\*/ },
  { kind: 'strike', re: /~~([^~\n]+)~~/ },
  // A single * pair that is not part of **; "2 * 3 * 4" still reads as arithmetic because of the spaces rule.
  { kind: 'italic', re: /(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/ },
];

export function parseInline(text: string): InlinePiece[] {
  if (!text) return [];
  // Find the earliest mark in the text, emit what is before it, then continue after it.
  let best: { index: number; length: number; kind: InlinePiece['kind']; inner: string } | null = null;
  for (const { kind, re } of PATTERNS) {
    const m = re.exec(text);
    if (m && (best === null || m.index < best.index)) {
      best = { index: m.index, length: m[0].length, kind, inner: m[1] };
    }
  }
  if (!best) return [{ kind: 'text', text }];
  const pieces: InlinePiece[] = [];
  if (best.index > 0) pieces.push({ kind: 'text', text: text.slice(0, best.index) });
  pieces.push({ kind: best.kind as 'bold' | 'italic' | 'strike' | 'code', text: best.inner });
  return pieces.concat(parseInline(text.slice(best.index + best.length)));
}

/** True when the text holds at least one mark, so plain text can skip the work. */
export function hasInlineMarks(text: string): boolean {
  return /[*~`]/.test(text) && parseInline(text).some((p) => p.kind !== 'text');
}
