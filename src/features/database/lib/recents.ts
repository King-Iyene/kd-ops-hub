/**
 * "Recently visited" list for the command palette. Pure helpers only; the
 * localStorage reading and writing lives in navStorage.ts.
 */

export type RecentKind = 'base' | 'table' | 'view';

export interface RecentItem {
  kind: RecentKind;
  id: string;
  label: string;
  baseId: string;
  /** Set for tables (their own id) and views (the table they belong to). */
  tableId?: string;
}

export const MAX_RECENTS = 8;

const KINDS: readonly RecentKind[] = ['base', 'table', 'view'];

function sameKey(a: RecentItem, b: RecentItem): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** Put an item at the front, drop its older copy, keep at most `max`. */
export function addRecent(list: readonly RecentItem[], item: RecentItem, max: number = MAX_RECENTS): RecentItem[] {
  return [item, ...list.filter((r) => !sameKey(r, item))].slice(0, max);
}

export function recentsEqual(a: readonly RecentItem[], b: readonly RecentItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => sameKey(r, b[i]) && r.label === b[i].label && r.baseId === b[i].baseId && r.tableId === b[i].tableId);
}

function isRecentItem(value: unknown): value is RecentItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === 'string' &&
    (KINDS as readonly string[]).includes(v.kind) &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.label === 'string' &&
    typeof v.baseId === 'string' &&
    v.baseId.length > 0 &&
    (v.tableId === undefined || typeof v.tableId === 'string')
  );
}

/** Read the stored JSON defensively: bad or missing data gives an empty list. */
export function parseRecents(raw: string | null | undefined, max: number = MAX_RECENTS): RecentItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RecentItem[] = [];
    for (const entry of parsed) {
      if (!isRecentItem(entry)) continue;
      if (out.some((r) => sameKey(r, entry))) continue;
      out.push({ kind: entry.kind, id: entry.id, label: entry.label, baseId: entry.baseId, ...(entry.tableId ? { tableId: entry.tableId } : {}) });
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeRecents(list: readonly RecentItem[]): string {
  return JSON.stringify(list);
}

export interface RecentContext {
  baseIds: ReadonlySet<string>;
  activeBaseId: string | null;
  /** Tables of the open base. Tables of other bases cannot be checked, so they are kept. */
  tableIds: ReadonlySet<string>;
  activeTableId: string | null;
  /** Views of the open table. */
  viewIds: ReadonlySet<string>;
}

/**
 * Drop entries that point at something that is gone. Only what is loaded can be
 * checked: a base must still exist; a table or view is checked only when it sits
 * in the open base or table.
 */
export function pruneRecents(list: readonly RecentItem[], ctx: RecentContext): RecentItem[] {
  return list.filter((r) => {
    if (!ctx.baseIds.has(r.baseId)) return false;
    if (r.kind === 'base') return true;
    if (r.kind === 'table') return r.baseId !== ctx.activeBaseId || ctx.tableIds.has(r.id);
    // view
    if (r.baseId === ctx.activeBaseId && r.tableId && !ctx.tableIds.has(r.tableId)) return false;
    return r.tableId !== ctx.activeTableId || ctx.viewIds.has(r.id);
  });
}

/** Remember the last tables used in one base, newest first (ids only, for the tab strip). */
export const MAX_RECENT_TABLE_IDS = 12;

export function addRecentId(list: readonly string[], id: string, max: number = MAX_RECENT_TABLE_IDS): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}
