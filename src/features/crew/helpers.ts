import type { CrewAgent } from './crewDb';

export function ago(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function agentName(agents: CrewAgent[] | undefined, id: string | null): string {
  if (!id) return 'You';
  return agents?.find((a) => a.id === id)?.name ?? 'Unknown agent';
}

const KIND_WORDS: Record<string, string> = { tracking_followup: 'tracking follow-ups', announcement: 'announcements' };

/** The plain-words sentence on the standing-permission card: who may post what, where, how many a day, and that it is all logged. */
export function standingSentence(a: { first: string; channel: string | null; max: number; kinds: string[] }): string {
  const what = a.kinds.map((k) => KIND_WORDS[k] ?? k).join(' and ') || 'nothing';
  const where = a.channel ? `#${a.channel}` : 'the channel you choose';
  return `${a.first} may post ${what} in ${where}, up to ${a.max} a day. Everything ${a.first} posts is logged below.`;
}
