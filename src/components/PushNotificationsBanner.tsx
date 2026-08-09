/**
 * PushNotificationsBanner
 *
 * Inline pill that asks the operator to turn on browser push once. Shows
 * only when the device supports push, the user hasn't subscribed yet, and
 * permission is not 'denied'. Once enabled or dismissed, the banner stays
 * out of the way until the next session.
 *
 * On iOS Safari (not installed as PWA), push is unavailable — the banner
 * guides the user to "Add to Home Screen" first.
 */
import { useEffect, useState } from 'react';
import { Bell, X, Share, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/use-toast';

const DISMISSED_KEY = 'kdops_push_banner_dismissed';

function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    ('standalone' in navigator && (navigator as any).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export function PushNotificationsBanner() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const { status, supported, error, subscribe } = usePushNotifications(profile?.id);
  const [dismissed, setDismissed] = useState(true);

  const iosNeedsPwa = isIOSSafari() && !isStandalone();

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISSED_KEY) === '1');
  }, []);

  if (dismissed) return null;
  if (!iosNeedsPwa && (!supported || status === 'subscribed' || status === 'denied' || status === 'loading')) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-3 sm:p-4 flex items-start gap-3">
      <div className="relative shrink-0 mt-0.5">
        <span className="absolute inset-0 rounded-xl bg-primary/40 blur-md kd-icon-glow" />
        <div className="relative h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center">
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {iosNeedsPwa ? (
          <>
            <p className="text-sm font-semibold">Install KD Ops for notifications</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Push notifications on iPhone/iPad require adding the app to your Home Screen:
            </p>
            <ol className="text-xs text-muted-foreground mt-1.5 space-y-1 list-none">
              <li className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-muted text-[10px] font-bold shrink-0">1</span>
                Tap <Share className="inline h-3.5 w-3.5 text-primary mx-0.5" /> Share in Safari
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-muted text-[10px] font-bold shrink-0">2</span>
                Tap <Plus className="inline h-3.5 w-3.5 text-primary mx-0.5" /> Add to Home Screen
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-muted text-[10px] font-bold shrink-0">3</span>
                Open from your Home Screen, then enable notifications
              </li>
            </ol>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">Get notified the moment things happen</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enable notifications for approvals, transfers, and anomalies — even when KD Ops is closed.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={async () => {
                  await subscribe();
                  if (error) toast({ title: 'Could not enable', description: error, variant: 'destructive' });
                  else toast({ title: 'Notifications enabled' });
                }}
              >
                Turn on
              </Button>
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center shrink-0"
        onClick={() => {
          sessionStorage.setItem(DISMISSED_KEY, '1');
          setDismissed(true);
        }}
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
