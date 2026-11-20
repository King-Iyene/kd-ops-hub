// Ops Agent dispatcher, pure parts: how an Inbox item or a summary reads when it arrives in another tool.
// No Deno APIs here, so it can be unit tested.

import type { Outgoing } from './agent-deliver-core.ts';

export interface FlagRow { id: string; rule_code: string; severity: string; title: string; why: string; suggested_action: string | null; item_type: string }

const LABEL: Record<string, string> = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW', info: 'INFO' };

const firstName = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0] ?? '';

/**
 * An Inbox item as a message in another tool. It is written to the person it is about: what was noticed, and a question asking what
 * is going on. In Cliq and Slack their manager is tagged at the bottom, asked to follow up and get clarity (see `ask` in
 * agent-deliver-core.ts). An item waiting for a manager's review is addressed to the manager. There is no suggestion and no link
 * into the Agent: the people who read the channel cannot open it.
 */
export function formatFlag(f: FlagRow, personName: string | null, opts: { toManager?: boolean } = {}): Outgoing {
  const observation = f.why.trim();
  const first = firstName(personName);
  const question = opts.toManager ? 'Could you take a look and let us know what is happening?' : 'Can you tell us what is going on with this?';
  return {
    title: `[${LABEL[f.severity] ?? f.severity.toUpperCase()}] ${f.title}`.slice(0, 200),
    // what a tool that cannot tag sees (webhook, email, Teams ...)
    text: [observation, personName ? question : ''].filter(Boolean).join('\n'),
    event: 'flag',
    meta: { severity: f.severity, rule: f.rule_code, person: personName ?? '' },
    ask: personName
      ? { observation, question, followUp: opts.toManager || !first ? '' : `please follow up with ${first} and get clarity on what is happening.` }
      : undefined,
  };
}

export interface SummaryRow { period_kind: string; period_start: string; period_end: string; narrative: string | null }

/** Markdown headings and bold become plain text: every tool shows plain text the same way. */
export function plainText(md: string): string {
  return md.replace(/^#{1,6}\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatSummary(s: SummaryRow): Outgoing {
  const kind = s.period_kind === 'day' ? 'Daily' : s.period_kind === 'week' ? 'Weekly' : 'Monthly';
  const when = s.period_start === s.period_end ? s.period_start : `${s.period_start} to ${s.period_end}`;
  return { title: `${kind} summary, ${when}`, text: plainText(s.narrative ?? 'No details.'), event: 'summary', meta: { severity: 'info', rule: '', person: '' }};
}

/** At most this many tries; a message that keeps failing stops being tried and shows as failed. */
export const MAX_ATTEMPTS = 4;
