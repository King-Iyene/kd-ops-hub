// Ops Agent dispatcher, pure parts: how an Inbox item or a summary reads when it arrives in another tool.
// No Deno APIs here, so it can be unit tested.

import type { Outgoing } from './agent-deliver-core.ts';
import { MORE, headline, shortLines, withFooter } from './crew-cliq-look.ts';

export interface FlagRow { id: string; rule_code: string; severity: string; title: string; why: string; suggested_action: string | null; item_type: string }

/** Only team items (tasks, time tracking, daily reports) are ever sent on their own. Everything else stays in the Inbox. */
export const isTeamRule = (code: string | null | undefined): boolean => /^(TK|TR|RP|FL|EX)[0-9]+$/.test(code ?? '');

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

export interface FollowupRow { stage: number }

/**
 * The follow-up after a message that changed nothing. Stage 1 goes back to the person (their manager copied, as for any message).
 * Stage 2, a day later, goes to their manager and asks them to step in; with no manager it stays with the person and says so.
 */
export function formatFollowup(f: FlagRow, personName: string | null, stage: number, managerName: string | null): Outgoing {
  const why = f.why.trim();
  const first = firstName(personName);
  const toManager = stage >= 2 && !!managerName && !!personName;
  const observation = toManager
    ? `${personName}'s item has been open for 2 days with no change, even after we followed up. ${why}`
    : stage >= 2 ? `This has now been open for 2 days with no change, and no manager is set for you, so a Super Admin needs to step in. ${why}`
    : `This is still open 24 hours after we first asked. ${why}`;
  const question = toManager ? 'Could you step in, find out what is happening and let us know when it will be sorted?' : 'Can you tell us where this stands and when it will be sorted?';
  return {
    title: `[${stage >= 2 ? 'ESCALATION' : 'FOLLOW-UP'}] ${f.title}`.slice(0, 200),
    text: [observation, question].join('\n'),
    event: 'flag',
    meta: { severity: f.severity, rule: f.rule_code, person: personName ?? '' },
    ask: personName ? { observation, question, followUp: toManager || stage >= 2 || !first ? '' : `please follow up with ${first} and get clarity on what is happening.` } : undefined,
  };
}

export interface SummaryRow { period_kind: string; period_start: string; period_end: string; narrative: string | null }

/** Markdown headings and bold become plain text: every tool shows plain text the same way. */
export function plainText(md: string): string {
  return md.replace(/^#{1,6}\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatSummary(s: SummaryRow): Outgoing {
  const name = s.period_kind === 'scorecard' ? 'Weekly scorecard'
    : `${s.period_kind === 'day' ? 'Daily' : s.period_kind === 'week' ? 'Weekly' : 'Monthly'} summary`;
  const when = s.period_start === s.period_end ? s.period_start : `${s.period_start} to ${s.period_end}`;
  return { title: `${name}, ${when}`, text: plainText(s.narrative ?? 'No details.'), event: 'summary', meta: { severity: 'info', rule: '', person: '' }};
}

export interface CrewMessageRow { kind: string; body: string }

/**
 * A message one of the AI executives wrote to the owner, as it reads in Cliq (the design is in crew-cliq-look.ts): a bold one-line headline with an emoji
 * for the kind, the agent's first name and role, the first few short lines of what they said, a pointer to the app when it was shortened, and a quiet footer.
 * The owner is tagged by the caller. Nothing is added that the agent did not say.
 */
export function formatCrewMessage(m: CrewMessageRow, agentName: string, agentTitle: string): Outgoing {
  const { lines, more } = shortLines(m.body, { lines: 4, lineMax: 220 });
  return {
    title: headline(m.kind, agentName, agentTitle),
    text: withFooter(more ? [...lines, MORE] : lines),
    event: 'crew',
    meta: { severity: m.kind === 'challenge' || m.kind === 'alert' ? 'high' : 'info', rule: 'CREW', person: agentName },
  };
}

/** At most this many tries; a message that keeps failing stops being tried and shows as failed. */
export const MAX_ATTEMPTS = 4;
