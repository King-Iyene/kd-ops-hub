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

/**
 * Naira amount in institutional format with the ISO 4217 code: "NGN 200,000.00".
 *
 * German-bank convention (Sparkasse, DKB, N26 all do this) — never trust a
 * lone currency glyph because:
 *   1. ₦ renders inconsistently across fonts and OSes
 *   2. Multi-currency reports get confused if every figure is just a glyph
 *   3. Institutions read "NGN 200,000.00" as auditable; "₦200,000" as casual
 *
 * Use on every monetary value in the bank-grade ledger surfaces (Payments,
 * Transactions, Payment Schedule, Payroll). Reserve formatNaira() with the
 * lone glyph for tight chips and inline references where the institutional
 * column header isn't there to qualify the amount.
 */
export const formatNairaCode = (amount: number | null | undefined): string => {
  const n = amount ?? 0;
  return `NGN ${n.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Date formatter — adapts to whether the input carries a time component.
 *
 * - Pure dates ('YYYY-MM-DD') render as DD/MM/YYYY: birthdays, leave dates,
 *   payroll periods. Showing a fake midnight time for those would be wrong.
 * - ISO timestamps with time render as a full timezone-aware date+time
 *   ("27 Apr 2026, 3:45 PM (WAT)"), so tables across the platform show real
 *   transaction times instead of bare dates.
 *
 * Date objects always render as full date+time since the time is always
 * meaningful when the value is constructed in JS.
 */
export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '—';
  try {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Pure YYYY-MM-DD with no time — render as date-only.
      return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
    return formatDateTime(date);
  } catch {
    return '—';
  }
};

/**
 * "27 Apr 2026, 3:45:21 PM (WAT)" — date + 12-hour time with seconds + timezone.
 * Reads timezone from localStorage (set by Settings on load/save).
 * Falls back to Africa/Lagos if not set.
 */
export function formatDateTime(
  date: string | Date | null | undefined,
): string {
  if (!date) return '—';
  try {
    const tz = getTimezone();
    const d = new Date(date);
    const base = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(d);
    const tzAbbr = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '';
    return tzAbbr ? `${base} (${tzAbbr})` : base;
  } catch {
    return '—';
  }
}

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

/**
 * Receipt-grade timestamp matching CBN/NIBSS practice for transfer
 * confirmations: weekday, day, month, year, 12-hour clock with seconds and
 * timezone. Example: "Sunday, 4 May 2026 · 7:44:23 PM (WAT)".
 */
export const formatReceiptDateTime = (
  date: string | Date | null | undefined,
): string => {
  if (!date) return '—';
  try {
    const tz = getTimezone();
    const d = new Date(date);
    const dateParts = new Intl.DateTimeFormat('en-NG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: tz,
    }).format(d);
    const timeParts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(d);
    const tzAbbr = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '';
    return tzAbbr ? `${dateParts} · ${timeParts} (${tzAbbr})` : `${dateParts} · ${timeParts}`;
  } catch {
    return '—';
  }
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

/** Format a trip/journey elapsed duration from milliseconds: "2h 05m", "14m 30s", "45s". */
export const formatElapsed = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
};

/** Format how long ago a GPS ping was received: "12s ago", "4m ago", "2h ago". */
export const formatPingAge = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};
