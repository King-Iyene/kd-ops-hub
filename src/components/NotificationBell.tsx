import { useEffect, useMemo, useState } from 'react';
import {
  Bell, Check, CheckCircle2, AlertTriangle, XCircle, Info,
  CreditCard, Truck, Receipt, Calendar, FileText, Banknote,
  ShieldAlert, Inbox, Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * Maps a notification.module value to the route the user should land on.
 * Falls back to the dashboard if the module is unknown.
 */
const moduleToRoute = (module: string | null | undefined): string => {
  switch (module) {
    case 'leave':         return '/leave';
    case 'expenses':      return '/expenses';
    case 'fuel':
    case 'fleet':         return '/fleet';
    case 'payments':      return '/payments';
    case 'payroll':       return '/payroll';
    case 'budgets':       return '/budgets';
    case 'tasks':         return '/tasks';
    case 'subscriptions': return '/subscriptions';
    case 'compliance':    return '/compliance';
    case 'documents':     return '/documents';
    case 'approvals':     return '/approvals';
    default:              return '/dashboard';
  }
};

// Icon + tone per module + outcome. Three things drive the styling:
//   1. The module (payments, fleet, leave, ...) picks the icon.
//   2. The keywords in the title/type pick the tone (success / warning /
//      error / info) — paints the icon background.
// One small heuristic instead of a full enum so we don't have to
// migrate every notification creator at once.
type Tone = 'success' | 'warning' | 'error' | 'info';

const MODULE_ICON: Record<string, typeof Bell> = {
  leave: Calendar,
  expenses: Receipt,
  fleet: Truck,
  fuel: Truck,
  payments: CreditCard,
  payroll: Banknote,
  budgets: Wallet,
  subscriptions: Calendar,
  compliance: ShieldAlert,
  documents: FileText,
  approvals: Inbox,
};

const TONE_STYLES: Record<Tone, {
  iconBg: string;
  iconFg: string;
  outline: string;
  unreadBar: string;
}> = {
  success: {
    iconBg: 'bg-emerald-500/15 dark:bg-emerald-400/15',
    iconFg: 'text-emerald-600 dark:text-emerald-400',
    outline: 'ring-emerald-500/20',
    unreadBar: 'bg-emerald-500',
  },
  warning: {
    iconBg: 'bg-amber-500/15 dark:bg-amber-400/15',
    iconFg: 'text-amber-600 dark:text-amber-400',
    outline: 'ring-amber-500/20',
    unreadBar: 'bg-amber-500',
  },
  error: {
    iconBg: 'bg-red-500/15 dark:bg-red-400/15',
    iconFg: 'text-red-600 dark:text-red-400',
    outline: 'ring-red-500/20',
    unreadBar: 'bg-red-500',
  },
  info: {
    iconBg: 'bg-primary/10',
    iconFg: 'text-primary',
    outline: 'ring-primary/20',
    unreadBar: 'bg-primary',
  },
};

function toneFor(n: { type: string; title: string; body: string }): Tone {
  const haystack = `${n.type} ${n.title} ${n.body}`.toLowerCase();
  if (/\b(failed|fail|error|rejected|denied|reversed|overdue|critical|breach|anomaly|expired)\b/.test(haystack)) return 'error';
  if (/\b(warning|warn|low|alert|expiring|due|pending|stuck|retry)\b/.test(haystack)) return 'warning';
  if (/\b(succeeded|success|approved|completed|paid|received|processed|delivered)\b/.test(haystack)) return 'success';
  return 'info';
}

function fallbackToneIcon(tone: Tone): typeof Bell {
  switch (tone) {
    case 'success': return CheckCircle2;
    case 'warning': return AlertTriangle;
    case 'error':   return XCircle;
    default:        return Info;
  }
}

function moduleFromType(type: string): string | undefined {
  // notification.type often encodes module + verb, e.g.
  // 'payment.transfer.failed' or 'fleet.fuel_request.approved'.
  // First dot-separated token is the module.
  return type.split(/[._]/)[0];
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins   = Math.round(diffMs / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs    = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  const days   = Math.round(hrs / 24);
  if (days < 7)  return `${days}d`;
  const weeks  = Math.round(days / 7);
  return `${weeks}w`;
}

function bucketFor(iso: string): 'today' | 'yesterday' | 'earlier' {
  const now = new Date();
  const then = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (then.getTime() >= startOfToday) return 'today';
  if (then.getTime() >= startOfToday - 86_400_000) return 'yesterday';
  return 'earlier';
}

const BUCKET_LABEL: Record<'today' | 'yesterday' | 'earlier', string> = {
  today:     'Today',
  yesterday: 'Yesterday',
  earlier:   'Earlier',
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

  useEffect(() => {
    if (!profile?.id) return;
    fetchNotifications(profile.id);
    subscribeRealtime(profile.id);
    return () => unsubscribeRealtime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const handleClick = (n: any) => {
    if (!n.read) markAsRead(n.id);
    const route = moduleToRoute(moduleFromType(n.type) || (n as any).module);
    navigate(route);
    setOpen(false);
  };

  // Group by Today / Yesterday / Earlier so the panel feels like a
  // proper inbox instead of a raw stream. Cap at 50 most-recent — the
  // realtime store keeps more in memory but the dropdown stays tight.
  const groups = useMemo(() => {
    const out = { today: [] as any[], yesterday: [] as any[], earlier: [] as any[] };
    for (const n of notifications.slice(0, 50)) {
      out[bucketFor(n.created_at)].push(n);
    }
    return out;
  }, [notifications]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={cn('h-5 w-5', unreadCount > 0 ? 'text-primary' : '')} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground kd-status-live-danger">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      {/* Solid surface — bg-popover (not glass) so the text reads
          cleanly on every screen / theme. The previous translucent
          glass panel disappeared into busy backgrounds. */}
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-1.5rem))] p-0 bg-popover text-popover-foreground border border-border shadow-2xl rounded-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div>
            <h3 className="text-sm font-semibold leading-none">Notifications</h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              {unreadCount > 0
                ? `${unreadCount} unread${notifications.length > unreadCount ? ` of ${notifications.length}` : ''}`
                : notifications.length > 0
                  ? 'All caught up — older items below'
                  : 'You\'re all caught up'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs gap-1 hover:bg-background"
              onClick={markAllAsRead}
            >
              <Check className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[min(28rem,65vh)]">
          {notifications.length === 0 ? (
            <div className="py-12 px-4 flex flex-col items-center text-center gap-3">
              <div className="relative">
                <span className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
                <Bell className="relative h-10 w-10 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium">All quiet</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  We'll ping you when there's something to look at.
                </p>
              </div>
            </div>
          ) : (
            <>
              {(['today', 'yesterday', 'earlier'] as const).map((bucket) => {
                const items = groups[bucket];
                if (items.length === 0) return null;
                return (
                  <div key={bucket}>
                    <div className="sticky top-0 z-10 bg-popover/95 backdrop-blur-sm px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-border/60">
                      {BUCKET_LABEL[bucket]}
                    </div>
                    {items.map((n: any) => {
                      const tone = toneFor(n);
                      const t = TONE_STYLES[tone];
                      const moduleKey = moduleFromType(n.type) || (n as any).module || '';
                      const Icon = MODULE_ICON[moduleKey] || fallbackToneIcon(tone);
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleClick(n)}
                          className={cn(
                            'group relative w-full text-left px-4 py-3 border-b border-border/50 last:border-0 kd-transition',
                            'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
                          )}
                        >
                          {/* Unread bar — subtle vertical accent at the left edge */}
                          {!n.read && (
                            <span className={cn('absolute left-0 top-3 bottom-3 w-1 rounded-r-full', t.unreadBar)} />
                          )}
                          <div className="flex items-start gap-3 pl-1.5">
                            <div className={cn(
                              'mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ring-1 ring-inset',
                              t.iconBg, t.outline,
                            )}>
                              <Icon className={cn('h-4 w-4', t.iconFg)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className={cn(
                                  'text-sm leading-tight truncate',
                                  n.read ? 'font-medium text-foreground/80' : 'font-semibold text-foreground',
                                )}>
                                  {n.title}
                                </p>
                                <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">
                                  {formatRelative(n.created_at)}
                                </span>
                              </div>
                              {n.body && (
                                <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                                  {n.body}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </ScrollArea>

        {notifications.length >= 50 && (
          <div className="px-4 py-2 text-[11px] text-muted-foreground text-center border-t border-border bg-muted/20">
            Showing 50 most recent
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
