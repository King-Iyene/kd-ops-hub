import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { useCrewAgents, useCrewAttention } from './useCrew';

/** A soft two-note chime (no sound file, no service). Silent if the browser has not allowed sound yet. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [660, 880].forEach((hz, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, now + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.12, now + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.16);
      o.stop(now + i * 0.16 + 0.4);
    });
    window.setTimeout(() => void ctx.close().catch(() => undefined), 900);
  } catch { /* no sound is fine */ }
}

/**
 * Tells the owner when an executive writes to him: a small pop-up with who and what, and a soft chime. It stays quiet on the first load (it only
 * announces what arrives while the app is open). Mounted once for the owner; everyone else makes no request.
 */
export function CrewNotifier() {
  const isSuper = useAuthStore((s) => s.profile?.role === 'super_admin');
  const { toast } = useToast();
  const attention = useCrewAttention(isSuper);
  const agents = useCrewAgents();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!isSuper) return;
    const ids = attention.unread.map((m) => m.id);
    if (seen.current === null) { if (agents.data || attention.unread.length === 0) seen.current = new Set(ids); return; }
    const fresh = attention.unread.filter((m) => !seen.current!.has(m.id));
    fresh.forEach((m) => seen.current!.add(m.id));
    if (fresh.length === 0) return;
    const m = fresh[0];
    const who = agents.data?.find((a) => a.id === m.from_agent)?.name.split(' ')[0] ?? 'An executive';
    toast({ title: fresh.length > 1 ? `${who} and ${fresh.length - 1} more wrote to you` : `${who} wrote to you`, description: m.body.length > 110 ? m.body.slice(0, 110) + '…' : m.body });
    chime();
  }, [attention.unread, agents.data, isSuper, toast]);

  return null;
}
