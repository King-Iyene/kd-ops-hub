// Crew: how an executive's standing-permission post to the team looks in Cliq (pure, no Deno APIs, so it can be unit tested).
//
// The rules about WHETHER a post may go out (permission on, daily cap, kinds, the text rules, who may be tagged, one reminder a day per person) live in the
// database (crew_cliq_post_reserve) so nothing can get around them. This file only shapes the message that is posted after the database said yes:
//   *📋 Operations follow-up*                 (bold headline with an emoji for the kind; the sender adds the asterisks around the title)
//   Sent by Henry (AI) via Operations          (so the team does not think the person whose Zoho sign-in is used wrote it)
//   @Full Name ... the words the executive wrote
//   _Crew · KD Ops_                            (a quiet footer)
// People named as "@Full Name" in the words are tagged by the sender where they have a Cliq id; the rest stay plain names.

export type PostKind = 'tracking_followup' | 'announcement';
export const POST_KINDS: readonly PostKind[] = ['tracking_followup', 'announcement'];

export const POST_LOOK: Record<PostKind, { emoji: string; label: string }> = {
  tracking_followup: { emoji: '📋', label: 'Operations follow-up' },
  announcement: { emoji: '📢', label: 'Announcement' },
};

export const POST_FOOTER = '_Crew · KD Ops_';

const INVISIBLE = new RegExp(`[${String.fromCharCode(0x2063, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)}]`, 'g');

/** The words as plain text: no invisible characters, no hand-written tags, no stray formatting marks (a lone * ~ or ` would break the message's formatting). */
export function cleanTeamText(text: unknown, max = 700): string {
  const s = typeof text === 'string' ? text : '';
  return s.replace(INVISIBLE, '').replace(/\r\n?/g, '\n').replace(/\{@[^}]*\}/g, '')
    .replace(/[*~`]/g, (c) => ({ '*': '∗', '~': '∼', '`': "'" }[c] as string))
    .replace(/(^|[\s(])_+|_+(?=[\s).,!?:;]|$)/gm, '$1')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, max).trim();
}

const firstWord = (name: string): string => cleanTeamText(name, 80).split(/\s+/)[0] || 'Crew';

/** "Zoho Cliq Operations" -> "Operations": the channel's plain name for the "via" line. */
export function viaName(connectionName: string): string {
  const n = cleanTeamText(connectionName, 80).replace(/^zoho\s+cliq\s+/i, '').trim();
  return n || 'Cliq';
}

export interface TeamPost { kind: string; text: string; agentName: string; via: string }

/** The headline (the sender wraps it in bold) and the body of the post. */
export function formatTeamPost(p: TeamPost): { title: string; text: string } {
  const look = POST_LOOK[(POST_KINDS as readonly string[]).includes(p.kind) ? (p.kind as PostKind) : 'announcement'];
  return {
    title: `${look.emoji} ${look.label}`,
    text: [`Sent by ${firstWord(p.agentName)} (AI) via ${viaName(p.via)}`, cleanTeamText(p.text), '', POST_FOOTER].join('\n'),
  };
}

/** What the database returns when it says yes (see crew_cliq_post_reserve). */
export interface ReserveAllowed {
  allowed: true; post_id: string; connection_id: string; kind: string; text: string;
  mentions: { name: string; id: string }[]; agent_name: string; agent_title: string; via: string;
}
export interface ReserveRefused { allowed: false; error: string }
export type ReserveResult = ReserveAllowed | ReserveRefused;

/** A defensive read of the database's answer. Anything unexpected is treated as a refusal, so nothing is ever posted on a guess. */
export function readReserve(data: unknown): ReserveResult {
  const d = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  if (d.allowed !== true) return { allowed: false, error: typeof d.error === 'string' && d.error ? d.error : 'the post was not allowed' };
  const mentions = Array.isArray(d.mentions)
    ? d.mentions.map((m) => {
      const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
      return { name: typeof o.name === 'string' ? o.name : '', id: typeof o.id === 'string' ? o.id : '' };
    }).filter((m) => m.name)
    : [];
  const need = ['post_id', 'connection_id', 'kind', 'text', 'agent_name', 'via'] as const;
  for (const k of need) if (typeof d[k] !== 'string' || !d[k]) return { allowed: false, error: 'the post was not allowed' };
  return {
    allowed: true, post_id: d.post_id as string, connection_id: d.connection_id as string, kind: d.kind as string, text: d.text as string, mentions,
    agent_name: d.agent_name as string, agent_title: typeof d.agent_title === 'string' ? d.agent_title : '', via: d.via as string,
  };
}
