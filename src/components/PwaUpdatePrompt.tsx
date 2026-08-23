import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      console.error('Service worker registration failed', error);
    },
  });

  // Belt-and-suspenders: also check right after mount, in case the tab
  // was already open (and thus already "focused") when a new version shipped.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then((r) => r?.update().catch(() => {}));
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-4 pb-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
        <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-medium leading-tight">A new version of KD Ops is available.</p>
          <p className="text-xs text-muted-foreground mt-0.5">Reload to pick up the latest changes.</p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => updateServiceWorker(true)}>
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
