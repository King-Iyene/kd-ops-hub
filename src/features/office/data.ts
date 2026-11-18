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
  layout: { template?: TemplateName; items?: unknown };
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
    async saveLayout(space: SpaceRow, template: TemplateName, items: Item[]) {
      const { error } = await supabase
        .from('office_spaces')
        .update({ layout: { template, items } as never, updated_at: new Date().toISOString() })
        .eq('id', space.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'spaces'] });
    },
  };
}
