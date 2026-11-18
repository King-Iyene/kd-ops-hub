// A short status people can show next to their name (like "Hustling mode"). Only the id travels over the network.
export const STATUSES = [
  { id: 'available', emoji: '🟢', label: 'Available' },
  { id: 'focus', emoji: '🎯', label: 'Focusing' },
  { id: 'meeting', emoji: '💬', label: 'In a meeting' },
  { id: 'lunch', emoji: '🍽️', label: 'Lunch' },
  { id: 'hustle', emoji: '🚀', label: 'Hustling mode' },
  { id: 'away', emoji: '🌙', label: 'Away' },
] as const;

export type StatusId = (typeof STATUSES)[number]['id'];

/** The status for an id read from the network (anything unknown means no status). */
export function statusOf(id: unknown): (typeof STATUSES)[number] | null {
  return STATUSES.find((s) => s.id === id) ?? null;
}
