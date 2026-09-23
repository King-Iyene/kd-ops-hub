import { create } from 'zustand';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (message: string, type: ToastItem['type'], opts?: { duration?: number; action?: ToastItem['action'] }) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type, opts) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, duration: opts?.duration ?? 3000, action: opts?.action }] }));
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  success: (message: string, opts?: { action?: ToastItem['action']; duration?: number }) =>
    useToastStore.getState().addToast(message, 'success', opts),
  error: (message: string) => useToastStore.getState().addToast(message, 'error'),
  info: (message: string, opts?: { action?: ToastItem['action']; duration?: number }) =>
    useToastStore.getState().addToast(message, 'info', opts),
};
