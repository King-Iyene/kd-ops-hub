import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { enqueue, getAll, remove, incrementRetry, type PendingMutation } from '@/lib/offline-queue';
import { useToast } from '@/hooks/use-toast';

const MAX_RETRIES = 5;

export function useOfflineQueue() {
  const { toast } = useToast();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    const all = await getAll();
    setPendingCount(all.length);
  }, []);

  const submitOrQueue = useCallback(async (
    table: string,
    operation: 'insert' | 'update' | 'delete',
    payload: Record<string, unknown>,
  ): Promise<{ queued: boolean; error?: string }> => {
    if (navigator.onLine) {
      try {
        let result;
        if (operation === 'insert') {
          result = await supabase.from(table).insert(payload);
        } else if (operation === 'update') {
          const { id, ...rest } = payload;
          result = await supabase.from(table).update(rest).eq('id', id);
        } else {
          result = await supabase.from(table).delete().eq('id', payload.id);
        }
        if (result.error) throw result.error;
        return { queued: false };
      } catch {
        // Network failed despite navigator.onLine — queue it
      }
    }

    await enqueue({ table, operation, payload });
    await refreshCount();
    toast({
      title: 'Saved offline',
      description: 'Your change will sync when connectivity returns.',
    });
    return { queued: true };
  }, [toast, refreshCount]);

  const flush = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    const pending = await getAll();
    let synced = 0;

    for (const m of pending) {
      if (m.retries >= MAX_RETRIES) {
        await remove(m.id);
        continue;
      }
      try {
        let result;
        if (m.operation === 'insert') {
          result = await supabase.from(m.table).insert(m.payload);
        } else if (m.operation === 'update') {
          const { id, ...rest } = m.payload;
          result = await supabase.from(m.table).update(rest).eq('id', id);
        } else {
          result = await supabase.from(m.table).delete().eq('id', m.payload.id);
        }
        if (result.error) throw result.error;
        await remove(m.id);
        synced++;
      } catch {
        await incrementRetry(m.id);
      }
    }

    await refreshCount();
    setSyncing(false);

    if (synced > 0) {
      toast({
        title: 'Offline changes synced',
        description: `${synced} pending change${synced > 1 ? 's' : ''} uploaded.`,
      });
    }
  }, [syncing, toast, refreshCount]);

  useEffect(() => {
    refreshCount();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [flush, refreshCount]);

  return { submitOrQueue, pendingCount, syncing, flush };
}
