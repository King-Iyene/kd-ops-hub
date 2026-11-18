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
  layout: { template?: TemplateName; items?: unknown; rooms?: Record<string, { uid?: string; label?: string; free?: boolean }>; settings?: { builders?: string[]; recorders?: string[]; maxItems?: number } };
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
    staleTime: 60_000,
  });
}

/** Makes sure the signed-in person has a personal office (the database also does this automatically). */
export interface Person { id: string; name: string; avatar: AvatarStyle; role: string }

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
export function useDirectory() {
  return useQuery({
    queryKey: ['office', 'directory'],
    queryFn: async (): Promise<Person[]> => {
      const [{ data: ppl }, { data: avs }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role').order('full_name'),
        supabase.from('office_avatars').select('profile_id, style'),
      ]);
      const styles = new Map((avs ?? []).map((a) => [a.profile_id as string, a.style]));
      return (ppl ?? []).map((p) => ({ id: p.id as string, name: shortName(p.full_name as string), avatar: cleanAvatar(styles.get(p.id as string), p.id as string), role: (p.role as string) ?? '' }));
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
      const { data } = await supabase.from('office_avatars').select('style').eq('profile_id', userId!).maybeSingle();
      return cleanAvatar(data?.style, userId!);
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
    async saveSettings(space: SpaceRow, settings: { builders?: string[]; recorders?: string[]; maxItems?: number }) {
      const { error } = await supabase
        .from('office_spaces')
        .update({ layout: { ...space.layout, settings } as never, updated_at: new Date().toISOString() })
        .eq('id', space.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'spaces'] });
      await qc.invalidateQueries({ queryKey: ['office', 'recordings'] });
    },
    async saveLayout(space: SpaceRow, template: TemplateName, items: Item[] | undefined, rooms?: Record<string, { uid?: string; label?: string; free?: boolean }>) {
      const { error } = await supabase
        .from('office_spaces')
        .update({ layout: { template, ...(items ? { items } : {}), ...(rooms && Object.keys(rooms).length ? { rooms } : {}), ...(space.layout.settings ? { settings: space.layout.settings } : {}) } as never, updated_at: new Date().toISOString() })
        .eq('id', space.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'spaces'] });
    },
  };
}
