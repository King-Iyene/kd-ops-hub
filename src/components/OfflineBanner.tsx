import { useEffect, useState } from 'react';
import { WifiOff, CloudOff } from 'lucide-react';
import { pendingCount as getPendingCount } from '@/lib/offline-queue';

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline  = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  useEffect(() => {
    if (!offline) return;
    getPendingCount().then(setPending).catch(() => {});
    const interval = setInterval(() => {
      getPendingCount().then(setPending).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [offline]);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      You're offline — changes will queue locally and sync when you reconnect.
      {pending > 0 && (
        <span className="inline-flex items-center gap-1 ml-1">
          <CloudOff className="h-3.5 w-3.5" />
          {pending} pending
        </span>
      )}
    </div>
  );
}
