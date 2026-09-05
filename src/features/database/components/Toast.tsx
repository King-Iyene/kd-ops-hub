import { useEffect } from 'react';
import { create } from 'zustand';
import { X } from 'lucide-react';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (message: string, type: ToastItem['type'], duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type, duration = 3000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, duration }] }));
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  success: (message: string) => useToastStore.getState().addToast(message, 'success'),
  error: (message: string) => useToastStore.getState().addToast(message, 'error'),
  info: (message: string) => useToastStore.getState().addToast(message, 'info'),
};

const BORDER_COLORS: Record<ToastItem['type'], string> = {
  success: '#22C55E',
  error: '#EF4444',
  info: '#2D7FF9',
};

function ToastEntry({ item }: { item: ToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => removeToast(item.id), item.duration ?? 3000);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, removeToast]);

  return (
    <div
      className="flex items-start gap-2 px-4 py-3 bg-white dark:bg-[hsl(200,30%,12%)] rounded-lg shadow-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] min-w-[280px] max-w-[380px] animate-[slideIn_0.2s_ease-out]"
      style={{ borderLeft: `4px solid ${BORDER_COLORS[item.type]}` }}
    >
      <span className="text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)] flex-1">{item.message}</span>
      <button
        onClick={() => removeToast(item.id)}
        className="shrink-0 p-0.5 rounded hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,18%)] text-[#9AA2AF] hover:text-[#374151] dark:hover:text-[hsl(200,25%,88%)] transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastEntry key={t.id} item={t} />
        ))}
      </div>
    </>
  );
}
