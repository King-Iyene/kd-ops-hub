/**
 * Where somebody was going when they had to sign in first, so after signing in they land there and not always on the
 * dashboard. (The desktop app opens the office, so the office is where it should return to.)
 */
const KEY = 'kd:return-to';
const MAX_AGE_MS = 15 * 60 * 1000;

/** Only a path inside this app counts: it starts with one slash, and is not the login page itself. */
export function safeReturnPath(p: unknown): string | null {
  if (typeof p !== 'string' || p.length > 300) return null;
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('\\')) return null;
  if (p === '/' || p.startsWith('/login') || p.startsWith('/register') || p.startsWith('/unauthorized')) return null;
  return p;
}

export function rememberReturnTo(path: string): void {
  const safe = safeReturnPath(path);
  if (!safe) return;
  try { localStorage.setItem(KEY, JSON.stringify({ p: safe, at: Date.now() })); } catch { /* fine: it just goes to the dashboard */ }
}

/** The remembered path (used once), or null. */
export function takeReturnTo(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const v = JSON.parse(raw) as { p?: unknown; at?: unknown };
    if (typeof v.at !== 'number' || now - v.at > MAX_AGE_MS) return null;
    return safeReturnPath(v.p);
  } catch { return null; }
}

const isOfficePath = (p: string) => p === '/office' || p.startsWith('/office/');

/**
 * Where to go after signing in: where you were headed, the office when this is the old Office-only desktop app, otherwise the dashboard.
 * The KD Ops desktop app has two tabs: its Office tab always returns to the office, and its KD Ops tab never lands on the office
 * (that page belongs to the other tab), it goes where you were headed or to the dashboard.
 */
export function afterSignIn(inDesktop: boolean, tab: 'ops' | 'office' | null = null): string {
  if (tab === 'office') return '/office';
  const remembered = takeReturnTo();
  if (tab === 'ops') return remembered && !isOfficePath(remembered) ? remembered : '/dashboard';
  return remembered ?? (inDesktop ? '/office' : '/dashboard');
}
