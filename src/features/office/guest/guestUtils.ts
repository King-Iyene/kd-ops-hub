/** Small pure helpers for guest visits (tested). */

export function validEmail(e: string): boolean {
  const s = e.trim();
  return s.length <= 200 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(s);
}

export type GuestStatus = 'invited' | 'waiting' | 'approved' | 'denied' | 'ended';

export const STATUS_LABEL: Record<GuestStatus, string> = {
  invited: 'Invited',
  waiting: 'Waiting at the door',
  approved: 'In the visitor room',
  denied: 'Not let in',
  ended: 'Visit ended',
};

/** "1 h 12 min left", or "ended". */
export function timeLeft(until: string | null | undefined, now = Date.now()): string {
  if (!until) return '';
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return 'ended';
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${Math.max(1, m)} min left`;
}

/** The visitor link for a token. */
export function visitLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/visit/${token}`;
}
