/**
 * Pure helpers for loading linked records in bulk (one request per column and
 * page of rows instead of one request per cell). Kept free of React and
 * Supabase so they can be unit tested.
 */

export interface JunctionRow {
  source_id: string;
  target_id: string;
}

/** Split a list into chunks of at most `size` items. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Turn junction rows into `recordId -> linked ids`. Links are stored once or
 * twice (one row per direction), so a row counts for whichever side is one of
 * the requested records, and duplicates are removed while keeping row order.
 */
export function mapJunctionRows(
  rows: readonly JunctionRow[],
  recordIds: ReadonlySet<string>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const seen = new Map<string, Set<string>>();
  const add = (recordId: string, otherId: string) => {
    if (!recordId || !otherId) return;
    let set = seen.get(recordId);
    if (!set) {
      set = new Set();
      seen.set(recordId, set);
      out.set(recordId, []);
    }
    if (set.has(otherId)) return;
    set.add(otherId);
    out.get(recordId)!.push(otherId);
  };
  for (const row of rows) {
    if (recordIds.has(row.source_id)) add(row.source_id, row.target_id);
    if (recordIds.has(row.target_id) && row.target_id !== row.source_id) add(row.target_id, row.source_id);
  }
  return out;
}

/** True for text that is really an internal id (Airtable "recXXXXXXXXXXXXXX" or a UUID), never a name. */
export function looksLikeId(text: string): boolean {
  const t = text.trim();
  return /^rec[A-Za-z0-9]{12,}$/.test(t) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
}

/** Readable text for a primary-field value (text, or a JSON value from an import). */
export function linkLabel(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const inner = v.value ?? v.title ?? v.name ?? v.label;
    return inner != null ? String(inner) : '';
  }
  return String(value);
}

const CHIP_PADDING = 18; // horizontal padding plus border of a chip
const CHIP_GAP = 4;
const BADGE_WIDTH = 30;
const CHAR_WIDTH = 6.1; // average width of one character at the chip font size
const CHIP_MAX = 200;

export function chipWidth(label: string): number {
  return Math.min(CHIP_MAX, Math.ceil(label.length * CHAR_WIDTH) + CHIP_PADDING);
}

/**
 * How many chips fit in `available` pixels, leaving room for a "+N" badge when
 * some are hidden. Always at least one, so a narrow cell still shows something.
 */
export function chipsThatFit(labels: readonly string[], available: number): number {
  if (labels.length === 0) return 0;
  if (available <= 0) return 1;
  let used = 0;
  let fit = 0;
  for (let i = 0; i < labels.length; i++) {
    const w = chipWidth(labels[i]) + (i > 0 ? CHIP_GAP : 0);
    const isLast = i === labels.length - 1;
    const reserve = isLast ? 0 : BADGE_WIDTH + CHIP_GAP;
    if (used + w + reserve > available) break;
    used += w;
    fit++;
  }
  return Math.max(1, fit);
}

/** Stable key for a list of ids (cheap, order sensitive). */
export function idsKey(ids: readonly string[]): string {
  return ids.length === 0 ? '0' : `${ids.length}:${ids[0]}:${ids[ids.length - 1]}`;
}
