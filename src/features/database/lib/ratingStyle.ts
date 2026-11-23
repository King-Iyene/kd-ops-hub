/** Rating field look: how many icons, which icon, which colour. Pure, so it can be tested. */

export type RatingIcon = 'star' | 'heart' | 'flag' | 'thumb';

export const RATING_ICONS: { value: RatingIcon; label: string }[] = [
  { value: 'star', label: 'Star' },
  { value: 'heart', label: 'Heart' },
  { value: 'flag', label: 'Flag' },
  { value: 'thumb', label: 'Thumbs up' },
];

export const RATING_COLORS: { value: string; hex: string; label: string }[] = [
  { value: 'amber', hex: '#F59E0B', label: 'Amber' },
  { value: 'red', hex: '#EF4444', label: 'Red' },
  { value: 'pink', hex: '#EC4899', label: 'Pink' },
  { value: 'green', hex: '#22C55E', label: 'Green' },
  { value: 'blue', hex: '#3B82F6', label: 'Blue' },
  { value: 'purple', hex: '#8B5CF6', label: 'Purple' },
];

export const DEFAULT_RATING_ICON: RatingIcon = 'star';
export const DEFAULT_RATING_COLOR = 'amber';

/** Number of icons, between 1 and 10 (5 when unset or invalid). */
export function ratingMaxOf(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(10, Math.round(n));
}

export function ratingIconOf(raw: unknown): RatingIcon {
  return RATING_ICONS.some((i) => i.value === raw) ? (raw as RatingIcon) : DEFAULT_RATING_ICON;
}

/** Hex colour for a stored colour name; unknown names fall back to amber. */
export function ratingHexOf(raw: unknown): string {
  return (RATING_COLORS.find((c) => c.value === raw) ?? RATING_COLORS[0]).hex;
}

/** The value a rating cell should hold after the person picks `clicked` icons (picking the current value clears it). */
export function nextRating(current: number, clicked: number, max: number): number {
  const target = Math.min(Math.max(Math.round(clicked), 0), max);
  return target === current ? 0 : target;
}

/** Arrow-key step, kept inside 0..max. */
export function stepRating(current: number, delta: number, max: number): number {
  return Math.min(Math.max(current + delta, 0), max);
}
