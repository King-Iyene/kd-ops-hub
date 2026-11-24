/**
 * Adds the derived values the grid shows (link ids from the links table,
 * formula results, the id -> name lookup) to the rows loaded from the server,
 * and keeps the result stable.
 *
 * The screen used to rebuild every loaded row, and re-evaluate every formula
 * for every row, each time anything changed: a page of rows arriving, one link
 * chunk finishing (a table with link columns finishes dozens), the names lookup
 * growing. Because every row became a new object each time, every memoised cell
 * on screen re-rendered as well.
 *
 * Here each row is remembered together with what it was built from. A row is
 * rebuilt only when its own raw data, its own link items, or the names it
 * actually refers to have changed; otherwise the same object comes back, so
 * React skips it. Formulas are evaluated once per row version.
 *
 * Pure (no React, no Supabase) so it can be unit tested.
 */

export interface DecoratedLink {
  id: string;
  label: string;
}

export interface FormulaColumn<Ast = unknown> {
  /** Column the formula result is written to. */
  col: string;
  /** Parsed formula, or null when it failed to parse (the cell shows #ERROR). */
  ast: Ast | null;
}

export interface LinkColumn {
  fieldId: string;
  /** Column the linked ids are written to (so formulas can read them). */
  column: string;
}

export interface DecorateContext<Ast = unknown> {
  formulas: ReadonlyArray<FormulaColumn<Ast>>;
  /** Field name -> column, as the formula engine wants it. */
  fieldMap: Record<string, string>;
  /** Link columns whose data has loaded and should replace the stored ids. Empty when there are no formulas. */
  linkColumns: ReadonlyArray<LinkColumn>;
  getLinkItems: (fieldId: string, recordId: string) => DecoratedLink[] | undefined;
  /** id -> readable name. Empty or undefined when there is none. */
  lookup: Readonly<Record<string, string>> | undefined;
  evaluate: (ast: Ast, record: Record<string, any>, fieldMap: Record<string, string>) => unknown;
  /**
   * Things the formulas and columns above were built from (compared one by
   * one with ===). When any of them changes, every row is rebuilt.
   */
  structure: readonly unknown[];
}

type Row = Record<string, any> & { id: string };

interface Entry {
  raw: Row;
  items: Array<DecoratedLink[] | undefined>;
  sub: Record<string, string>;
  out: Row;
}

const EMPTY_SUB: Record<string, string> = Object.freeze({}) as Record<string, string>;

function hasKeys(obj: object | undefined): boolean {
  if (!obj) return false;
  for (const _ in obj) return true;
  return false;
}

/**
 * The entries of `lookup` this row can actually use: for every text value and
 * every text/number inside a list value (those are the ids a link column holds),
 * the name for it if there is one. `skip` holds columns that are replaced by
 * freshly loaded link ids, and `extraIds` those ids.
 */
export function pickLookupSubset(
  record: Record<string, any>,
  lookup: Readonly<Record<string, string>>,
  skip: ReadonlySet<string>,
  extraIds: readonly string[],
): Record<string, string> {
  let sub: Record<string, string> | null = null;
  const take = (key: string) => {
    if (key in lookup) {
      if (!sub) sub = {};
      sub[key] = lookup[key];
    }
  };
  for (const key in record) {
    if (key === '__linkLookup' || skip.has(key)) continue;
    const v = record[key];
    if (typeof v === 'string') {
      take(v);
    } else if (Array.isArray(v)) {
      for (const e of v) {
        if (typeof e === 'string') take(e);
        else if (typeof e === 'number') take(String(e));
      }
    }
  }
  for (const id of extraIds) take(id);
  return sub ?? EMPTY_SUB;
}

function sameSub(a: Record<string, string>, b: Record<string, string>): boolean {
  if (a === b) return true;
  let count = 0;
  for (const k in a) {
    if (a[k] !== b[k]) return false;
    count++;
  }
  for (const _ in b) count--;
  return count === 0;
}

function sameRefs(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface RecordDecorator {
  decorate<Ast>(raw: readonly Row[], ctx: DecorateContext<Ast>): Row[];
  /** Rows remembered right now (for tests). */
  size(): number;
}

export function createRecordDecorator(): RecordDecorator {
  let cache = new Map<string, Entry>();
  let lastStructure: readonly unknown[] | null = null;

  return {
    size: () => cache.size,
    decorate<Ast>(raw: readonly Row[], ctx: DecorateContext<Ast>): Row[] {
      const lookupActive = hasKeys(ctx.lookup);
      if (ctx.formulas.length === 0 && ctx.linkColumns.length === 0 && !lookupActive) {
        // Nothing to add: the rows go through untouched.
        cache = new Map();
        lastStructure = null;
        return raw as Row[];
      }

      if (!lastStructure || !sameRefs(lastStructure, ctx.structure)) {
        cache = new Map();
        lastStructure = ctx.structure;
      }

      const skip = new Set(ctx.linkColumns.map((c) => c.column));
      const next = new Map<string, Entry>();
      const out: Row[] = new Array(raw.length);

      for (let i = 0; i < raw.length; i++) {
        const record = raw[i];
        const items = ctx.linkColumns.map((c) => ctx.getLinkItems(c.fieldId, record.id));
        let sub = EMPTY_SUB;
        if (lookupActive) {
          const extra: string[] = [];
          for (const list of items) if (list) for (const item of list) extra.push(item.id);
          sub = pickLookupSubset(record, ctx.lookup as Record<string, string>, skip, extra);
        }

        const prev = cache.get(record.id);
        if (prev && prev.raw === record && sameRefs(prev.items, items) && sameSub(prev.sub, sub)) {
          next.set(record.id, prev);
          out[i] = prev.out;
          continue;
        }

        // Formulas see the whole lookup while they run (a formula can read a value another formula produced);
        // the row keeps only the names it refers to, so its identity does not change when unrelated names arrive.
        const patched: Record<string, any> = { ...record, __linkLookup: ctx.lookup ?? EMPTY_SUB };
        ctx.linkColumns.forEach((c, k) => {
          const list = items[k];
          // The links table is the source of truth, so use it once it has loaded.
          if (list) patched[c.column] = list.map((item) => item.id);
        });
        for (const { col, ast } of ctx.formulas) {
          if (!ast) {
            patched[col] = '#ERROR';
            continue;
          }
          try {
            patched[col] = ctx.evaluate(ast, patched, ctx.fieldMap);
          } catch {
            patched[col] = '#ERROR';
          }
        }
        patched.__linkLookup = prev && sameSub(prev.sub, sub) ? prev.sub : sub;
        const entry: Entry = { raw: record, items, sub: patched.__linkLookup, out: patched as Row };
        next.set(record.id, entry);
        out[i] = entry.out;
      }

      cache = next;
      return out;
    },
  };
}
