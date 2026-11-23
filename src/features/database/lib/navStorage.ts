/**
 * Per-user navigation preferences kept in localStorage: pinned tables, the
 * "show hidden tables" toggle, tables hidden by hand, recent tables and the
 * palette's recent items.
 *
 * Every read and write is wrapped because localStorage can be missing or full
 * (private windows, blocked site data). When it fails the value is kept in
 * memory for the page's lifetime so the toggles still work.
 */

export const NAV_KEYS = {
  showHidden: 'kd-ops:db-show-hidden-tables',
  recents: 'kd-ops:db-recents',
  pinned: (baseId: string) => `kd-ops:db-pinned-tables:${baseId}`,
  // Same key the tab strip has always used for "Hide table", so existing choices survive.
  manualHidden: (baseId: string) => `kd-ops:hidden-tables:${baseId}`,
  recentTables: (baseId: string) => `kd-ops:db-recent-tables:${baseId}`,
} as const;

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
  listeners.forEach((l) => l());
}

/** For useSyncExternalStore: called when any stored value changes here or in another tab. */
export function subscribeStored(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith('kd-ops:')) callback();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** A stored JSON array of strings; anything else reads as an empty list. */
export function parseIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

export function parseFlag(raw: string | null | undefined): boolean {
  return raw === '1' || raw === 'true';
}

/** Add the id if missing, remove it if present. */
export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Pinned tables first (in pin order), then the rest in their given order. */
export function pinnedFirst<T extends { id: string }>(tables: readonly T[], pinnedIds: readonly string[]): { pinned: T[]; rest: T[] } {
  const byId = new Map(tables.map((t) => [t.id, t] as const));
  const pinned: T[] = [];
  for (const id of pinnedIds) {
    const t = byId.get(id);
    if (t) pinned.push(t);
  }
  const pinnedSet = new Set(pinned.map((t) => t.id));
  return { pinned, rest: tables.filter((t) => !pinnedSet.has(t.id)) };
}
