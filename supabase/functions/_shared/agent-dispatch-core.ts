// Ops Agent dispatcher, pure parts: how an Inbox item or a summary reads when it arrives in another tool.
// No Deno APIs here, so it can be unit tested.

import type { Outgoing } from './agent-deliver-core.ts';

export interface FlagRow { id: string; rule_code: string; severity: string; title: string; why: string; suggested_action: string | null; item_type: string }

const LABEL: Record<string, string> = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW', info: 'INFO' };

export function formatFlag(f: FlagRow, personName: string | null): Outgoing {
  const lines = [f.why.trim()];
  if (personName) lines.push(`Person: ${personName}`);
  if (f.suggested_action) lines.push(`Suggested: ${f.suggested_action.trim()}`);
  lines.push('Open the Ops Agent Inbox in KD Ops for the full detail and a drafted message.');
  return {
    title: `[${LABEL[f.severity] ?? f.severity.toUpperCase()}] ${f.title}`.slice(0, 200),
    text: lines.filter(Boolean).join('\n'),
    event: 'flag',
    meta: { severity: f.severity, rule: f.rule_code, person: personName ?? '' },
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
  return { title: `${kind} summary, ${when}`, text: plainText(s.narrative ?? 'No details.'), event: 'summary', meta: { severity: 'info', rule: '', person: '' } };
}

/** At most this many tries; a message that keeps failing stops being tried and shows as failed. */
export const MAX_ATTEMPTS = 4;
