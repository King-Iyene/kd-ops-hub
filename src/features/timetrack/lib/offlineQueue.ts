import { supabase } from '@/lib/supabase';

/**
 * Offline tracking with later sync — scoped deliberately: queues the two
 * writes that actually happen while someone's genuinely offline in the
 * field (saving a manual entry, stopping a running timer). Starting a NEW
 * timer while offline is NOT queued — the one-active-timer-per-employee
 * constraint and duration/rate validation both need a round trip to the
 * server to be meaningful, so that stays online-only rather than faking a
 * local state that might conflict once synced.
 */

const QUEUE_KEY = 'timetrack:offline-queue';

export type QueuedWrite =
  | { id: string; type: 'insert_entry'; payload: Record<string, unknown>; queuedAt: string }
  | { id: string; type: 'update_entry'; entryId: string; payload: Record<string, unknown>; queuedAt: string };

export function getQueue(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function setQueue(queue: QueuedWrite[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage unavailable (private mode, quota) — the write is lost,
    // but we never block the UI on this.
  }
}

export function enqueue(item: Omit<QueuedWrite, 'id' | 'queuedAt'>): void {
  const queue = getQueue();
  queue.push({ ...item, id: crypto.randomUUID(), queuedAt: new Date().toISOString() } as QueuedWrite);
  setQueue(queue);
}

export function queueLength(): number {
  return getQueue().length;
}

export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const remaining: QueuedWrite[] = [];
  let synced = 0;

  for (const item of queue) {
    try {
      if (item.type === 'insert_entry') {
        const { error } = await supabase.from('time_entries').insert(item.payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('time_entries').update(item.payload).eq('id', item.entryId);
        if (error) throw error;
      }
      synced++;
    } catch {
      remaining.push(item); // keep it queued — will retry next flush
    }
  }

  setQueue(remaining);
  return { synced, failed: remaining.length };
}
