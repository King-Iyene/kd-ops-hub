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

/**
 * The names behind a list of linked values stored in the row itself (a list of ids, or of objects with a name):
 * ids are resolved through the record's lookup when there is one. Every item gets a distinct key.
 */
export function legacyLinkItems(value: unknown, lookup?: Record<string, string>): Array<{ id: string; label: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((item: any, i: number) => {
    if (typeof item === 'object' && item !== null) {
      const label = String(item.title || item.name || item.primary || item.id || '');
      return { id: String(item.id ?? `${i}-${label}`), label };
    }
    const id = String(item);
    return { id: `${i}-${id}`, label: (lookup && lookup[id]) || id };
  });
}

/** Width in pixels of a piece of text in the chip font, when the browser can measure it. */
export type TextMeasurer = (text: string) => number;

/**
 * The width a chip will really take. With a measurer (the browser's own font metrics) this is exact; without
 * one it falls back to an average character width, which is why chips used to come out wider than planned.
 */
export function chipWidth(label: string, measure?: TextMeasurer): number {
  const text = measure ? measure(label) : label.length * CHAR_WIDTH;
  return Math.min(CHIP_MAX, Math.ceil(text) + CHIP_PADDING);
}

/**
 * How many chips fit in `available` pixels, leaving room for a "+N" badge when
 * some are hidden. Always at least one, so a narrow cell still shows something.
 */
export function chipsThatFit(labels: readonly string[], available: number, measure?: TextMeasurer): number {
  if (labels.length === 0) return 0;
  if (available <= 0) return 1;
  let used = 0;
  let fit = 0;
  for (let i = 0; i < labels.length; i++) {
    const w = chipWidth(labels[i], measure) + (i > 0 ? CHIP_GAP : 0);
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
