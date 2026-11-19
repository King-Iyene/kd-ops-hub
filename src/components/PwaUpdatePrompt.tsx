import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logWarn } from '@/lib/logger';
import { inDesktopApp } from '@/features/office/desktopApp';

/** Update for sure: ask the waiting worker to take over, and if the page has not reloaded within a moment, drop the worker and the caches and reload by force. */
export async function reloadToUpdate(updateServiceWorker: (reload?: boolean) => Promise<void>): Promise<void> {
  const hard = async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* reload anyway */ }
    window.location.reload();
  };
  window.setTimeout(() => { void hard(); }, 1500);
  try { await updateServiceWorker(true); } catch { void hard(); }
}

// Registers the service worker and surfaces it when a new version is
// waiting — registerType "prompt" (vite.config.ts) means the SW does NOT
// swap itself in silently, so without this component a deployed change
// could sit installed-but-inactive in a background tab indefinitely with
// no visible signal to the person looking at the (now stale) old bundle.
//
// Also forces a manual update check on every tab focus: browsers only
// re-fetch sw.js passively at most once per ~24h, which is far too slow
// for "I just deployed, why do I still see the old app" — polling
// registration.update() on focus catches it within one tab-switch instead.
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => { registration.update().catch(() => {}); };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
    },
    onRegisterError(error) {
      logWarn('PWA', 'Service worker registration failed', error);
    },
  });

  // Belt-and-suspenders: also check right after mount, in case the tab
  // was already open (and thus already "focused") when a new version shipped.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then((r) => r?.update().catch(() => {}));
  }, []);

  // The desktop app lives in the tray, so a new version is picked up quietly the moment the window is put away (at most once every few minutes).
  useEffect(() => {
    if (!needRefresh || !inDesktopApp()) return;
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      try {
        const last = Number(sessionStorage.getItem('kd:auto-update') ?? 0);
        if (Date.now() - last < 5 * 60 * 1000) return;
        sessionStorage.setItem('kd:auto-update', String(Date.now()));
      } catch { /* go ahead */ }
      void reloadToUpdate(updateServiceWorker);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [needRefresh, updateServiceWorker]);

  // A new version never reloads the page by itself (that caused reload loops while deploys were landing back to back):
  // it only shows the prompt below, and the person chooses when to reload.

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 top-16 z-[100] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
        <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-medium leading-tight">A new version of KD Ops is available.</p>
          <p className="text-xs text-muted-foreground mt-0.5">Reload to pick up the latest changes.</p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => { void reloadToUpdate(updateServiceWorker); }}>
          Reload
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setNeedRefresh(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
