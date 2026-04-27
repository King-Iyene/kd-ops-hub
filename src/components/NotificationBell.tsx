import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/lib/format';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * Maps a notification.module value to the route the user should land on.
 * Falls back to the dashboard if the module is unknown.
 */
const moduleToRoute = (module: string | null | undefined): string => {
  switch (module) {
    case 'leave':       return '/leave';
    case 'expenses':    return '/expenses';
    case 'fuel':
    case 'fleet':       return '/fleet';
    case 'payments':    return '/payments';
    case 'payroll':     return '/payroll';
    case 'budgets':     return '/budgets';
    case 'tasks':       return '/tasks';
    case 'subscriptions': return '/subscriptions';
    case 'compliance':  return '/compliance';
    case 'documents':   return '/documents';
    case 'approvals':   return '/approvals';
    default:            return '/dashboard';
  }
};

export function NotificationBell() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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

  const handleClick = (n: any) => {
    if (!n.read) markAsRead(n.id);
    const route = moduleToRoute(n.module);
    navigate(route);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0 kd-toolbar-glass">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <h3 className="kd-display font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-auto p-1" onClick={markAllAsRead}>
              <Check className="h-3 w-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        {/* max-h-[60vh] makes the list scroll on tall lists; on smaller screens
            it stays under the viewport */}
        <ScrollArea className="max-h-[min(24rem,60vh)]">
          {notifications.length === 0 ? (
            <div className="py-8 px-4 flex flex-col items-center text-center gap-2">
              <div className="relative">
                <span className="absolute inset-0 rounded-full bg-[hsl(var(--tod-glow))] opacity-15 blur-xl" />
                <Bell className="relative h-8 w-8 text-muted-foreground/60 kd-animate-float" />
              </div>
              <p className="text-sm text-muted-foreground">All quiet for now</p>
            </div>
          ) : (
            notifications.slice(0, 50).map((n) => (
              <button
                key={n.id}
                type="button"
                className={`w-full text-left px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 kd-transition ${!n.read ? 'bg-accent/5' : ''}`}
                onClick={() => handleClick(n)}
              >
                <p className="text-sm font-medium leading-tight">{n.title}</p>
                {n.body && (
                  <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                )}
                <p className="text-xs text-muted-foreground/60 mt-1">{formatDateTime(n.created_at)}</p>
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
