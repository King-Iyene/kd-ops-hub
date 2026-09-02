import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useDatabaseUI } from '../lib/store';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useRealtimeRecords(baseId: string | undefined, tableId: string | undefined) {
  const qc = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [resolved, setResolved] = useState<{ schema: string; table: string } | null>(null);

  useEffect(() => {
    if (!baseId || !tableId) { setResolved(null); return; }
    let cancelled = false;

    (async () => {
      const { data: base } = await supabase.schema('nc_meta').from('bases').select('schema_name').eq('id', baseId).single();
      const { data: table } = await supabase.schema('nc_meta').from('tables').select('pg_table_name').eq('id', tableId).single();
      if (!cancelled && base && table) {
        setResolved({ schema: base.schema_name, table: table.pg_table_name });
      }
    })();

    return () => { cancelled = true; };
  }, [baseId, tableId]);

  useEffect(() => {
    if (!resolved) return;

    const channelName = `db-records-${resolved.schema}-${resolved.table}`;
    channelRef.current = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: resolved.schema, table: resolved.table },
        () => {
          qc.invalidateQueries({ queryKey: ['nc', 'records'] });
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [resolved, qc]);
}

export function useRealtimeMetadata() {
  const qc = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    channelRef.current = supabase
      .channel('db-metadata')
      .on('postgres_changes', { event: '*', schema: 'nc_meta', table: 'tables' }, () => {
        qc.invalidateQueries({ queryKey: ['nc', 'tables'] });
      })
      .on('postgres_changes', { event: '*', schema: 'nc_meta', table: 'fields' }, () => {
        qc.invalidateQueries({ queryKey: ['nc', 'fields'] });
      })
      .on('postgres_changes', { event: '*', schema: 'nc_meta', table: 'views' }, () => {
        qc.invalidateQueries({ queryKey: ['nc', 'views'] });
      })
      .on('postgres_changes', { event: '*', schema: 'nc_meta', table: 'bases' }, () => {
        qc.invalidateQueries({ queryKey: ['nc', 'bases'] });
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [qc]);
}

export function usePresence(baseId: string | undefined) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);

  useEffect(() => {
    if (!baseId) return;

    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      const channel = supabase.channel(`presence-${baseId}`, {
        config: { presence: { key: data.user.id } },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          window.dispatchEvent(new CustomEvent('db-presence-sync', { detail: state }));
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              user_id: data.user!.id,
              email: data.user!.email,
              table_id: activeTableId,
              online_at: new Date().toISOString(),
            });
          }
        });

      channelRef.current = channel;
    };

    getUser();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [baseId, activeTableId]);
}
