import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AvatarStyle, Item } from './world/types';
import type { TemplateName } from './world/templates';
import { cleanAvatar } from './world/render';

export interface SpaceRow {
  id: string;
  kind: 'team' | 'personal';
  name: string;
  company_id: string | null;
  owner_id: string | null;
  layout: { template?: TemplateName; items?: unknown; rooms?: Record<string, { uid?: string; label?: string; free?: boolean }>; settings?: { builders?: string[]; recorders?: string[]; maxItems?: number; boards?: Record<string, { title: string; cards: { h: string; t: string }[] }>; clock?: string[]; sky?: { time: string; season: string; place: string } }; tiles?: { wallsOn: number[]; wallsOff: number[]; floors: Record<string, string> } };
}

/** Every office the signed-in person can see: the company offices and everyone's personal office. */
export function useSpaces() {
  return useQuery({
    queryKey: ['office', 'spaces'],
    queryFn: async (): Promise<SpaceRow[]> => {
      const { data, error } = await supabase.from('office_spaces').select('id, kind, name, company_id, owner_id, layout').order('name');
      if (error) throw error;
      return (data ?? []) as SpaceRow[];
    },
    staleTime: 20_000,
    // so a change an admin makes (the sky, a board, the clock) reaches everyone within half a minute
    refetchInterval: 30_000,
  });
}

/** Makes sure the signed-in person has a personal office (the database also does this automatically). */
export interface Person { id: string; name: string; avatar: AvatarStyle; role: string; gender?: string | null }

/** The full name, the way people appear in the office. */
export function shortName(full: string | null | undefined): string {
  return (full ?? '').split(' ').filter(Boolean).join(' ') || 'Someone';
}

export interface DeskClaim { office_id: string; user_id: string }

/** What people have put inside their private offices, by office id (refreshes by itself). */
export function useOfficeDecor(spaceId: string | null) {
  return useQuery({
    queryKey: ['office', 'decor', spaceId],
    enabled: !!spaceId,
    refetchInterval: 15000,
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase.from('office_decor').select('office_id, items').eq('space_id', spaceId!);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.office_id as string, r.items]));
    },
  });
}

/** Who has claimed which private office in this space (refreshes by itself every few seconds). */
export function useDeskClaims(spaceId: string | null) {
  return useQuery({
    queryKey: ['office', 'claims', spaceId],
    enabled: !!spaceId,
    refetchInterval: 8000,
    queryFn: async (): Promise<DeskClaim[]> => {
      const { data, error } = await supabase.from('office_desk_claims').select('office_id, user_id').eq('space_id', spaceId!);
      if (error) throw error;
      return (data ?? []) as DeskClaim[];
    },
  });
}

/** Everyone in the company with their avatar, so people who are offline can be listed too. */
const sb = supabase as any;

/** Ids of the people who are in the office (null if it could not be worked out, so nobody is locked out by a hiccup). */
async function fetchMemberIds(): Promise<Set<string> | null> {
  try {
    const { data, error } = await sb.rpc('office_member_ids');
    if (error || !Array.isArray(data)) return null;
    return new Set((data as unknown[]).map((x) => (typeof x === 'string' ? x : String((x as Record<string, unknown>).office_member_ids ?? x))));
  } catch {
    return null;
  }
}

export function useOfficeMembers() {
  return useQuery({ queryKey: ['office', 'members'], queryFn: async () => { const s = await fetchMemberIds(); return s ? [...s] : null; }, staleTime: 60_000 });
}

/** Active employees who are not in the office yet (the people an admin can invite). */
export function useInvitable(enabled: boolean) {
  return useQuery({
    queryKey: ['office', 'invitable'],
    enabled,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const members = (await fetchMemberIds()) ?? new Set<string>();
      const { data } = await supabase.from('profiles').select('id, full_name, status').eq('status', 'active').order('full_name');
      return (data ?? []).filter((p) => !members.has(p.id as string)).map((p) => ({ id: p.id as string, name: shortName(p.full_name as string) }));
    },
  });
}

/** People an admin has invited (and who are active). */
export function useInvites(enabled: boolean) {
  return useQuery({
    queryKey: ['office', 'invites'],
    enabled,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data: inv } = await sb.from('office_invites').select('profile_id');
      const ids = ((inv ?? []) as { profile_id: string }[]).map((r) => r.profile_id);
      if (!ids.length) return [];
      const { data } = await supabase.from('profiles').select('id, full_name, status').in('id', ids).eq('status', 'active');
      return (data ?? []).map((p) => ({ id: p.id as string, name: shortName(p.full_name as string) }));
    },
  });
}

export function useDirectory() {
  return useQuery({
    queryKey: ['office', 'directory'],
    queryFn: async (): Promise<Person[]> => {
      const memberIds = await fetchMemberIds();
      const [{ data: pplAll }, { data: avs }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, gender').order('full_name'),
        supabase.from('office_avatars').select('profile_id, style'),
      ]);
      const styles = new Map((avs ?? []).map((a) => [a.profile_id as string, a.style]));
      const ppl = memberIds ? (pplAll ?? []).filter((p) => memberIds.has(p.id as string)) : (pplAll ?? []);
      return ppl.map((p) => ({ id: p.id as string, name: shortName(p.full_name as string), avatar: cleanAvatar(styles.get(p.id as string), p.id as string, p.gender as string | null), role: (p.role as string) ?? '', gender: p.gender as string | null }));
    },
    staleTime: 60_000,
  });
}

export async function ensurePersonalOffice(userId: string) {
  await supabase.rpc('office_provision_personal', { p_profile: userId });
}

export function useMyAvatar(userId: string | undefined) {
  return useQuery({
    queryKey: ['office', 'avatar', userId],
    enabled: !!userId,
    queryFn: async (): Promise<AvatarStyle> => {
      const [{ data }, { data: pr }] = await Promise.all([
        supabase.from('office_avatars').select('style').eq('profile_id', userId!).maybeSingle(),
        supabase.from('profiles').select('gender').eq('id', userId!).maybeSingle(),
      ]);
      return cleanAvatar(data?.style, userId!, (pr?.gender as string | null | undefined) ?? null);
    },
    staleTime: 5 * 60_000,
  });
}

export interface RecordingRow {
  id: string;
  session_id: string;
  part: number;
  room_name: string;
  recorded_by: string;
  started_at: string;
  duration_s: number;
  size_bytes: number;
  path: string;
  participants: string[];
  recorder_name?: string;
}

/** Recordings the signed-in person may see (their own; admins see everyone's). */
export function useRecordings(enabled: boolean) {
  return useQuery({
    queryKey: ['office', 'recordings'],
    enabled,
    queryFn: async (): Promise<RecordingRow[]> => {
      const { data, error } = await supabase
        .from('office_recordings')
        .select('id, session_id, part, room_name, recorded_by, started_at, duration_s, size_bytes, path, participants')
        .order('started_at', { ascending: false })
        .order('part', { ascending: true })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as RecordingRow[];
      const ids = [...new Set(rows.map((r) => r.recorded_by))];
      if (ids.length) {
        const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids);
        const names = new Map((ps ?? []).map((p) => [p.id as string, (p.full_name as string) ?? '']));
        for (const r of rows) r.recorder_name = names.get(r.recorded_by);
      }
      return rows;
    },
  });
}

export async function signedRecordingUrl(path: string, downloadAs?: string): Promise<string> {
  const { data, error } = await supabase.storage.from('office-recordings').createSignedUrl(path, 600, downloadAs ? { download: downloadAs } : undefined);
  if (error || !data) throw error ?? new Error('No link');
  return data.signedUrl;
}

export function useOfficeMutations() {
  const qc = useQueryClient();
  return {
    async invite(profileId: string, by: string) {
      const { error } = await sb.from('office_invites').upsert({ profile_id: profileId, invited_by: by });
      if (error) throw error;
      await Promise.all(['members', 'directory', 'invitable', 'invites'].map((k) => qc.invalidateQueries({ queryKey: ['office', k] })));
    },
    async uninvite(profileId: string) {
      const { error } = await sb.from('office_invites').delete().eq('profile_id', profileId);
      if (error) throw error;
      await Promise.all(['members', 'directory', 'invitable', 'invites'].map((k) => qc.invalidateQueries({ queryKey: ['office', k] })));
    },
    async saveAvatar(userId: string, style: AvatarStyle) {
      const { error } = await supabase.from('office_avatars').upsert({ profile_id: userId, style: style as never, updated_at: new Date().toISOString() });
      if (error) throw error;
      qc.setQueryData(['office', 'avatar', userId], style);
    },
    async deleteRecording(row: RecordingRow) {
      await supabase.storage.from('office-recordings').remove([row.path]);
      const { error } = await supabase.from('office_recordings').delete().eq('id', row.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'recordings'] });
    },
    /** Claim an office for myself, or (admin) assign it to someone. One office per person: the old one is released. */
    async claimDesk(spaceId: string, officeId: string, userId: string, asAdmin: boolean) {
      if (asAdmin) await supabase.from('office_desk_claims').delete().eq('space_id', spaceId).eq('office_id', officeId);
      await supabase.from('office_desk_claims').delete().eq('space_id', spaceId).eq('user_id', userId);
      const { error } = await supabase.from('office_desk_claims').insert({ space_id: spaceId, office_id: officeId, user_id: userId });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'claims', spaceId] });
    },
    /** Give an office up (mine), or (admin) free anyone's. */
    async unclaimDesk(spaceId: string, officeId: string) {
      const { error } = await supabase.from('office_desk_claims').delete().eq('space_id', spaceId).eq('office_id', officeId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'claims', spaceId] });
    },
    /** Save what is inside one private office (the owner, or an admin). */
    async saveDecor(spaceId: string, officeId: string, items: Item[], userId?: string) {
      const { error } = await supabase.from('office_decor').upsert({ space_id: spaceId, office_id: officeId, items: items as never, updated_by: userId ?? null, updated_at: new Date().toISOString() });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'decor', spaceId] });
    },
    /** A new empty space (admins). Returns its id. */
    async createSpace(name: string): Promise<string> {
      const { data, error } = await supabase.from('office_spaces').insert({ kind: 'team', name, layout: { template: 'blank' } as never }).select('id').single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'spaces'] });
      return data.id as string;
    },
    async renameSpace(id: string, name: string) {
      const { error } = await supabase.from('office_spaces').update({ name, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'spaces'] });
    },
    async deleteSpace(id: string) {
      const { error } = await supabase.from('office_spaces').delete().eq('id', id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'spaces'] });
    },
    async saveSettings(space: SpaceRow, settings: { builders?: string[]; recorders?: string[]; maxItems?: number; boards?: Record<string, { title: string; cards: { h: string; t: string }[] }>; clock?: string[] }) {
      const { error } = await supabase
        .from('office_spaces')
        .update({ layout: { ...space.layout, settings } as never, updated_at: new Date().toISOString() })
        .eq('id', space.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'spaces'] });
      await qc.invalidateQueries({ queryKey: ['office', 'recordings'] });
    },
    async saveLayout(space: SpaceRow, template: TemplateName, items: Item[] | undefined, rooms?: Record<string, { uid?: string; label?: string; free?: boolean }>, tiles?: { wallsOn: number[]; wallsOff: number[]; floors: Record<string, string> }) {
      const { error } = await supabase
        .from('office_spaces')
        .update({ layout: { template, ...(items ? { items } : {}), ...(rooms && Object.keys(rooms).length ? { rooms } : {}), ...(tiles && (tiles.wallsOn.length || tiles.wallsOff.length || Object.keys(tiles.floors).length) ? { tiles } : {}), ...(space.layout.settings ? { settings: space.layout.settings } : {}) } as never, updated_at: new Date().toISOString() })
        .eq('id', space.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'spaces'] });
    },
  };
}
