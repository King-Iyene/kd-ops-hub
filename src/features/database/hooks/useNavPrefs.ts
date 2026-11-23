import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  NAV_KEYS,
  parseFlag,
  parseIdList,
  readStored,
  subscribeStored,
  toggleId,
  writeStored,
} from '../lib/navStorage';
import { addRecent, parseRecents, recentsEqual, serializeRecents, type RecentItem } from '../lib/recents';

/** One stored string, kept in sync across every component and browser tab. */
function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribeStored,
    () => readStored(key),
    () => null,
  );
}

/** The per-user "Show hidden tables" toggle, shared by the sidebar, tab strip and palette. */
export function useShowHiddenTables(): [boolean, (value: boolean) => void] {
  const raw = useStored(NAV_KEYS.showHidden);
  const set = useCallback((value: boolean) => writeStored(NAV_KEYS.showHidden, value ? '1' : '0'), []);
  return [parseFlag(raw), set];
}

/** Tables the user starred in one base. Saved only when the user clicks a star. */
export function usePinnedTables(baseId: string | null | undefined): { pinnedIds: string[]; togglePin: (tableId: string) => void } {
  const key = NAV_KEYS.pinned(baseId ?? '');
  const raw = useStored(key);
  const pinnedIds = useMemo(() => parseIdList(raw), [raw]);
  const togglePin = useCallback(
    (tableId: string) => {
      if (!baseId) return;
      writeStored(key, JSON.stringify(toggleId(parseIdList(readStored(key)), tableId)));
    },
    [baseId, key],
  );
  return { pinnedIds, togglePin };
}

/** Tables the user hid by hand from the tab menu. */
export function useManualHiddenTables(baseId: string | null | undefined): { hiddenIds: Set<string>; toggleHidden: (tableId: string) => void } {
  const key = NAV_KEYS.manualHidden(baseId ?? '');
  const raw = useStored(key);
  const hiddenIds = useMemo(() => new Set(parseIdList(raw)), [raw]);
  const toggleHidden = useCallback(
    (tableId: string) => {
      if (!baseId) return;
      writeStored(key, JSON.stringify(toggleId(parseIdList(readStored(key)), tableId)));
    },
    [baseId, key],
  );
  return { hiddenIds, toggleHidden };
}

/** The tables opened most recently in a base, newest first. Feeds the tab strip. */
export function useRecentTableIds(baseId: string | null | undefined): string[] {
  const raw = useStored(NAV_KEYS.recentTables(baseId ?? ''));
  return useMemo(() => parseIdList(raw), [raw]);
}

/** The palette's "recently visited" list (bases, tables and views, newest first). */
export function useRecentItems(): RecentItem[] {
  const raw = useStored(NAV_KEYS.recents);
  return useMemo(() => parseRecents(raw), [raw]);
}

/** Record a visit. Writes only when the list actually changes. */
export function recordRecentItem(item: RecentItem): void {
  const current = parseRecents(readStored(NAV_KEYS.recents));
  const next = addRecent(current, item);
  if (recentsEqual(current, next)) return;
  writeStored(NAV_KEYS.recents, serializeRecents(next));
}
