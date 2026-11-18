import { zoneParts } from './clock';
import { liveRainLevel, type Weather } from './weather';

/** The sky over the office: time of day on Nigerian time, and the Nigerian seasons. Pure, so it is unit tested. */

export type TimeMode = 'auto' | 'morning' | 'afternoon' | 'evening' | 'night';
export type SeasonMode = 'auto' | 'clear' | 'harmattan' | 'rainy';
export type Season = 'clear' | 'harmattan' | 'rainy';

export const TIME_MODES: { id: TimeMode; label: string }[] = [
  { id: 'auto', label: 'Auto (Lagos time)' },
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
];
export const SEASON_MODES: { id: SeasonMode; label: string }[] = [
  { id: 'auto', label: 'Auto (Nigerian calendar)' },
  { id: 'clear', label: 'Clear' },
  { id: 'harmattan', label: 'Harmattan' },
  { id: 'rainy', label: 'Rainy' },
];

/** Lagos (WAT) hour of the day, with minutes as a fraction. */
export function watHour(now: number): number {
  const { h, m, s } = zoneParts('Africa/Lagos', now);
  return h + m / 60 + s / 3600;
}

/** 0 in the dark, 1 in full daylight, with a slow dawn (5:30 to 7:00) and dusk (17:30 to 19:30). */
export function daylight(hour: number): number {
  if (hour < 5.5 || hour >= 19.5) return 0;
  if (hour < 7) return (hour - 5.5) / 1.5;
  if (hour < 17.5) return 1;
  return 1 - (hour - 17.5) / 2;
}

/**
 * What the light looks like at an hour, so morning, midday and afternoon are three different looks:
 * morning is cool and fresh with the sun low on the left, midday is bright and neutral with the sun high,
 * afternoon turns warm and golden with the sun low on the right.
 */
export function dayLook(hour: number): { cool: number; gold: number; bloom: number; elevation: number; sunSide: number } {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const elevation = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12));
  return {
    cool: clamp(1 - (hour - 7) / 5) * (hour >= 6 ? 1 : 0),
    gold: clamp((hour - 14) / 3.5),
    bloom: Math.pow(elevation, 5),
    elevation,
    sunSide: clamp((hour - 6) / 12),
  };
}

/** The orange glow around sunrise and sunset (0 to 1). */
export function warmth(hour: number): number {
  const g = (c: number, w: number) => Math.exp(-(((hour - c) / w) ** 2));
  return Math.min(1, g(6.3, 0.75) + g(18.4, 0.9));
}

const FIXED_HOUR: Record<Exclude<TimeMode, 'auto'>, number> = { morning: 8.5, afternoon: 13.5, evening: 18.4, night: 23 };

export interface SkyState { hour: number; light: number; warm: number; /** use the dark palette */ dark: boolean }

export function skyState(mode: TimeMode, now: number): SkyState {
  const hour = mode === 'auto' ? watHour(now) : FIXED_HOUR[mode];
  const light = daylight(hour);
  return { hour, light, warm: warmth(hour), dark: light < 0.35 };
}

/** Harmattan runs from late November to February, the rains from April to October, and March is hot and clear. */
export function seasonFor(mode: SeasonMode, now: number, live?: Weather | null): Season {
  if (mode !== 'auto') return mode;
  // when it is really raining where we are, it rains in the office
  if (live && liveRainLevel(live) > 0) return 'rainy';
  const month = new Date(now + 3600_000).getUTCMonth() + 1; // Lagos is UTC+1
  const day = new Date(now + 3600_000).getUTCDate();
  if (month === 12 || month <= 2 || (month === 11 && day >= 15)) return 'harmattan';
  // in the rains it is dry between showers; without live weather we fall back on the calendar
  if (live) return 'clear';
  if (month >= 4 && month <= 10) return 'rainy';
  return 'clear';
}

/** In the rainy season it comes and goes: showers of a few minutes with gaps between (0 to 1). */
export function rainLevel(season: Season, now: number, live?: Weather | null, auto = false): number {
  if (season !== 'rainy') return 0;
  if (auto && live) return liveRainLevel(live);
  const v = Math.sin(now / 110000) * 0.6 + Math.sin(now / 37000) * 0.4 + 0.3;
  return Math.max(0, Math.min(1, v * 1.4));
}

/** The rain to draw: in Auto it comes and goes in showers, but when the season is set to Rainy it always rains (at least steadily). */
export function rainFor(mode: SeasonMode, season: Season, now: number): number {
  const r = rainLevel(season, now);
  return mode === 'rainy' ? Math.max(0.6, r) : r;
}

/** Lightning: a flash now and then while it rains hard. Returns its strength (0 to 1) and which flash it is. */
export function lightning(rain: number, now: number): { strength: number; id: number } {
  if (rain < 0.5) return { strength: 0, id: -1 };
  const bucket = Math.floor(now / 21000);
  const r = Math.abs(Math.sin(bucket * 12.9898) * 43758.5453) % 1;
  if (r > 0.55) return { strength: 0, id: -1 };
  const at = bucket * 21000 + r * 16000;
  const age = now - at;
  if (age < 0 || age > 500) return { strength: 0, id: -1 };
  const flicker = age > 160 && age < 230 ? 0.35 : 1;
  return { strength: Math.pow(1 - age / 500, 2) * flicker, id: bucket };
}
