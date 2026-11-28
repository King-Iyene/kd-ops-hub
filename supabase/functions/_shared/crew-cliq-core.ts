// Crew in Zoho Cliq: the pure parts (no Deno APIs, so they can be unit tested).
//
// The owner approves, rejects and answers the AI executives from a Cliq channel. This file only decides three things:
//   1. what a message from the owner MEANS (parseCommand): a small, strict set of commands; anything else is ignored, never guessed at;
//   2. whose message counts at all (fromOwner, ignoreAsOurOwn): only the owner's own Cliq account, and never what we posted ourselves;
//   3. how things read in Cliq (formatProposal and the reply helpers): short, plain English.
// The decision itself is made in the database (crew_cliq_decide, crew_cliq_say), which re-checks everything. Nothing here pays anybody.

import { validDc, type CliqDc } from './agent-cliq-core.ts';
import { OWN_MARK } from './agent-cliq-monitor-core.ts';
import { RISK_EMOJI, clean, firstName, headline, withFooter } from './crew-cliq-look.ts';

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

/** Text written by an agent or by Zoho is shown as plain words (see crew-cliq-look.ts): no tags, no invisible characters, no stray formatting marks. */
export function plain(text: unknown, max: number): string {
  return clean(text, max);
}

export type CliqMsg = { title: string; text: string };

/** A new proposal waiting for the owner: headline, what it wants, why it matters, the exact lines to reply with, and a quiet footer. */
export function formatProposal(p: ProposalLine): CliqMsg {
  const code = p.code.toLowerCase();
  const risk = `Risk: ${RISK_EMOJI[p.risk] ? `${RISK_EMOJI[p.risk]} ` : ''}${clean(p.risk, 12)}`;
  const lines = [`Wants to: ${actionLabel(p.action)}`, clean(p.summary, 300), risk, ''];
  if (approvedInAppOnly(p.action)) {
    lines.push('Payments are approved in the app, never from Cliq.', 'To say no, reply:', `reject ${code} your reason`);
  } else {
    lines.push('Reply with:', `approve ${code}${needsConfirm(p) ? ' confirm' : ''}`, `reject ${code} your reason`);
    if (needsConfirm(p)) lines.push('(confirm is needed: this one is high-risk or about the team)');
  }
  return { title: headline('approval', p.agent_name, p.agent_title), text: withFooter(lines) };
}

// ── replies ────────────────────────────────────────────────────────────────
export function formatHelp(): CliqMsg {
  return {
    title: 'ℹ️ Crew commands',
    text: withFooter([
      'approve a1b2c3 · say yes to a proposal',
      'approve a1b2c3 confirm · needed for high-risk ones',
      'reject a1b2c3 reason · say no (the reason is optional)',
      'hale: your message · write to an executive (first name or slug; @hale works too)',
      'status · list what is waiting for you',
      '',
      'Only your own Cliq account is obeyed. Payments are approved in the app.',
    ]),
  };
}

export function formatStatus(rows: ProposalLine[]): CliqMsg {
  if (rows.length === 0) return { title: '📋 Nothing is waiting for you', text: withFooter(['All clear.']) };
  const lines = rows.map((r) => `${r.code.toLowerCase()} · ${firstName(r.agent_name)}: ${clean(r.summary, 110)} ${RISK_EMOJI[r.risk] ?? ''}`.trim());
  return { title: `📋 ${rows.length} waiting for you`, text: withFooter([...lines, '', 'Reply approve <code> or reject <code> reason.']) };
}

export interface DecisionResult { status?: string; error?: string | null; agent?: string; summary?: string }

/** What happened after approve or reject. `status` is what crew_decide returned: rejected, executed, approved or failed. */
export function formatDecision(verb: 'approve' | 'reject', r: DecisionResult): CliqMsg {
  const who = r.agent ? firstName(r.agent) : 'The executive';
  const what = r.summary ? [clean(r.summary, 200)] : [];
  if (verb === 'reject' || r.status === 'rejected') return { title: '❌ Rejected', text: withFooter([`${who} has been told and will not repeat it without asking.`, ...what]) };
  if (r.status === 'failed') return { title: '⚠️ Approved, but it did not run', text: withFooter([`It could not be carried out: ${clean(r.error, 200) || 'no reason given'}.`, ...what]) };
  if (r.status === 'executed') return { title: '✅ Approved and done', text: withFooter(what.length ? what : ['Done.']) };
  return { title: '✅ Approved', text: withFooter(['It now waits for you to carry it out in the app.', ...what]) };
}

export function formatSaid(agentName: string): CliqMsg {
  const who = firstName(agentName);
  return { title: `📨 Sent to ${who}`, text: withFooter([`${who} reads it when they next run and will answer you here or in the app.`]) };
}

/** The database explains in a plain sentence (for example "that one is already approved"). Only that sentence goes to Cliq. */
export function formatError(message: unknown): CliqMsg {
  const s = clean(message, 300).replace(/^[A-Z_0-9]+:\s*/, '');
  return { title: '⚠️ Could not do that', text: withFooter([s || 'Something went wrong. Try again, or use the app.']) };
}

export function formatWelcome(waiting: number): CliqMsg {
  const n = waiting === 0 ? 'Nothing is waiting for you right now.' : `${waiting} proposal${waiting === 1 ? ' is' : 's are'} already waiting: reply status to list them.`;
  return { title: '👋 Crew commands are on', text: withFooter(['You can now approve, reject and reply from here.', 'Only your own Cliq account is obeyed.', n, 'Reply help to see the commands.']) };
}

// ── a direct message instead of a channel ──────────────────────────────────
// With "Me, as a direct message" the owner's Cliq id (or email) is who gets the alerts, and the commands are read from his direct chat with the
// connected Zoho account. In a direct chat with oneself EVERYTHING arrives from the owner's own account, our posts included, so the invisible
// OWN_MARK rule (ignoreAsOurOwn, used by planCommands) is what stops the bot obeying its own proposals. Only fixed Zoho hosts are called.

/** The list of direct chats the connected Zoho account has (Zoho: GET /api/v2/chats, permission ZohoCliq.Chats.READ; about 5 calls a minute are allowed). */
export function dmChatsUrl(dc: CliqDc, nextToken?: string | null): string | null {
  if (!validDc(dc)) return null;
  const q = new URLSearchParams({ limit: '100' });
  if (nextToken && /^[A-Za-z0-9_.:=+/-]{1,1000}$/.test(nextToken)) q.set('next_token', nextToken);
  return `https://cliq.zoho.${dc}/api/v2/chats?${q.toString()}`;
}

export interface DmChat { chatId: string; userIds: string[]; participants: number | null; modified: number }

/** The direct chats out of what Zoho returned (read defensively; groups, channels and removed chats are left out). */
export function parseDmChats(json: unknown): { chats: DmChat[]; next: string | null } {
  const j = obj(json);
  const list = Array.isArray(j.chats) ? j.chats : Array.isArray(j.data) ? j.data : [];
  const chats: DmChat[] = [];
  for (const raw of list) {
    const c = obj(raw);
    const chatId = str(c.chat_id) || str(c.id);
    if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(chatId)) continue;
    if (str(c.chat_type).toLowerCase() !== 'dm' || c.removed === true) continue;
    const userIds = (Array.isArray(c.recipients_summary) ? c.recipients_summary : []).map((r) => str(obj(r).user_id) || str(obj(r).id)).filter(Boolean);
    const count = Number(c.participant_count);
    const t = Date.parse(str(c.last_modified_time)) || Number(obj(c.last_message_info).time) || 0;
    chats.push({ chatId, userIds, participants: Number.isFinite(count) ? count : null, modified: t < 1e11 && t > 0 ? t * 1000 : t });
  }
  const next = str(j.next_token) || str(obj(j.pagination).next_token);
  return { chats, next: next || null };
}

/** The direct chat that has the owner in it (and nobody else): the newest one if Zoho shows more than one. Null when there is none yet. */
export function pickDmChat(chats: DmChat[], ownerUserId: string | null | undefined): string | null {
  const owner = norm(ownerUserId);
  if (!owner) return null;
  const mine = chats.filter((c) => c.userIds.some((u) => norm(u) === owner) && (c.participants === null || c.participants <= 2));
  mine.sort((a, b) => b.modified - a.modified);
  return mine[0]?.chatId ?? null;
}

/** What to tell the owner when a direct message could not be sent. 401 and 403 are Zoho's way of saying the sign-in lacks a permission. */
export function dmFailureText(status: number | undefined, connectionName: string): string {
  if (status === 401 || status === 403) {
    return `Zoho needs one more permission for direct messages: open Agent > Connections > ${plain(connectionName, 80) || 'your Cliq connection'} and press Reconnect to Zoho.`;
  }
  if (status === 400 || status === 404) return 'Zoho could not find that person to send a direct message to. Check the Cliq user id or email, and that they are in the same Zoho organisation as the connected account.';
  if (status === 429) return 'Zoho asked us to slow down. It will try again in a moment.';
  return 'The direct message could not be sent. It will be tried again.';
}

/** The only thing ever posted in a shared channel when direct messages fail: no proposal, no name, no amount. */
export function formatChannelNotice(): { title: string; text: string } {
  return { title: '⚠️ Crew could not send you a direct message', text: withFooter(['Crew has something for you but could not send it as a direct message.', 'Open KD Ops > Crew > Cliq alerts to see why.', 'Nothing private is posted in this channel.']) };
}
