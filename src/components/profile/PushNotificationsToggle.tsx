/**
 * Profile → Push Notifications toggle.
 *
 * Lets the operator turn browser push on/off from their own profile,
 * without going through the dashboard banner. Mirrors the iOS/Android
 * settings pattern — one switch, status text, no surprises.
 *
 * Falls back gracefully:
 *   - on browsers that don't support push, says so and disables the switch.
 *   - if the platform doesn't have VAPID keys yet, asks the user to ping
 *     an admin (only admins can generate keys via Settings → Integrations).
 *   - if the user previously denied permission at the OS level, we can't
 *     re-prompt — link them to their browser's site settings.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function PushNotificationsToggle() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const { status, supported, error, subscribe, unsubscribe } = usePushNotifications(profile?.id);

  const isBusy = status === 'loading';
  const isOn = status === 'subscribed';

  const handleToggle = async (next: boolean) => {
    if (next) {
      await subscribe();
      if (error) {
        toast({ title: 'Could not enable', description: error, variant: 'destructive' });
      } else {
        toast({ title: 'Notifications enabled' });
      }
    } else {
      await unsubscribe();
      toast({ title: 'Notifications disabled' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {isOn ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
          Push Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {!supported
                ? 'Not available on this browser'
                : status === 'denied'
                  ? 'Blocked at the browser level'
                  : isOn
                    ? 'You will be notified on this device'
                    : 'Get alerts even when KD Ops is closed'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {!supported
                ? 'Try Chrome, Edge, Safari (iOS 16.4+), or Firefox.'
                : status === 'denied'
                  ? 'Open your browser site settings for ops.kdsquares.com and change Notifications to Allow, then reload.'
                  : isOn
                    ? 'Approvals, transfers, anomalies, and schedule reminders.'
                    : 'Approvals, transfers, anomalies, and schedule reminders.'}
            </p>
          </div>
          <div className="shrink-0 pt-0.5">
            {isBusy ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={isOn}
                disabled={!supported || status === 'denied'}
                onCheckedChange={handleToggle}
                aria-label="Toggle push notifications"
              />
            )}
          </div>
        </div>

        {isOn && (
          <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
            This switch only controls THIS device. Sign in on another device to subscribe it separately.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
