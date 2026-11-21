/**
 * "The Office is open": the Office page writes a heartbeat to this browser's storage while it is open (in a browser tab or in
 * the KD Ops desktop app). The idle sign-out reads it, so a person who has the Office open is never signed out for being idle, and
 * the KD Ops pages do not sign the Office out from under them (the sign-in is shared by every page of the app).
 *
 * The Office only signs you out once a month (see monthlyLimitReached); the KD Ops pages sign you out after an hour of no activity.
 */
const KEY = 'kd:office-alive';
/**
 * The heartbeat is written every 15 seconds, but a browser slows the timers of a tab you are not looking at to one a minute,
 * so it counts as open for a good while longer than that (a hidden Office tab must not be mistaken for a closed one).
 */
export const OFFICE_ALIVE_MS = 3 * 60_000;
/** How long after the computer wakes up from sleep we wait before deciding anybody is idle, so the Office can write its heartbeat first. */
export const WAKE_GRACE_MS = 60_000;
/** The Office keeps you signed in for this long; after that you sign in again once. */
export const OFFICE_SESSION_MS = 30 * 24 * 60 * 60_000;

/** True while an Office page is mounted in THIS window (more reliable than the heartbeat, which a sleeping computer lets go stale). */
let officeHere = 0;
export function setOfficeHere(open: boolean): void { officeHere = Math.max(0, officeHere + (open ? 1 : -1)); }

export function markOfficeAlive(now = Date.now()): void {
  try { localStorage.setItem(KEY, String(now)); } catch { /* storage blocked: the idle sign-out just works as before */ }
}

export function officeIsOpen(now = Date.now()): boolean {
  if (officeHere > 0) return true;
  try {
    const t = Number(localStorage.getItem(KEY));
    return Number.isFinite(t) && t > 0 && now - t >= 0 && now - t < OFFICE_ALIVE_MS;
  } catch { return false; }
}

/** What the idle checker should do right now. The Office being open always wins: nothing happens, the idle clock restarts. */
export function idleAction(idleMs: number, limitMs: number, warnBeforeMs: number, warned: boolean, officeOpen: boolean): 'none' | 'warn' | 'signout' | 'restart' {
  if (officeOpen) return 'restart';
  if (idleMs >= limitMs) return 'signout';
  if (!warned && idleMs >= limitMs - warnBeforeMs) return 'warn';
  return 'none';
}

/** True when the computer has just woken up: the checker's timer did not run for much longer than it should have. */
export function justWoke(sinceLastTickMs: number, tickMs: number): boolean {
  return sinceLastTickMs > Math.max(30_000, tickMs * 3);
}

/** True once it is a month since this person last typed their password (an unknown date never signs anybody out). */
export function monthlyLimitReached(lastSignInAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSignInAt) return false;
  const t = Date.parse(lastSignInAt);
  return Number.isFinite(t) && now - t >= OFFICE_SESSION_MS;
}
