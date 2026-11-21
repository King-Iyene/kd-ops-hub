import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logWarn } from '@/lib/logger';
import { inDesktopApp, installDesktopUpdate, onDesktopUpdate } from '@/features/office/desktopApp';

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

  // The desktop app itself (not just the pages it shows) has a newer version downloaded and waiting
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  useEffect(() => onDesktopUpdate(setAppVersion), []);

  const kind: 'app' | 'site' | null = appVersion ? 'app' : needRefresh ? 'site' : null;
  if (!kind || hiddenFor === kind + (appVersion ?? '')) return null;

  const onUpdate = () => {
    setWorking(true);
    if (kind === 'app') installDesktopUpdate();
    else void reloadToUpdate(updateServiceWorker);
    // if nothing happened after a while (a blocked update), let the person try again
    window.setTimeout(() => setWorking(false), 15000);
  };
  const later = () => { if (kind === 'site') setNeedRefresh(false); else setHiddenFor(kind + (appVersion ?? '')); };

  return (
    <div className="fixed inset-x-0 top-2 z-[100] flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        title={kind === 'app' ? 'Restart to install it. It only takes a few seconds.' : 'Update to get the newest features and fixes.'}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-primary/30 bg-card/95 py-1 pl-1.5 pr-1 text-xs shadow-[0_6px_20px_-8px_hsl(var(--primary)/0.5)] backdrop-blur animate-in fade-in slide-in-from-top-2 duration-300"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
          {working ? <RefreshCw className="h-3 w-3 animate-spin" /> : kind === 'app' ? <Download className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
        </span>
        <span className="font-medium leading-none">
          {working ? 'Updating…' : kind === 'app' ? `KD Ops ${appVersion} is ready` : 'New version ready'}
        </span>
        <Button size="sm" className="h-6 rounded-full px-3 text-xs" disabled={working} onClick={onUpdate}>
          {kind === 'app' ? 'Restart' : 'Update'}
        </Button>
        <button
          type="button"
          aria-label="Not now"
          title="Not now"
          className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={later}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
