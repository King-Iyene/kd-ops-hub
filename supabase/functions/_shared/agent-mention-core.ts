// Ops Agent: tagging the person a message is about, in Zoho Cliq and Slack. Pure parts, no Deno APIs.
//
// Who is tagged is looked up from the person: a saved Cliq (or Slack) user id wins, otherwise their email address.
// How a tag is written differs between tools and between versions, so the Cliq format is a setting on the connection
// (default {@%s}, where %s is replaced by the id or email): a wrong guess is fixed in Connections without a new release.

export type MentionKind = 'cliq' | 'slack';
export interface Mention { name: string; id: string }
export interface IdentityRow { cliq_user_id?: string | null; slack_user_id?: string | null; email?: string | null }

export const DEFAULT_MENTION_TEMPLATE: Record<MentionKind, string> = { cliq: '{@%s}', slack: '<@%s>' };
const SAFE_ID = /^[A-Za-z0-9._@+-]{2,120}$/;

/** The identifier to tag with, or null when we have nothing safe to tag. */
export function pickMentionId(kind: MentionKind, identity: IdentityRow | null | undefined, profileEmail: string | null | undefined): string | null {
  const own = kind === 'cliq' ? identity?.cliq_user_id : identity?.slack_user_id;
  const candidates = kind === 'cliq' ? [own, identity?.email, profileEmail] : [own];   // Slack tags by user id only
  for (const c of candidates) {
    const v = typeof c === 'string' ? c.trim() : '';
    if (v && SAFE_ID.test(v)) return v;
  }
  return null;
}

/** "{@%s}" -> "{@cara@example.com}". A template without %s, or an overlong one, falls back to the default. */
export function renderMention(kind: MentionKind, template: unknown, id: string): string {
  const t = typeof template === 'string' && template.includes('%s') && template.length <= 40 && !/[\r\n]/.test(template) ? template : DEFAULT_MENTION_TEMPLATE[kind];
  return t.replace('%s', id);
}

export function validMentionTemplate(t: unknown): boolean {
  return typeof t === 'string' && t.includes('%s') && t.length <= 40 && !/[\r\n]/.test(t);
}
