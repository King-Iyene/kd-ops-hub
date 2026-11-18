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

export function useOfficeMutations() {
  const qc = useQueryClient();
  return {
    async saveAvatar(userId: string, style: AvatarStyle) {
      const { error } = await supabase.from('office_avatars').upsert({ profile_id: userId, style, updated_at: new Date().toISOString() });
      if (error) throw error;
      qc.setQueryData(['office', 'avatar', userId], style);
    },
    async saveLayout(space: SpaceRow, template: TemplateName, items: Item[]) {
      const { error } = await supabase
        .from('office_spaces')
        .update({ layout: { template, items }, updated_at: new Date().toISOString() })
        .eq('id', space.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['office', 'spaces'] });
    },
  };
}
