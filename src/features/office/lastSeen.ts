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
