/**
 * Which tables are shown by default, and which fit in the tab strip.
 *
 * Some bases (KDS Finances has 43 tables) carry old copies, outdated and
 * work-in-progress tables. They stay reachable but are tucked away behind a
 * per-user "Show hidden tables" toggle. The open table is always shown.
 */

/** Names that mark a table as clutter: copies, outdated, WIP, grid views. */
export const HIDDEN_TABLE_PATTERN = /copy|outdated|\bwip\b|grid view/i;

export function isHiddenByRule(name: string | null | undefined): boolean {
  return !!name && HIDDEN_TABLE_PATTERN.test(name);
}

interface NamedTable {
  id: string;
  name: string;
}

export interface VisibilityOptions {
  showHidden: boolean;
  activeTableId?: string | null;
  /** Tables the user hid by hand from the tab menu. */
  manualHidden?: ReadonlySet<string>;
}

export function isTableHidden(table: NamedTable, manualHidden?: ReadonlySet<string>): boolean {
  return isHiddenByRule(table.name) || !!manualHidden?.has(table.id);
}

/** The tables to list: everything except hidden ones, unless asked to show them. The open table always stays. */
export function filterVisibleTables<T extends NamedTable>(tables: readonly T[], opts: VisibilityOptions): T[] {
  if (opts.showHidden) return [...tables];
  return tables.filter((t) => t.id === opts.activeTableId || !isTableHidden(t, opts.manualHidden));
}

/** How many tables the toggle would reveal (the open table is never counted, it is always visible). */
export function countHiddenTables<T extends NamedTable>(
  tables: readonly T[],
  opts: Pick<VisibilityOptions, 'activeTableId' | 'manualHidden'>,
): number {
  return tables.filter((t) => t.id !== opts.activeTableId && isTableHidden(t, opts.manualHidden)).length;
}

export interface TabPickOptions {
  activeId: string | null | undefined;
  /** Most recently used first. */
  recentIds: readonly string[];
  /** How many tabs fit. At least one is always allowed. */
  max: number;
}

/**
 * Choose which tables get a tab: the open one first, then the most recently
 * used, until `max` is reached. The result keeps the tables' own order so tabs
 * do not jump around while you move between them.
 */
export function pickTabTables<T extends { id: string }>(tables: readonly T[], opts: TabPickOptions): T[] {
  const max = Math.max(1, Math.floor(opts.max));
  const present = new Set(tables.map((t) => t.id));
  const chosen = new Set<string>();

  if (opts.activeId && present.has(opts.activeId)) chosen.add(opts.activeId);
  for (const id of opts.recentIds) {
    if (chosen.size >= max) break;
    if (present.has(id)) chosen.add(id);
  }
  // Nothing open and nothing recent: fall back to the first tables so the strip is never empty.
  if (chosen.size === 0 && tables.length > 0) chosen.add(tables[0].id);
  return tables.filter((t) => chosen.has(t.id));
}
