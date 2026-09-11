import { useState, useEffect, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { CloudOff, Loader2, Check } from 'lucide-react';

export function SaveStatusIndicator() {
  const mutatingCount = useIsMutating();
  const [visible, setVisible] = useState<'saving' | 'saved' | 'offline' | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const wasSaving = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const initialMount = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => { initialMount.current = false; }, 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const on = () => { setOnline(true); setVisible(null); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      setVisible('offline');
      return;
    }
    if (mutatingCount > 0) {
      if (!initialMount.current) {
        wasSaving.current = true;
        setVisible('saving');
        clearTimeout(hideTimer.current);
      }
    } else if (wasSaving.current) {
      wasSaving.current = false;
      setVisible('saved');
      hideTimer.current = setTimeout(() => setVisible(null), 2000);
    }
  }, [mutatingCount, online]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-1.5 text-2xs font-medium select-none">
      {visible === 'saving' && (
        <>
          <Loader2 size={12} className="animate-spin text-blue-500" />
          <span className="text-[#6A7184] dark:text-[hsl(200,25%,55%)]">Saving…</span>
        </>
      )}
      {visible === 'saved' && (
        <>
          <Check size={12} className="text-emerald-500" />
          <span className="text-success">Saved</span>
        </>
      )}
      {visible === 'offline' && (
        <>
          <CloudOff size={12} className="text-amber-500" />
          <span className="text-warning">Offline</span>
        </>
      )}
    </div>
  );
}
