import { useCallback, useEffect, useState } from 'react';

/**
 * System notifications for the office: when someone rings, waves, messages you or knocks while this window is not in front,
 * the computer shows a pop-up (and the title shows how many you missed). Works in the browser and in the desktop app,
 * which allows notifications by itself. Nothing is sent anywhere: it is the browser's own notification.
 */
const KEY = 'kd:office:notify';
const BASE_TITLE = 'Virtual Office';

export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function isDesktopApp(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('KDOfficeDesktop');
}

/** Has the person turned notifications on (the desktop app starts with them on)? */
export function notifyWanted(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? isDesktopApp() : v === '1';
  } catch {
    return false;
  }
}

let missed = 0;
let titleBase = '';

function paintTitle() {
  if (typeof document === 'undefined') return;
  if (!titleBase) titleBase = document.title || BASE_TITLE;
  document.title = missed > 0 ? `(${missed}) ${titleBase}` : titleBase;
}

/** Show a pop-up for something that needs attention, if the window is not in front. */
export function notifyPing(title: string, body: string, onClick?: () => void, tag?: string): void {
  if (typeof document === 'undefined') return;
  const away = document.hidden || !document.hasFocus();
  if (!away) return;
  missed += 1;
  paintTitle();
  if (!notifySupported() || !notifyWanted() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', silent: false });
    n.onclick = () => {
      window.focus();
      n.close();
      onClick?.();
    };
  } catch {
    /* some browsers only allow notifications from a service worker; the title count still works */
  }
}

/** Clears the missed count when you come back. Mount once on the office page. */
export function useMissedReset() {
  useEffect(() => {
    titleBase = document.title || BASE_TITLE;
    const clear = () => { if (!document.hidden && document.hasFocus()) { missed = 0; paintTitle(); } };
    window.addEventListener('focus', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('focus', clear);
      document.removeEventListener('visibilitychange', clear);
      missed = 0;
      paintTitle();
    };
  }, []);
}

/** The on/off switch for notifications. Turning it on asks the browser for permission. */
export function useNotifySetting() {
  const [on, setOn] = useState(() => notifyWanted() && notifySupported() && Notification.permission === 'granted');
  const [denied, setDenied] = useState(() => notifySupported() && Notification.permission === 'denied');
  const toggle = useCallback(async () => {
    if (on) {
      setOn(false);
      try { localStorage.setItem(KEY, '0'); } catch { /* fine */ }
      return;
    }
    if (!notifySupported()) return;
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setOn(true);
      setDenied(false);
      try { localStorage.setItem(KEY, '1'); } catch { /* fine */ }
      try { new Notification('Notifications are on', { body: 'You will see rings, waves and messages here, even when this window is behind others.', icon: '/icon-192.png' }); } catch { /* fine */ }
    } else {
      setDenied(true);
    }
  }, [on]);
  return { on, denied, toggle, supported: notifySupported() };
}
