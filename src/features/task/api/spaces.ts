import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export interface TaskSpace {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  icon: string | null;
  is_private: boolean;
  position: number;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface TaskSpaceMember {
  space_id: string;
  user_id: string;
  role: 'editor' | 'viewer';
  created_at: string;
}

/** Active (non-archived) spaces the viewer can see, for the sidebar tree
 *  and the /task landing redirect. RLS (tk_can_access_space) already limits
 *  this to spaces the viewer is a member of, or public spaces. */
export function useActiveSpaces() {
  return useQuery({
    queryKey: ['tk', 'spaces', 'active'],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_spaces')
        .select('id, workspace_id, name, color, icon, is_private, position, created_by, archived_at, created_at')
        .is('archived_at', null)
        .order('position')
        .order('created_at');
      if (error) throw error;
      return data as TaskSpace[];
    },
  });
}

/** A single space by id, any archived state — archived spaces are still
 *  readable by those who could already read them (behaviour rule 10.10). */
export function useSpace(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'space', spaceId],
    enabled: !!spaceId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_spaces')
        .select('id, workspace_id, name, color, icon, is_private, position, created_by, archived_at, created_at')
        .eq('id', spaceId as string)
        .maybeSingle();
      if (error) throw error;
      return data as TaskSpace | null;
    },
  });
}

export function useSpaceMembers(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'space', spaceId, 'members'],
    enabled: !!spaceId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_space_members')
        .select('space_id, user_id, role, created_at')
        .eq('space_id', spaceId as string);
      if (error) throw error;
      return data as TaskSpaceMember[];
    },
  });
}

export interface TaskSpaceMemberDetailed extends TaskSpaceMember {
  full_name: string;
  email: string | null;
  photo_url: string | null;
}

/** Space members joined against the safe profiles_directory view, for the
 *  Members dialog (names and avatars, not just ids). */
export function useSpaceMembersDetailed(spaceId: string | undefined) {
  const membersQuery = useSpaceMembers(spaceId);
  return useQuery({
    queryKey: ['tk', 'space', spaceId, 'members', 'detailed', membersQuery.data?.map((m) => m.user_id).join(',')],
    enabled: !!spaceId && !!membersQuery.data,
    staleTime: 15_000,
    queryFn: async () => {
      const members = membersQuery.data ?? [];
      if (members.length === 0) return [] as TaskSpaceMemberDetailed[];
      const { data, error } = await supabase
        .from('profiles_directory')
        .select('id, full_name, email, photo_url')
        .in('id', members.map((m) => m.user_id));
      if (error) throw error;
      const byId = new Map((data ?? []).map((p) => [p.id, p]));
      return members.map((m) => {
        const p = byId.get(m.user_id);
        return {
          ...m,
          full_name: p?.full_name ?? 'Unknown',
          email: p?.email ?? null,
          photo_url: p?.photo_url ?? null,
        };
      });
    },
  });
}

/** Whether the viewer may edit this space: a workspace admin/owner, or an
 *  editor-role member of it (mirrors tk_can_edit_space, minus the
 *  archived_at gate so the UI can still show the Unarchive action). */
export function useCanManageSpace(spaceId: string | undefined, isTaskAdmin: boolean) {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: members } = useSpaceMembers(spaceId);
  if (isTaskAdmin) return true;
  if (!members || !userId) return false;
  return members.some((m) => m.user_id === userId && m.role === 'editor');
}

export interface CreateSpaceInput {
  name: string;
  color: string;
  isPrivate: boolean;
  createdBy: string;
  members: { userId: string; role: 'editor' | 'viewer' }[];
}

export function useCreateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSpaceInput) => {
      const { data: workspace, error: workspaceErr } = await supabase
        .from('tk_workspaces')
        .select('id')
        .limit(1)
        .single();
      if (workspaceErr) throw workspaceErr;

      const { data: space, error } = await supabase
        .from('tk_spaces')
        .insert({
          workspace_id: workspace.id,
          name: input.name,
          color: input.color,
          is_private: input.isPrivate,
          created_by: input.createdBy,
        })
        .select()
        .single();
      if (error) throw error;

      const otherMembers = input.members.filter((m) => m.userId !== input.createdBy);
      if (otherMembers.length > 0) {
        const { error: memberErr } = await supabase.from('tk_space_members').insert(
          otherMembers.map((m) => ({ space_id: space.id, user_id: m.userId, role: m.role })),
        );
        if (memberErr) throw memberErr;
      }
      return space as TaskSpace;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tk', 'spaces'] });
    },
  });
}

export function useRenameSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, name }: { spaceId: string; name: string }) => {
      const { error } = await supabase.from('tk_spaces').update({ name }).eq('id', spaceId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tk', 'spaces'] });
      qc.invalidateQueries({ queryKey: ['tk', 'space', vars.spaceId] });
    },
  });
}

export function useRecolorSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, color }: { spaceId: string; color: string }) => {
      const { error } = await supabase.from('tk_spaces').update({ color }).eq('id', spaceId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tk', 'spaces'] });
      qc.invalidateQueries({ queryKey: ['tk', 'space', vars.spaceId] });
    },
  });
}

/** Archive or unarchive a space via the dedicated RPC (see migration
 *  20261291000000) — a plain UPDATE can never clear archived_at again once
 *  set, by design (tk_can_edit_space requires archived_at IS NULL). */
export function useSetSpaceArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, archived }: { spaceId: string; archived: boolean }) => {
      const { error } = await (supabase as any).rpc('tk_set_space_archived', {
        p_space_id: spaceId,
        p_archived: archived,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tk', 'spaces'] });
      qc.invalidateQueries({ queryKey: ['tk', 'space', vars.spaceId] });
    },
  });
}

export function useAddSpaceMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, userId, role }: { spaceId: string; userId: string; role: 'editor' | 'viewer' }) => {
      const { error } = await supabase.from('tk_space_members').insert({ space_id: spaceId, user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tk', 'space', vars.spaceId, 'members'] });
    },
  });
}

export function useUpdateSpaceMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, userId, role }: { spaceId: string; userId: string; role: 'editor' | 'viewer' }) => {
      const { error } = await supabase
        .from('tk_space_members')
        .update({ role })
        .eq('space_id', spaceId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tk', 'space', vars.spaceId, 'members'] });
    },
  });
}

export function useRemoveSpaceMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, userId }: { spaceId: string; userId: string }) => {
      const { error } = await supabase.from('tk_space_members').delete().eq('space_id', spaceId).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tk', 'space', vars.spaceId, 'members'] });
    },
  });
}
