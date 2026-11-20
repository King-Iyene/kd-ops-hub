/**
 * "The Office is open": the Office page writes a heartbeat to this browser's storage while it is open (in a browser tab or in the
 * KD Ops desktop app). The idle sign-out reads it, so a person who has the Office open is never signed out for being idle, and
 * the KD Ops pages do not sign the Office out from under them (the sign-in is shared by every page of the app).
 */
const KEY = 'kd:office-alive';
/** The heartbeat is written every 15 seconds, so it counts as open for a little more than twice that. */
export const OFFICE_ALIVE_MS = 40_000;

export function markOfficeAlive(now = Date.now()): void {
  try { localStorage.setItem(KEY, String(now)); } catch { /* storage blocked: the idle sign-out just works as before */ }
}

export function officeIsOpen(now = Date.now()): boolean {
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
