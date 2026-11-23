/**
 * Durations are stored as a number of seconds and shown in the field's format.
 * Typing accepts the forms people use: 1:30, 1:30:15, 1h 30m, 90m, 1.5h, 45s.
 */

export type DurationFormat = 'h:mm' | 'h:mm:ss' | 'h:mm:ss.s' | 'h:mm:ss.ss' | 'h:mm:ss.sss';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function normalizeDurationFormat(raw: unknown): DurationFormat {
  const f = String(raw ?? '');
  return (['h:mm', 'h:mm:ss', 'h:mm:ss.s', 'h:mm:ss.ss', 'h:mm:ss.sss'] as const).includes(f as DurationFormat)
    ? (f as DurationFormat)
    : 'h:mm';
}

/** Seconds to text, for example 5400 in h:mm gives "1:30". Negative values keep their sign. */
export function formatDuration(totalSeconds: number, format: DurationFormat = 'h:mm'): string {
  if (!Number.isFinite(totalSeconds)) return '';
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  const decimals = format === 'h:mm:ss.s' ? 1 : format === 'h:mm:ss.ss' ? 2 : format === 'h:mm:ss.sss' ? 3 : 0;

  if (format === 'h:mm') {
    // Whole minutes; seconds are rounded to the nearest minute so 0:59:59 never shows as 0:59.
    const mins = Math.round(abs / 60);
    return `${sign}${Math.floor(mins / 60)}:${pad2(mins % 60)}`;
  }

  const factor = 10 ** decimals;
  const units = Math.round(abs * factor);
  const wholeSeconds = Math.floor(units / factor);
  const fraction = units % factor;
  const h = Math.floor(wholeSeconds / 3600);
  const m = Math.floor((wholeSeconds % 3600) / 60);
  const s = wholeSeconds % 60;
  const base = `${h}:${pad2(m)}:${pad2(s)}`;
  return `${sign}${decimals > 0 ? `${base}.${String(fraction).padStart(decimals, '0')}` : base}`;
}

/**
 * Text to seconds, or null when it is not a duration (empty text is also null,
 * meaning "no value"). A plain number is minutes in h:mm fields and seconds otherwise.
 */
export function parseDuration(input: string, format: DurationFormat = 'h:mm'): number | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;
  let sign = 1;
  if (text.startsWith('-')) {
    sign = -1;
    text = text.slice(1).trim();
  }

  // 1h 30m 15s, 1h30, 90m, 1.5h, 45s
  const units = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?$/.exec(text);
  if (units && (units[1] || units[2] || units[3])) {
    const h = Number(units[1] ?? 0);
    const m = Number(units[2] ?? 0);
    const s = Number(units[3] ?? 0);
    return sign * (h * 3600 + m * 60 + s);
  }
  // "1h 30" means 1 hour 30 minutes
  const hourThenNumber = /^(\d+)\s*h(?:ours?|rs?)?\s*(\d+)$/.exec(text);
  if (hourThenNumber) return sign * (Number(hourThenNumber[1]) * 3600 + Number(hourThenNumber[2]) * 60);

  if (text.includes(':')) {
    const parts = text.split(':');
    if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
    const nums = parts.map(Number);
    if (nums.length === 3) return sign * (nums[0] * 3600 + nums[1] * 60 + nums[2]);
    // two parts: hours:minutes in h:mm fields, minutes:seconds otherwise
    return sign * (format === 'h:mm' ? nums[0] * 3600 + nums[1] * 60 : nums[0] * 60 + nums[1]);
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    return sign * (format === 'h:mm' ? n * 60 : n);
  }
  return null;
}
