import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { GuestStatus } from './guestUtils';

/** The invitations a member can see (their own, or all of them for an admin), the list of past guests, and the actions. */
export interface GuestInvite {
  id: string;
  space_id: string;
  guest_id: string | null;
  invited_by: string;
  email: string;
  name: string;
  status: GuestStatus;
  duration: 'once' | '1d' | '7d' | '30d' | '90d';
  max_visits: number | null;
  visits: number;
  auto_admit: boolean;
  expires_at: string;
  waiting_at: string | null;
  approved_at: string | null;
  room_secret: string | null;
  session_until: string | null;
  created_at: string;
}
export interface KnownGuest { id: string; name: string; email_hint: string; last_invited_at: string }
export interface CreateGuest { guestId?: string; name?: string; email?: string; duration: GuestInvite['duration']; autoAdmit: boolean }

// the new tables are not in the generated database types yet
 
const sb = supabase as any;

/** The message from a failed function call (the function answers with a short, plain sentence). */
async function failure(error: unknown): Promise<string> {
  try {
    const res = (error as { context?: Response })?.context;
    const body = res ? await res.json() : null;
    if (body && typeof body.error === 'string') return body.error;
  } catch { /* fall through */ }
  return 'That did not work. Please try again.';
}

export function useGuestInvites(spaceId: string | null, onWaiting: (i: GuestInvite) => void) {
  const [invites, setInvites] = useState<GuestInvite[]>([]);
  const [known, setKnown] = useState<KnownGuest[]>([]);
  const seen = useRef<Map<string, string> | null>(null);
  const waiting = useRef(onWaiting);
  waiting.current = onWaiting;

  const load = useCallback(async () => {
    if (!spaceId) { setInvites([]); return; }
    const { data } = await sb.from('office_guest_invites').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(200);
    const list = ((data ?? []) as GuestInvite[]);
    // somebody has just arrived at the door
    if (seen.current) for (const i of list) if (i.status === 'waiting' && seen.current.get(i.id) !== 'waiting') waiting.current(i);
    seen.current = new Map(list.map((i) => [i.id, i.status]));
    setInvites(list);
  }, [spaceId]);

  const loadKnown = useCallback(async () => {
    if (!spaceId) { setKnown([]); return; }
    const { data } = await sb.rpc('office_guest_directory', { p_space: spaceId });
    setKnown(((data ?? []) as KnownGuest[]));
  }, [spaceId]);

  useEffect(() => {
    seen.current = null;
    void load();
    void loadKnown();
    if (!spaceId) return;
    const ch = supabase.channel(`office-guests:${spaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_guest_invites' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [spaceId, load, loadKnown]);

  const create = useCallback(async (p: CreateGuest): Promise<{ ok: true; link: string; emailed: boolean } | { ok: false; error: string }> => {
    const { data, error } = await supabase.functions.invoke('office-guest', { body: { action: 'create', spaceId, ...p } });
    if (error) return { ok: false, error: await failure(error) };
    await Promise.all([load(), loadKnown()]);
    return { ok: true, link: String((data as { link?: string })?.link ?? ''), emailed: !!(data as { emailed?: boolean })?.emailed };
  }, [spaceId, load, loadKnown]);

  const decide = useCallback(async (inviteId: string, decision: 'approve' | 'deny' | 'end'): Promise<string | null> => {
    const { error } = await supabase.functions.invoke('office-guest', { body: { action: 'decide', inviteId, decision } });
    if (error) return failure(error);
    await load();
    return null;
  }, [load]);

  const forget = useCallback(async (guestId: string): Promise<string | null> => {
    const { error } = await supabase.functions.invoke('office-guest', { body: { action: 'forget', guestId } });
    if (error) return failure(error);
    await Promise.all([load(), loadKnown()]);
    return null;
  }, [load, loadKnown]);

  const waitingCount = invites.filter((i) => i.status === 'waiting').length;
  return { invites, known, create, decide, forget, waitingCount, reload: load };
}
