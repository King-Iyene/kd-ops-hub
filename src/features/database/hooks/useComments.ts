import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface RecordComment {
  id: string;
  base_id: string;
  table_id: string;
  record_id: string;
  user_email: string | null;
  comment: string;
  created_at: string;
  updated_at: string;
}

export function useComments(tableId: string, recordId: string) {
  return useQuery({
    queryKey: ['record_comments', tableId, recordId],
    enabled: !!tableId && !!recordId,
    queryFn: async (): Promise<RecordComment[]> => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('record_comments')
        .select('*')
        .eq('table_id', tableId)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as RecordComment[];
    },
  });
}

export function useCreateComment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      recordId: string;
      userEmail: string | null;
      comment: string;
    }) => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('record_comments')
        .insert({
          base_id: input.baseId,
          table_id: input.tableId,
          record_id: input.recordId,
          user_email: input.userEmail,
          comment: input.comment,
        })
        .select()
        .single();

      if (error) throw error;
      return data as RecordComment;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['record_comments', variables.tableId, variables.recordId],
      });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      commentId: string;
      tableId: string;
      recordId: string;
    }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .from('record_comments')
        .delete()
        .eq('id', input.commentId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['record_comments', variables.tableId, variables.recordId],
      });
    },
  });
}
