import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  channel: RealtimeChannel | null;
  setNotifications: (notifications: Notification[]) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  fetchNotifications: (userId: string) => Promise<void>;
  subscribeRealtime: (userId: string) => void;
  unsubscribeRealtime: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  channel: null,
  setNotifications: (notifications) =>
    set({ notifications, unreadCount: notifications.filter((n) => !n.read).length }),
  markAsRead: async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    const notifications = get().notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    set({ notifications, unreadCount: notifications.filter((n) => !n.read).length });
  },
  markAllAsRead: async () => {
    const userId = get().notifications[0]?.user_id;
    if (userId) {
      await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    }
    const notifications = get().notifications.map((n) => ({ ...n, read: true }));
    set({ notifications, unreadCount: 0 });
  },
  fetchNotifications: async (userId) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      set({
        notifications: data as Notification[],
        unreadCount: data.filter((n: any) => !n.read).length,
      });
    }
  },
  /**
   * Subscribe to Supabase Realtime INSERT events on the notifications table
   * filtered to the current user. New rows are prepended to the list and the
   * unread count is bumped immediately — no manual refresh needed.
   */
  subscribeRealtime: (userId: string) => {
    // Avoid double-subscribing.
    const existing = get().channel;
    if (existing) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          const current = get().notifications;
          // Dedupe — Realtime can occasionally deliver the same row twice.
          if (current.some((n) => n.id === newNotif.id)) return;
          const next = [newNotif, ...current].slice(0, 100);
          set({
            notifications: next,
            unreadCount: next.filter((n) => !n.read).length,
          });
        },
      )
      .subscribe();

    set({ channel });
  },
  unsubscribeRealtime: () => {
    const ch = get().channel;
    if (ch) {
      supabase.removeChannel(ch);
      set({ channel: null });
    }
  },
}));
