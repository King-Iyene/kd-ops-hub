export const formatNaira = (amount: number | null | undefined): string => {
  const n = amount ?? 0;
  return `₦${n.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/** DD/MM/YYYY (en-GB). */
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

/** DD/MM/YYYY HH:mm. */
export const formatDateTime = (
  date: string | Date | null | undefined,
): string => {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
  // Normalise to midnight so "days" is an integer count of calendar days.
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
};

/** Convert bytes to a short human-readable label (1.2 MB). */
export const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};
