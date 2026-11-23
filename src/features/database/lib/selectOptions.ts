import type { SelectChoice } from '../types';

/**
 * Small rules shared by the select editors and by paste, kept free of the screen so they can be tested.
 */

/** Pasted text becomes separate options: commas, semicolons and new lines all separate, blanks are dropped. */
export function splitSelectTokens(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n\r]+/)) {
    const token = raw.trim();
    const key = token.toLowerCase();
    if (!token || seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

/** The option a typed or pasted word means, ignoring capital letters and stray spaces. */
export function matchChoice(token: string, choices: SelectChoice[]): SelectChoice | undefined {
  const key = token.trim().toLowerCase();
  if (!key) return undefined;
  return choices.find((c) => c.title.trim().toLowerCase() === key);
}

/**
 * Pasted text for a select cell. A word that matches an existing option takes that option's own spelling, so
 * "marketing" lands on "Marketing" instead of becoming a second, unlisted option. A word that matches nothing
 * is kept as typed, never dropped and never glued to its neighbours.
 */
export function normalizeSelectPaste(text: string, choices: SelectChoice[], multiple: boolean): string | string[] | null {
  const tokens = splitSelectTokens(multiple ? text : text.replace(/[\r\n]+/g, ' ').trim());
  if (tokens.length === 0) return null;
  if (!multiple) {
    const whole = text.trim();
    return matchChoice(whole, choices)?.title ?? whole;
  }
  return tokens.map((t) => matchChoice(t, choices)?.title ?? t);
}

/** The first colour that no option uses yet, so new options look different from each other; then it starts over. */
export function nextUnusedColor(choices: SelectChoice[], palette: string[]): string {
  if (palette.length === 0) return 'grayLight2';
  const used = new Set(choices.map((c) => c.color));
  return palette.find((c) => !used.has(c)) ?? palette[choices.length % palette.length];
}
