// How Crew messages look in Zoho Cliq: one design for every message (a proposal waiting for the owner, an executive's alert, a reply to a command). Pure, no Deno APIs.
//
//   *bold headline*  with a leading emoji for the kind, then the agent's first name and role
//   2 to 4 short lines of substance
//   (for an approval: the exact lines to reply with, each on its own line)
//   _a quiet footer_
//
// Only the two marks Cliq documents for message text are used: *bold* (the headline; the sender adds the asterisks around the title) and _italic_ (the footer).
// No headings, quotes or code fences, because messages posted through the API do not always render those. The invisible OWN_MARK is added by the sender.

import { OWN_MARK } from './agent-cliq-monitor-core.ts';

/** The look of each kind of message: a leading emoji and the words of the headline. */
export const KIND_LOOK: Record<string, { emoji: string; label: string }> = {
  approval: { emoji: '✋', label: 'Approval needed' },
  question: { emoji: '❓', label: 'Question' },
  alert: { emoji: '🚨', label: 'Alert' },
  challenge: { emoji: '⚠️', label: 'Challenge to your order' },
  reminder: { emoji: '⏰', label: 'Reminder' },
  brief: { emoji: '📰', label: 'Briefing' },
  report: { emoji: '📊', label: 'Report' },
  message: { emoji: '💬', label: 'Message' },
  reply: { emoji: '💬', label: 'Reply' },
};
export const lookOf = (kind: string) => KIND_LOOK[kind] ?? KIND_LOOK.message;

/** Risk shown as a colour you can read at a glance. */
export const RISK_EMOJI: Record<string, string> = { low: '🟢', medium: '🟡', high: '🔴' };

/** The quiet footer, in italics. */
export const FOOTER = '_Crew · KD Ops_';

// Invisible characters (our own mark, zero-width spaces, a byte-order mark) are dropped.
const INVISIBLE = new RegExp(`[${OWN_MARK}${String.fromCharCode(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)}]`, 'g');

/**
 * Words written by an agent or by Zoho, as plain text: no tags that could notify someone, no invisible characters, no markdown headings or **bold**
 * (a lone * or _ in the words would break the formatting, so they are turned into plain look-alikes).
 */
export function clean(text: unknown, max = 4000): string {
  const s = typeof text === 'string' ? text : '';
  return s.replace(INVISIBLE, '').replace(/\r\n?/g, '\n').replace(/\{@[^}]*\}/g, '')
    .replace(/^#{1,6}\s*/gm, '').replace(/\*\*(.+?)\*\*/gs, '$1').replace(/[*~`]/g, (c) => ({ '*': '∗', '~': '∼', '`': "'" }[c] as string))
    .replace(/(^|[\s(])_+|_+(?=[\s).,!?:;]|$)/gm, '$1')   // an _ at the edge of a word would start italics; one inside a word (crew_settings) is harmless
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, max).trim();
}

export const firstName = (name: string): string => clean(name, 80).split(/\s+/)[0] || clean(name, 80);

/** "✋ Approval needed: Hale, Chief Financial Officer": the one-line headline (the sender puts the bold marks around it). */
export function headline(kind: string, agentName: string, agentTitle: string): string {
  const { emoji, label } = lookOf(kind);
  const who = [firstName(agentName), clean(agentTitle, 80)].filter(Boolean).join(', ');
  return `${emoji} ${label}${who ? `: ${who}` : ''}`.slice(0, 200);
}

/** The first few short lines of a longer text, with a pointer to the app when something was left out. */
export function shortLines(body: unknown, opts: { lines?: number; lineMax?: number } = {}): { lines: string[]; more: boolean } {
  const maxLines = opts.lines ?? 4;
  const lineMax = opts.lineMax ?? 200;
  const all = clean(body).split('\n').map((l) => l.trim()).filter(Boolean);
  const lines = all.slice(0, maxLines).map((l) => (l.length > lineMax ? `${l.slice(0, lineMax - 1).trimEnd()}…` : l));
  const more = all.length > maxLines || all.slice(0, maxLines).some((l) => l.length > lineMax);
  return { lines, more };
}

/** Message lines, a blank line, then the footer. */
export const withFooter = (lines: string[]): string => [...lines, '', FOOTER].join('\n');

/** The pointer shown when a message was shortened. */
export const MORE = '…the rest is in KD Ops > Crew.';
