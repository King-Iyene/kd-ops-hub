// Pure helpers for "Send new entries to other tools" (the Connections dialog on a Table page).
import type { AgentConnection } from '@/features/ops-agent/agentDb';
import { relativeTime } from '@/features/ops-agent/time';
import type { RecordDelivery, TableConnection } from '@/queries/useTableConnections';

/** The message may be long, but not unbounded. */
export const TEMPLATE_MAX = 2000;
export const NAME_MAX = 80;

/** Placeholders every table has, next to its own field names. */
export const BUILT_IN_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: 'table', label: 'Table' },
  { key: 'link', label: 'Link' },
  { key: 'submitted_at', label: 'Submitted at' },
];

export const CHANNEL_HINT = 'Use lowercase letters, digits and underscores only, for example daily_reports.';

/** Cliq's channel unique name: lowercase letters, digits and underscores. Empty means "use the connection's channel". */
export function channelProblem(text: string): string | null {
  const t = text.trim();
  if (t === '') return null;
  return /^[a-z0-9_]+$/.test(t) ? null : CHANNEL_HINT;
}

/** The channel override only applies to a Zoho Cliq connection that posts through the API. */
export const isCliqApi = (c: Pick<AgentConnection, 'kind' | 'config'> | undefined | null): boolean => !!c && c.kind === 'cliq' && c.config.mode === 'api';

/** `{{Field name}}` */
export const placeholder = (name: string): string => `{{${name}}}`;

/** Puts `token` where the cursor is (replacing any selected text) and says where the cursor goes next. */
export function insertAtCursor(text: string, start: number | null | undefined, end: number | null | undefined, token: string): { text: string; caret: number } {
  const s = Math.min(Math.max(start ?? text.length, 0), text.length);
  const e = Math.min(Math.max(end ?? s, s), text.length);
  return { text: text.slice(0, s) + token + text.slice(e), caret: s + token.length };
}

export const defaultRuleName = (toolName: string): string => `Send to ${toolName}`;

/** Turns a delivery error into something a person can act on. */
export function plainError(raw: string | null | undefined): string {
  const e = (raw ?? '').trim();
  if (!e) return 'The tool did not accept the message.';
  if (/401|403|unauthori[sz]ed|forbidden|invalid_token|expired|oauth|sign.?in/i.test(e)) return 'The tool refused the sign-in. Reconnect it in Agent, Connections.';
  if (/404|not.?found|channel/i.test(e)) return 'The tool could not find the place to post. Check the channel name.';
  if (/429|rate/i.test(e)) return 'The tool is busy. It will be tried again.';
  if (/timeout|timed out|network|fetch failed|\b5\d\d\b/i.test(e)) return 'The tool could not be reached. It will be tried again.';
  return e.length > 140 ? `${e.slice(0, 137)}...` : e;
}

export interface DeliveryNote { tone: 'ok' | 'error' | 'pending' | 'none'; text: string }

/** One line for a rule: "Last sent 5m ago", or why the latest try failed. `deliveries` is newest first. */
export function describeDelivery(rule: Pick<TableConnection, 'last_sent_at'>, deliveries: RecordDelivery[] | undefined, now: number = Date.now()): DeliveryNote {
  const list = deliveries ?? [];
  const latest = list[0];
  const lastSentIso = rule.last_sent_at ?? list.find((d) => d.status === 'sent')?.sent_at ?? null;
  if (latest?.status === 'failed') return { tone: 'error', text: `Last try failed: ${plainError(latest.error)}` };
  if (latest?.status === 'pending') return { tone: 'pending', text: lastSentIso ? `Sending now. Last sent ${relativeTime(lastSentIso, now)}.` : 'Sending now.' };
  if (lastSentIso) return { tone: 'ok', text: `Last sent ${relativeTime(lastSentIso, now)}` };
  return { tone: 'none', text: 'Nothing sent yet' };
}
