import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { shortName } from './personName';
import { playRing, playWave } from './chime';
import { notifyPing } from './notify';

/**
 * Waves and rings that reach people who are using KD Ops on any page, not only inside the Office.
 *
 * Between two people who are both in the Office a wave travels over the Office's live channel. Somebody on another page has no such
 * channel, so the wave is saved as a small row (table office_pings) and every open page of the app hears new rows addressed to its
 * person: this file sends one, and listens for them (mounted once, in the app layout).
 */
export type AppPingKind = 'wave' | 'ring';
export interface AppPing { id: string; from: string; kind: AppPingKind; at: number }

/** Older than this and a wave is no longer news (the page was closed or asleep when it was sent). */
export const AppPingFreshMs = 90_000;

/** Read a row from the network (another client could send anything): only mine, only recent, only a wave or a ring. */
export function parseAppPing(raw: unknown, me: string, now: number): AppPing | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.from_id !== 'string' || typeof o.to_id !== 'string') return null;
  if (o.to_id !== me || o.from_id === me) return null;
  if (o.kind !== 'wave' && o.kind !== 'ring') return null;
  const at = typeof o.created_at === 'string' ? Date.parse(o.created_at) : NaN;
  if (!Number.isFinite(at) || now - at > AppPingFreshMs || at - now > 5 * 60_000) return null;
  return { id: o.id, from: o.from_id, kind: o.kind, at };
}

/** What the person's own status says: Focus, Meeting and Do not disturb are quiet; Do not disturb gets nothing at all. */
export function pingMode(): 'normal' | 'quiet' | 'dnd' {
  try {
    const s = localStorage.getItem('kd:office:status');
    return s === 'dnd' ? 'dnd' : s === 'focus' || s === 'meeting' ? 'quiet' : 'normal';
  } catch {
    return 'normal';
  }
}

/** Send a wave or ring to somebody who is not in the Office. 'slow' when they were just waved at, 'failed' for anything else. */
export async function sendAppPing(toUid: string, kind: AppPingKind): Promise<'sent' | 'slow' | 'failed'> {
  try {
    const { error } = await supabase.from('office_pings' as never).insert({ to_id: toUid, kind } as never);
    if (!error) return 'sent';
    return /slow down/i.test(error.message ?? '') ? 'slow' : 'failed';
  } catch {
    return 'failed';
  }
}

const names = new Map<string, string>();
async function nameOf(uid: string): Promise<string> {
  const hit = names.get(uid);
  if (hit) return hit;
  try {
    const { data } = await supabase.from('profiles').select('full_name, email').eq('id', uid).maybeSingle();
    const n = shortName((data as { full_name?: string | null } | null)?.full_name ?? null, (data as { email?: string | null } | null)?.email ?? null);
    names.set(uid, n);
    return n;
  } catch {
    return 'A colleague';
  }
}

/** Listen (while signed in, on any page) for waves and rings sent to me; show them and play the sound. */
export function useAppPings(myId: string | undefined, onShow: (p: { kind: AppPingKind; name: string; open: () => void }) => void): void {
  const navigate = useNavigate();
  const showRef = useRef(onShow);
  showRef.current = onShow;
  useEffect(() => {
    if (!myId) return;
    const seen = new Set<string>();
    const ch = supabase
      .channel(`office-pings:${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'office_pings', filter: `to_id=eq.${myId}` }, (payload) => {
        const p = parseAppPing(payload.new, myId, Date.now());
        if (!p || seen.has(p.id)) return;
        seen.add(p.id);
        const mode = pingMode();
        if (mode === 'dnd') return; // nothing reaches me on Do not disturb
        void nameOf(p.from).then((name) => {
          if (mode === 'normal') (p.kind === 'ring' ? playRing : playWave)();
          const open = () => navigate('/office');
          notifyPing(p.kind === 'ring' ? `${name} wants a word` : `${name} is waving at you`, 'Open the Office to say hi.', open, `${p.kind}:${p.from}`);
          showRef.current({ kind: p.kind, name, open });
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [myId, navigate]);
}
