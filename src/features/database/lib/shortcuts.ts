/** Keyboard shortcut helpers for the navigation pickers. Pure so they can be tested. */

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** True for Ctrl+<key> or Cmd+<key>, without Alt (and without Shift unless asked for). */
export function isModShortcut(e: KeyEventLike, key: string, opts: { shift?: boolean } = {}): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  if (!!e.shiftKey !== !!opts.shift) return false;
  return e.key.toLowerCase() === key.toLowerCase();
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');
}

/** "⌘" on Apple devices, "Ctrl" elsewhere. */
export function modKeyLabel(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl';
}
