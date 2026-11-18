import { isEmoji } from './emoji';

// A short status people can show next to their name (like "Hustling mode"). Only the id travels over the network.
export const STATUSES = [
  { id: 'available', emoji: '🟢', label: 'Available' },
  // busy is only a label (people can still reach you); do not disturb silences rings and waves
  { id: 'busy', emoji: '🟡', label: 'Busy' },
  { id: 'dnd', emoji: '🔴', label: 'Do not disturb' },
  { id: 'focus', emoji: '🎯', label: 'Focusing' },
  { id: 'meeting', emoji: '💬', label: 'In a meeting' },
  { id: 'lunch', emoji: '🍽️', label: 'Lunch' },
  { id: 'hustle', emoji: '🚀', label: 'Hustling mode' },
  { id: 'away', emoji: '🌙', label: 'Away' },
] as const;

export type StatusId = (typeof STATUSES)[number]['id'];

export interface StatusInfo { id: string; emoji: string; label: string }

export const MAX_STATUS_TEXT = 30;
/** Emoji offered for a status you write yourself. */
export const STATUS_EMOJI = ['💬', '🎧', '🚀', '🍽️', '🏠', '✈️', '🤒', '📞', '✍️', '🎯', '☕', '🎉'];

/** A status you write yourself is sent as "c:<emoji>|<words>". */
export function customStatusId(emoji: string, text: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u001f\u007f|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_STATUS_TEXT);
  return clean && isEmoji(emoji) ? `c:${emoji}|${clean}` : '';
}

/** The status for an id read from the network (a preset, or one somebody wrote; anything else means no status). */
export function statusOf(id: unknown): StatusInfo | null {
  const preset = STATUSES.find((s) => s.id === id);
  if (preset) return preset;
  if (typeof id !== 'string' || !id.startsWith('c:')) return null;
  const rest = id.slice(2);
  const i = rest.indexOf('|');
  if (i < 1) return null;
  const emoji = rest.slice(0, i);
  // eslint-disable-next-line no-control-regex
  const label = rest.slice(i + 1).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_STATUS_TEXT);
  return isEmoji(emoji) && label ? { id, emoji, label } : null;
}
