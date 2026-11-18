import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Live updates (section 9.7, AC-11): a task view subscribes once per page
 * and invalidates the relevant query cache on any change, so a second
 * person watching the same list sees a drag or edit within about a
 * second without a refresh.
 */
export function useTaskListRealtime(listId: string | undefined) {
  const qc = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!listId) return;

    channelRef.current = supabase
      .channel(`tk-list-${listId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tk_tasks', filter: `list_id=eq.${listId}` }, () => {
        qc.invalidateQueries({ queryKey: ['tk', 'list', listId, 'tasks'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tk_task_assignees' }, () => {
        qc.invalidateQueries({ queryKey: ['tk', 'list', listId, 'tasks'] });
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [listId, qc]);
}

/** Same idea for an open task panel's comment and activity feed. */
export function useTaskEntityRealtime(entityType: 'task' | 'record', entityId: string | undefined) {
  const qc = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!entityId) return;

    channelRef.current = supabase
      .channel(`tk-entity-${entityType}-${entityId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tk_comments', filter: `entity_id=eq.${entityId}` }, () => {
        qc.invalidateQueries({ queryKey: ['tk', 'comments', entityType, entityId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tk_activity_log', filter: `entity_id=eq.${entityId}` }, () => {
        qc.invalidateQueries({ queryKey: ['tk', 'activity', entityType, entityId] });
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [entityType, entityId, qc]);
}
