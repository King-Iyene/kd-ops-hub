/**
 * PushNotificationsBanner
 *
 * Inline pill that asks the operator to turn on browser push once. Shows
 * only when the device supports push, the user hasn't subscribed yet, and
 * permission is not 'denied'. Once enabled or dismissed, the banner stays
 * out of the way until the next session.
 */
import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/use-toast';

const DISMISSED_KEY = 'kdops_push_banner_dismissed';

export function PushNotificationsBanner() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const { status, supported, error, subscribe } = usePushNotifications(profile?.id);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISSED_KEY) === '1');
  }, []);

  if (!supported || dismissed) return null;
  if (status === 'subscribed' || status === 'denied' || status === 'loading') return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-4 flex items-center gap-3 flex-wrap">
      <div className="relative shrink-0">
        <span className="absolute inset-0 rounded-xl bg-primary/40 blur-md kd-icon-glow" />
        <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center">
          <Bell className="h-5 w-5" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Get notified the moment things happen</p>
        <p className="text-xs text-muted-foreground">
          Enable browser notifications to know about approvals, completed transfers, and anomalies even when KD Ops is closed.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          onClick={async () => {
            await subscribe();
            if (error) toast({ title: 'Could not enable', description: error, variant: 'destructive' });
            else toast({ title: 'Notifications enabled' });
          }}
        >
          Turn on
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"
          onClick={() => {
            sessionStorage.setItem(DISMISSED_KEY, '1');
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
