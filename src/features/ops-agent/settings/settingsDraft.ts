import { useCallback, useState } from 'react';
import type { AgentSettings } from '../agentDb';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Applies one edit to a draft. The draft only ever holds fields that differ from the saved settings, so what is sent
 * on Save is exactly what changed, and putting a value back removes it from the draft. A save of nothing is impossible.
 */
export function applyDraftEdit<T extends object, K extends keyof T>(draft: Partial<T>, saved: T, key: K, value: T[K]): Partial<T> {
  const next = { ...draft };
  if (same(value, saved[key])) delete next[key];
  else next[key] = value;
  return next;
}

/** Local edits for a group of settings fields. Nothing is written until the person presses Save. */
export function useSettingsDraft<K extends keyof AgentSettings>(saved: AgentSettings | undefined) {
  const [draft, setDraft] = useState<Partial<AgentSettings>>({});
  const value = useCallback(
    <F extends K>(key: F): AgentSettings[F] => (key in draft ? draft[key] : saved?.[key]) as AgentSettings[F],
    [draft, saved],
  );
  const set = useCallback(
    <F extends K>(key: F, v: AgentSettings[F]) => { if (saved) setDraft((d) => applyDraftEdit(d, saved, key, v)); },
    [saved],
  );
  const reset = useCallback(() => setDraft({}), []);
  return { value, set, reset, patch: draft, dirty: Object.keys(draft).length > 0 };
}
