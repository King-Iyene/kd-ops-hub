const TZ_KEY = 'kdops_timezone';
const DEFAULT_TZ = 'Africa/Lagos';

/** Read the company timezone from localStorage (written by Settings on load/save). */
export const getTimezone = (): string =>
  localStorage.getItem(TZ_KEY) || DEFAULT_TZ;

/** Called by Settings whenever timezone is loaded or saved — keeps format.ts in sync. */
export const setTimezoneCache = (tz: string): void =>
  localStorage.setItem(TZ_KEY, tz || DEFAULT_TZ);

export const formatNaira = (amount: number | null | undefined): string => {
  const n = amount ?? 0;
  return `₦${n.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/** DD/MM/YYYY — date only, no time, no timezone. */
export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

/**
 * "27 Apr 2026, 3:45 PM (WAT)" — date + 12-hour time + timezone abbreviation.
 * Reads timezone from localStorage (set by Settings on load/save).
 * Falls back to Africa/Lagos if not set.
 */
export const formatDateTime = (
  date: string | Date | null | undefined,
): string => {
  if (!date) return '—';
  try {
    const tz = getTimezone();
    const d = new Date(date);
    // Get the formatted date+time
    const base = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(d);
    // Get short timezone abbreviation (e.g. WAT, GMT, EST)
    const tzAbbr = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '';
    return tzAbbr ? `${base} (${tzAbbr})` : base;
  } catch {
    return '—';
  }
};

/**
 * "9:45 AM" — time only, 12-hour, org timezone, no date.
 * Used in tables and cards where the date is already shown separately.
 */
export const formatTime = (
  date: string | Date | null | undefined,
): string => {
  if (!date) return '—';
  try {
    const tz = getTimezone();
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

/** Whole-number naira formatter used in chart tooltips etc. */
export const formatNairaCompact = (amount: number | null | undefined): string => {
  const n = amount ?? 0;
  return `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
};

/** ISO yyyy-mm-dd, accepting Date or ISO string; used when writing to the DB. */
export const toIsoDate = (d: Date | string): string => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
};

/** Days until a date (can be negative if in the past). */
export const daysUntil = (d: string | Date | null | undefined): number | null => {
  if (!d) return null;
  const target = new Date(d);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Mask a bank account number for display: show only the last 4 digits.
 * "0123456789" → "******6789"
 * Already-masked strings (contain *) or empty values are returned as-is.
 */
export const maskAccountNumber = (acct: string | null | undefined): string => {
  if (!acct) return '—';
  if (acct.includes('*') || acct === '—') return acct;
  const digits = acct.replace(/\D/g, '');
  if (digits.length === 0) return acct;
  return '*'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
};

/** Convert bytes to a short human-readable label (1.2 MB). */
export const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};
