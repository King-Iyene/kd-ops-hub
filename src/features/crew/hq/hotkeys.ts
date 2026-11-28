import { useEffect, useRef } from 'react';

export type KeyMap = Record<string, (e: KeyboardEvent) => void>;

function typing(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

/**
 * Single-key shortcuts for the screen that is showing. They are listened to first (capture phase) so the app's own global shortcuts (`?` for its
 * overlay, `g` chords) do not also fire, and they step aside when the owner is typing, holds Ctrl/Alt/Cmd, or a dialog is open.
 * Keys are compared lower-case; "?" is matched as typed.
 */
export function useHotkeys(map: KeyMap, enabled = true) {
  const ref = useRef(map);
  useEffect(() => { ref.current = map; });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (typing(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"], [role="alertdialog"]')) return;
      const handler = ref.current[e.key === '?' ? '?' : e.key.toLowerCase()];
      if (!handler) return;
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}
