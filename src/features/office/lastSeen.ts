/** "Active now", "10 min ago", "2 hours ago", "yesterday", "3 days ago" for the people list. */
export function seenAgo(seenAt: string | number | null | undefined, now: number = Date.now()): string {
  if (seenAt === null || seenAt === undefined) return 'Not seen yet';
  const t = typeof seenAt === 'number' ? seenAt : Date.parse(seenAt);
  if (!Number.isFinite(t)) return 'Not seen yet';
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 3) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return 'Over a month ago';
}

/** "Active 3 hours ago" for the last day, then "Last seen 3 days ago". */
export function seenLabel(seenAt: string | number | null | undefined, now: number = Date.now()): string {
  const ago = seenAgo(seenAt, now);
  if (ago === 'Not seen yet') return ago;
  const t = typeof seenAt === 'number' ? seenAt : Date.parse(seenAt as string);
  const recent = Number.isFinite(t) && now - t < 24 * 60 * 60_000;
  return (recent ? 'Active ' : 'Last seen ') + (ago === 'Just now' ? 'just now' : ago === 'Yesterday' ? 'yesterday' : ago);
}
