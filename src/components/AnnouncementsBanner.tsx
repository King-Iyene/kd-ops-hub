import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'gold';
  expires_at: string | null;
  dismissed_by_ids: string[];
}

const TONE_CLASS: Record<Announcement['tone'], string> = {
  info: 'bg-info/10 text-info-foreground border-info/40',
  success: 'bg-success/10 text-success border-success/40',
  warning: 'bg-warning/10 text-warning border-warning/40',
  danger: 'bg-destructive/10 text-destructive border-destructive/40',
  gold: 'bg-[#D6AC50]/15 text-[#3a2e12] border-[#D6AC50]/50',
};

/**
 * Top-of-dashboard banner that shows any active company announcement.
 * Dismissal is tracked per-user by appending the uid to the dismissed_by_ids
 * array, so the banner stays hidden on refresh.
 */
export function AnnouncementsBanner() {
  const profile = useAuthStore((s) => s.profile);
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    const now = new Date().toISOString();
    supabase
      .from('announcements')
      .select('*')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        const mine = ((data as Announcement[]) || []).filter(
          (a) => !a.dismissed_by_ids.includes(profile.id),
        );
        setItems(mine);
      });
  }, [profile?.id]);

  const dismiss = async (a: Announcement) => {
    if (!profile?.id) return;
    const next = Array.from(new Set([...(a.dismissed_by_ids || []), profile.id]));
    await supabase
      .from('announcements')
      .update({ dismissed_by_ids: next })
      .eq('id', a.id);
    setItems((prev) => prev.filter((i) => i.id !== a.id));
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div
          key={a.id}
          className={cn(
            'rounded-lg border p-3 pr-10 flex items-start gap-3 relative kd-transition',
            TONE_CLASS[a.tone] || TONE_CLASS.info,
          )}
        >
          <Megaphone className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{a.title}</p>
            {a.body && <p className="text-xs opacity-80 mt-0.5">{a.body}</p>}
          </div>
          <button
            type="button"
            aria-label="Dismiss announcement"
            className="absolute top-2 right-2 opacity-60 hover:opacity-100 kd-transition"
            onClick={() => dismiss(a)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
