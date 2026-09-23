import { create } from 'zustand';
import { useToastStore } from './toast-store';

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
