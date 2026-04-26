import { useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/lib/format';
import { ScrollArea } from '@/components/ui/scroll-area';

export function NotificationBell() {
  const profile = useAuthStore((s) => s.profile);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
    subscribeRealtime,
    unsubscribeRealtime,
  } = useNotificationStore();

  // Fetch on mount + subscribe to Realtime for live updates.
  useEffect(() => {
    if (!profile?.id) return;
    fetchNotifications(profile.id);
    subscribeRealtime(profile.id);
    return () => unsubscribeRealtime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={`h-5 w-5 ${unreadCount > 0 ? 'text-primary' : ''}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground kd-status-live-danger">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 kd-toolbar-glass">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <h3 className="kd-display font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-auto p-1" onClick={markAllAsRead}>
              <Check className="h-3 w-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="py-8 px-4 flex flex-col items-center text-center gap-2">
              <div className="relative">
                <span className="absolute inset-0 rounded-full bg-[hsl(var(--tod-glow))] opacity-15 blur-xl" />
                <Bell className="relative h-8 w-8 text-muted-foreground/60 kd-animate-float" />
              </div>
              <p className="text-sm text-muted-foreground">All quiet for now</p>
            </div>
          ) : (
            notifications.slice(0, 20).map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 kd-transition ${!n.read ? 'bg-accent/5' : ''}`}
                onClick={() => !n.read && markAsRead(n.id)}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{formatDateTime(n.created_at)}</p>
              </div>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
