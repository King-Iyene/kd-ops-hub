import { useState, useRef, useEffect } from 'react';
import { create } from 'zustand';
import { Bell, CheckCheck, Trash2, Edit3, MessageSquare, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToastStore } from './Toast';

// --- Notification store ---

export type NotificationType = 'record_created' | 'record_updated' | 'record_deleted' | 'comment' | 'automation';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
  read: boolean;
}

interface NotificationState {
  notifications: NotificationItem[];
  addNotification: (type: NotificationType, message: string) => void;
  markAllRead: () => void;
  unreadCount: () => number;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  addNotification: (type, message) => {
    const item: NotificationItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      message,
      timestamp: Date.now(),
      read: false,
    };
    set((s) => ({ notifications: [item, ...s.notifications].slice(0, 100) }));
  },
  markAllRead: () => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    }));
  },
  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));

// Bridge: subscribe to toast store and mirror into notifications
let toastBridgeInstalled = false;
export function installToastBridge() {
  if (toastBridgeInstalled) return;
  toastBridgeInstalled = true;
  useToastStore.subscribe((state, prev) => {
    if (state.toasts.length > prev.toasts.length) {
      const newToasts = state.toasts.slice(prev.toasts.length);
      for (const t of newToasts) {
        const type: NotificationType =
          t.message.toLowerCase().includes('created') ? 'record_created'
          : t.message.toLowerCase().includes('deleted') ? 'record_deleted'
          : t.message.toLowerCase().includes('comment') ? 'comment'
          : t.message.toLowerCase().includes('automation') ? 'automation'
          : 'record_updated';
        useNotificationStore.getState().addNotification(type, t.message);
      }
    }
  });
}

// --- Helpers ---

const ICONS: Record<NotificationType, typeof Edit3> = {
  record_created: CheckCheck,
  record_updated: Edit3,
  record_deleted: Trash2,
  comment: MessageSquare,
  automation: Zap,
};

const ICON_COLORS: Record<NotificationType, string> = {
  record_created: '#22C55E',
  record_updated: '#3366FF',
  record_deleted: '#EF4444',
  comment: '#F59E0B',
  automation: '#8B5CF6',
};

function relativeTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// --- Component ---

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const notifications = useNotificationStore((s) => s.notifications);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const unread = useNotificationStore((s) => s.unreadCount)();
  const panelRef = useRef<HTMLDivElement>(null);

  // Install toast bridge on mount
  useEffect(() => {
    installToastBridge();
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-[#6A7184] hover:bg-[#F4F4F5] relative"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#EF4444] text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[340px] bg-white dark:bg-[hsl(200,30%,10%)] rounded-lg shadow-xl border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
            <span className="text-[13px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
              Notifications
            </span>
            {notifications.length > 0 && (
              <button
                className="text-[11px] text-[#3366FF] hover:underline"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[#9AA2AF]">
                <Bell size={28} className="mb-2 opacity-40" />
                <span className="text-[13px]">No notifications</span>
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = ICONS[n.type];
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-[#F4F4F5] dark:border-[hsl(200,25%,15%)] last:border-0 ${
                      !n.read ? 'bg-[#F0F4FF] dark:bg-[hsl(220,40%,12%)]' : ''
                    }`}
                  >
                    <div
                      className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: ICON_COLORS[n.type] + '18' }}
                    >
                      <Icon size={13} style={{ color: ICON_COLORS[n.type] }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-[#374151] dark:text-[hsl(200,25%,85%)] leading-snug">
                        {n.message}
                      </p>
                      <span className="text-[10px] text-[#9AA2AF] mt-0.5 block">
                        {relativeTime(n.timestamp)}
                      </span>
                    </div>
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-[#3366FF] shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
