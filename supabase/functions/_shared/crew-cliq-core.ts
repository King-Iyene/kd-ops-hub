// Crew in Zoho Cliq: the pure parts (no Deno APIs, so they can be unit tested).
//
// The owner approves, rejects and answers the AI executives from a Cliq channel. This file only decides three things:
//   1. what a message from the owner MEANS (parseCommand): a small, strict set of commands; anything else is ignored, never guessed at;
//   2. whose message counts at all (fromOwner, ignoreAsOurOwn): only the owner's own Cliq account, and never what we posted ourselves;
//   3. how things read in Cliq (formatProposal and the reply helpers): short, plain English.
// The decision itself is made in the database (crew_cliq_decide, crew_cliq_say), which re-checks everything. Nothing here pays anybody.

import { validDc, type CliqDc } from './agent-cliq-core.ts';
import { OWN_MARK } from './agent-cliq-monitor-core.ts';

// ── commands ───────────────────────────────────────────────────────────────
export type Command =
  | { kind: 'approve'; code: string; confirm: boolean }
  | { kind: 'reject'; code: string; reason: string }
  | { kind: 'say'; agent: string; message: string }
  | { kind: 'status' }
  | { kind: 'help' }
  | { kind: 'unknown' };

const CODE = /^[0-9a-f]{6,8}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{1,30}$/;
/** Words that mean a command, so "approve: x" or "status: x" is never read as a message to someone called approve or status. */
const RESERVED = new Set(['approve', 'reject', 'status', 'help']);
const MAX_MESSAGE = 4000;
const MAX_REASON = 500;

/** Invisible characters (our own mark, zero-width spaces, a byte-order mark) are dropped; the rest of the text is kept as typed. */
// eslint-disable-next-line no-misleading-character-class
const INVISIBLE = new RegExp(`[${OWN_MARK}​‌‍⁠﻿]`, 'g');

export function cleanText(text: string): string {
  return text.replace(INVISIBLE, '').replace(/\r\n?/g, '\n').trim();
}

/**
 * What the owner wrote, as a command. Case does not matter. The forms:
 *   approve a1b2c3            approve a1b2c3 confirm (needed for high-risk ones)
 *   reject a1b2c3 [reason]
 *   hale: message             @hale message            (writes to that executive)
 *   status                    help
 * Anything else is `unknown`: the caller stays silent, because the owner may just be talking to someone else in the channel.
 */
export function parseCommand(raw: unknown): Command {
  if (typeof raw !== 'string') return { kind: 'unknown' };
  const text = cleanText(raw).slice(0, MAX_MESSAGE + 200);
  if (!text) return { kind: 'unknown' };

  const word = text.replace(/[.!?]+$/, '').trim().toLowerCase();
  if (word === 'status') return { kind: 'status' };
  if (word === 'help') return { kind: 'help' };

  const first = text.match(/^(approve|reject)\s+([0-9A-Fa-f]{6,8})(?:\s+([\s\S]*))?$/i);
  if (first) {
    const verb = first[1].toLowerCase();
    const code = first[2].toLowerCase();
    const rest = (first[3] ?? '').trim();
    if (!CODE.test(code)) return { kind: 'unknown' };
    if (verb === 'approve') {
      if (rest === '') return { kind: 'approve', code, confirm: false };
      if (rest.toLowerCase() === 'confirm') return { kind: 'approve', code, confirm: true };
      return { kind: 'unknown' };   // "approve a1b2c3 maybe": never guess
    }
    return { kind: 'reject', code, reason: rest.slice(0, MAX_REASON) };
  }

  // "Hale: check the tax date" or "@Hale check the tax date"
  const colon = text.match(/^([A-Za-z][A-Za-z0-9_]{1,30})\s*:\s*([\s\S]+)$/);
  const at = text.match(/^@([A-Za-z][A-Za-z0-9_]{1,30})[\s,:]+([\s\S]+)$/);
  const m = at ?? colon;
  if (m && NAME.test(m[1]) && !RESERVED.has(m[1].toLowerCase())) {
    const message = m[2].trim();
    if (message && message.length <= MAX_MESSAGE) return { kind: 'say', agent: m[1].toLowerCase(), message };
  }
  return { kind: 'unknown' };
}

// ── the owner's Cliq account, when typed as an email ───────────────────────
/** Zoho does not always put the sender's email in a message. One look-up turns the typed email into the Cliq user id (fixed Zoho hosts only). */
export function userUrl(dc: CliqDc, idOrEmail: string): string | null {
  if (!validDc(dc) || !/^[A-Za-z0-9._@+-]{2,120}$/.test(idOrEmail)) return null;
  return `https://cliq.zoho.${dc}/api/v2/users/${encodeURIComponent(idOrEmail)}`;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/** The user id out of what Zoho returned for a user (read defensively: the shape is checked, never trusted). */
export function parseUserId(json: unknown): string | null {
  const j = obj(json);
  const id = str(j.id) || str(obj(j.data).id) || str(obj(j.user).id) || str(j.zuid);
  return /^[A-Za-z0-9._:-]{2,120}$/.test(id) ? id : null;
}

// ── who is on the team ─────────────────────────────────────────────────────
export interface AgentRef { slug: string; name: string }

/** The executive a name points to: an exact slug, else a first name. `none` means the owner was probably not talking to the team at all. */
export function resolveAgent(token: string, agents: AgentRef[]): { ok: true; slug: string } | { ok: false; why: 'none' | 'many' } {
  const t = token.trim().toLowerCase();
  if (!t) return { ok: false, why: 'none' };
  const bySlug = agents.find((a) => a.slug.toLowerCase() === t);
  if (bySlug) return { ok: true, slug: bySlug.slug };
  const byFirst = agents.filter((a) => a.name.trim().split(/\s+/)[0]?.toLowerCase() === t);
  if (byFirst.length === 1) return { ok: true, slug: byFirst[0].slug };
  return { ok: false, why: byFirst.length > 1 ? 'many' : 'none' };
}

// ── whose message counts ───────────────────────────────────────────────────
export interface SenderLike { senderId: string; senderEmail?: string | null }

const norm = (v: string | null | undefined) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/**
 * True only when the sender is the owner's own Cliq account: the typed user id or email equals the sender's id or email.
 * A display name never counts (anybody can pick any name). Empty values never match.
 */
export function fromOwner(m: SenderLike, ownerId: string | null | undefined, resolvedOwnerId?: string | null): boolean {
  const owner = norm(ownerId);
  if (!owner) return false;
  const id = norm(m.senderId);
  const email = norm(m.senderEmail);
  if (id && id === owner) return true;
  if (email && email === owner) return true;
  const resolved = norm(resolvedOwnerId);
  return !!resolved && !!id && id === resolved;
}

/** What we posted ourselves carries our invisible mark. When the connected Zoho account IS the owner's, those posts have the owner's id, so this check matters. */
export const ignoreAsOurOwn = (text: string): boolean => text.includes(OWN_MARK);

export interface IncomingMessage extends SenderLike { id: string; time: number; text: string }
export interface PlannedMessage { message: IncomingMessage; command: Command }

/**
 * From what was read in the channel: the owner's messages that are newer than the mark, oldest first, each with its command.
 * Everybody else's messages, our own posts and anything older than the mark are left out completely.
 */
export function planCommands(messages: IncomingMessage[], opts: { ownerId: string | null | undefined; cursorMs: number; resolvedOwnerId?: string | null }): PlannedMessage[] {
  return messages
    .filter((m) => m.time > opts.cursorMs && !ignoreAsOurOwn(m.text) && fromOwner(m, opts.ownerId, opts.resolvedOwnerId))
    .sort((a, b) => a.time - b.time)
    .map((m) => ({ message: m, command: parseCommand(m.text) }));
}

// ── how a proposal reads in Cliq ───────────────────────────────────────────
export interface ProposalLine { code: string; agent_name: string; agent_title: string; action: string; summary: string; risk: string }

const ACTION_LABEL: Record<string, string> = {
  'record.create': 'add a record',
  'record.update': 'change a record',
  'record.soft_delete': 'delete a record (it goes to the trash)',
  'draft.batch_payment': 'prepare a payment (nothing is paid)',
  'draft.payroll_run': 'prepare a payroll run (nothing is paid)',
  'draft.invoice': 'prepare an invoice',
  'draft.filing': 'prepare a filing',
  'advice.knowledge': 'save a note in the company brain',
  'agent.hire': 'hire a team member',
  'agent.retire': 'let a team member go',
  'drive.create': 'create a file in Google Drive',
  'drive.update': 'change a file in Google Drive',
  'drive.trash': 'move a Google Drive file to the trash',
  'external.github': 'make a change in GitHub',
  'external.vercel': 'make a change in Vercel',
  'external.supabase': 'make a change in Supabase',
  'external.other': 'do something outside the app',
};

export function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  const a = action.match(/^advice\.([a-z_]+)$/);
  return a ? `give advice (${a[1].replace(/_/g, ' ')})` : 'do something';
}

/** The same rule as the database: high risk, or anything about hiring or letting someone go, needs the word confirm. */
export const needsConfirm = (p: { risk: string; action: string }): boolean => p.risk === 'high' || p.action.startsWith('agent.');
/** A payment or a payroll run is never approved from Cliq: the app is where a person carries those out. */
export const approvedInAppOnly = (action: string): boolean => action === 'draft.batch_payment' || action === 'draft.payroll_run';

/** Text written by an agent or by Zoho is shown as plain words: no tags, no invisible characters, no long runs of blank lines. */
export function plain(text: unknown, max: number): string {
  const s = typeof text === 'string' ? text : '';
  return cleanText(s).replace(/\{@[^}]*\}/g, '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').slice(0, max).trim();
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** A new proposal waiting for the owner: who, what, why it matters, and the exact lines to reply with. */
export function formatProposal(p: ProposalLine): { title: string; text: string } {
  const who = firstName(plain(p.agent_name, 80));
  const title = plain(`${who}${p.agent_title ? ` (${plain(p.agent_title, 80)})` : ''} needs your decision`, 200);
  const code = p.code.toLowerCase();
  const lines = [`Wants to: ${actionLabel(p.action)}`, plain(p.summary, 400), `Risk: ${p.risk}`, ''];
  if (approvedInAppOnly(p.action)) {
    lines.push('Payments are approved in the app, never from Cliq. To say no, reply:', `reject ${code} your reason`);
  } else {
    lines.push('Reply with one of these:', `approve ${code}${needsConfirm(p) ? ' confirm' : ''}`, `reject ${code} your reason`);
    if (needsConfirm(p)) lines.push('(The word confirm is needed because this one is high-risk or about the team.)');
  }
  return { title, text: lines.join('\n') };
}

// ── replies ────────────────────────────────────────────────────────────────
export function formatHelp(): { title: string; text: string } {
  return {
    title: 'Crew commands',
    text: [
      'approve a1b2c3          say yes to a proposal',
      'approve a1b2c3 confirm  needed for high-risk ones',
      'reject a1b2c3 reason    say no (the reason is optional)',
      'hale: your message      write to an executive (first name or slug; @hale works too)',
      'status                  list what is waiting for you',
      'Only your own Cliq account is obeyed. Payments are approved in the app.',
    ].join('\n'),
  };
}

export function formatStatus(rows: ProposalLine[]): { title: string; text: string } {
  if (rows.length === 0) return { title: 'Crew status', text: 'Nothing is waiting for you.' };
  const lines = rows.map((r) => `${r.code.toLowerCase()}  ${firstName(plain(r.agent_name, 80))}: ${plain(r.summary, 120)} (${r.risk})`);
  return { title: `Crew status: ${rows.length} waiting`, text: [...lines, '', 'Reply approve <code> or reject <code> reason.'].join('\n') };
}

export interface DecisionResult { status?: string; error?: string | null; agent?: string; summary?: string }

/** What happened after approve or reject. `status` is what crew_decide returned: rejected, executed, approved or failed. */
export function formatDecision(verb: 'approve' | 'reject', r: DecisionResult): { title: string; text: string } {
  const who = r.agent ? firstName(plain(r.agent, 80)) : 'The executive';
  const what = r.summary ? `\n${plain(r.summary, 200)}` : '';
  if (verb === 'reject' || r.status === 'rejected') return { title: 'Rejected', text: `Rejected. ${who} has been told and will not repeat it without asking.${what}` };
  if (r.status === 'failed') return { title: 'Approved, but it did not run', text: `Approved, but it could not be carried out: ${plain(r.error, 200) || 'no reason given'}.${what}` };
  if (r.status === 'executed') return { title: 'Approved and done', text: `Approved and done.${what}` };
  return { title: 'Approved', text: `Approved. It now waits for you to carry it out in the app.${what}` };
}

export function formatSaid(agentName: string): { title: string; text: string } {
  const who = firstName(plain(agentName, 80));
  return { title: `Sent to ${who}`, text: `Sent to ${who}. They read it when they next run and will answer you here or in the app.` };
}

/** The database explains in a plain sentence (for example "that one is already approved"). Only that sentence goes to Cliq. */
export function formatError(message: unknown): { title: string; text: string } {
  const s = plain(message, 300).replace(/^[A-Z_0-9]+:\s*/, '');
  return { title: 'Could not do that', text: s || 'Something went wrong. Try again, or use the app.' };
}

export function formatWelcome(waiting: number): { title: string; text: string } {
  const n = waiting === 0 ? 'Nothing is waiting for you right now.' : `${waiting} proposal${waiting === 1 ? ' is' : 's are'} already waiting: reply status to list them.`;
  return { title: 'Crew commands are on', text: `You can now approve, reject and reply from this channel. Only your own Cliq account is obeyed. Reply help to see the commands.\n${n}` };
}
