// Tiny per-browser stores (localStorage) shared by every screen through useSyncExternalStore, so a snooze or a dismissal made in the Command Center
// shows at once in Crew HQ. It is a convenience of this browser, never shared state: if storage is blocked it simply resets.
import { useCallback, useSyncExternalStore } from 'react';

function makeStore<T>(key: string, parse: (raw: unknown) => T, empty: T, serialise: (v: T) => unknown) {
  let value: T = empty;
  let loaded = false;
  const subs = new Set<() => void>();
  const read = (): T => {
    try { const raw = localStorage.getItem(key); return raw ? parse(JSON.parse(raw)) : empty; } catch { return empty; }
  };
  const load = () => { if (!loaded) { value = read(); loaded = true; if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === key) { value = read(); subs.forEach((f) => f()); } }); } };
  return {
    get: (): T => { load(); return value; },
    set: (next: T) => {
      load(); value = next;
      try { localStorage.setItem(key, JSON.stringify(serialise(next))); } catch { /* private window: it resets next time */ }
      subs.forEach((f) => f());
    },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    reset: () => { loaded = false; value = empty; subs.forEach((f) => f()); },
  };
}

/** "Not needed" questions of this browser. */
export const dismissedStore = makeStore<ReadonlySet<string>>('crew-dismissed-questions', (raw) => new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(-500) : []), new Set(), (s) => [...s].slice(-500));

/** Snoozed cards: id -> the time it comes back. Same key as the old mailbox, so earlier snoozes still count. */
export const snoozeStore = makeStore<Record<string, number>>('crew-snooze', (raw) => (raw && typeof raw === 'object' ? (raw as Record<string, number>) : {}), {}, (m) => m);

export function useDismissed() {
  const set = useSyncExternalStore(dismissedStore.subscribe, dismissedStore.get, dismissedStore.get);
  const dismiss = useCallback((id: string) => dismissedStore.set(new Set([...dismissedStore.get(), id])), []);
  const restore = useCallback((id: string) => { const n = new Set(dismissedStore.get()); n.delete(id); dismissedStore.set(n); }, []);
  return { dismissed: set, dismiss, restore };
}

export function useSnoozed() {
  const map = useSyncExternalStore(snoozeStore.subscribe, snoozeStore.get, snoozeStore.get);
  const snooze = useCallback((id: string, until: number) => snoozeStore.set({ ...snoozeStore.get(), [id]: until }), []);
  const wake = useCallback((id: string) => { const m = { ...snoozeStore.get() }; delete m[id]; snoozeStore.set(m); }, []);
  return { snoozed: map, snooze, wake };
}
