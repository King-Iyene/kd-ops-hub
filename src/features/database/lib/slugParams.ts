import { isUuid, shortToUuid } from './shortId';

/**
 * Pure helpers behind useSlugResolver, kept out of React and Supabase so they
 * can be unit tested.
 */

export interface ResolvedIds {
  baseId: string | undefined;
  tableId: string | undefined;
  viewId: string | undefined;
}

/** The uuid a short id stands for, or null when the text is a uuid already or is a slug. */
export function tryDecodeShortId(param: string): string | null {
  if (isUuid(param)) return null;
  if (param.length > 25) return null;
  const decoded = shortToUuid(param);
  return decoded !== param && isUuid(decoded) ? decoded : null;
}

/** The id a path part names without asking the server (a short id), or null when it needs a lookup. */
export function idWithoutLookup(param: string): string | null {
  return tryDecodeShortId(param);
}

/**
 * When every part of the address is a short id there is nothing to
 * look up, so the answer is known on the very first render. Returns null as
 * soon as any given part needs a server lookup (a readable slug).
 */
export function resolveParamsWithoutLookup(
  rawBase?: string,
  rawTable?: string,
  rawView?: string,
): ResolvedIds | null {
  if (!rawBase) return null;
  const baseId = idWithoutLookup(rawBase);
  if (!baseId) return null;
  let tableId: string | undefined;
  if (rawTable) {
    const t = idWithoutLookup(rawTable);
    if (!t) return null;
    tableId = t;
  }
  let viewId: string | undefined;
  if (rawView) {
    const v = idWithoutLookup(rawView);
    if (!v) return null;
    viewId = tableId ? v : undefined;
  }
  return { baseId, tableId, viewId };
}

/**
 * A slug is only unique inside its parent (a table slug inside its base, a
 * view slug inside its table). To look the child and the parent up at the same
 * time the child query is asked for every row with that slug, and this picks
 * the one that belongs to the parent that came back.
 */
export function pickByParent<T extends Record<string, unknown>>(
  rows: readonly T[] | null | undefined,
  parentColumn: keyof T,
  parentId: string | undefined,
): T | undefined {
  if (!rows || !parentId) return undefined;
  return rows.find((r) => r[parentColumn] === parentId);
}
