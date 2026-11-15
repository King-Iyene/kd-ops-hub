import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

// Matches the local-queue-then-batch-upload model in the TimeCamp architecture
// doc: writes are attempted live first; only a write that fails for network
// reasons (not a real server-side rejection) is queued here, to a plain JSON
// file in userData, and retried on a timer until it succeeds. Nothing is ever
// silently dropped just because the network blipped.

type QueuedOp =
  | { kind: 'insert'; id: string; table: string; payload: Record<string, unknown>; queuedAt: string }
  | {
      kind: 'update';
      id: string;
      table: string;
      payload: Record<string, unknown>;
      match: { column: string; value: string };
      queuedAt: string;
    };

let queuePath: string | null = null;
let queue: QueuedOp[] = [];
let flushHandle: ReturnType<typeof setInterval> | null = null;
let flushing = false;

function getQueuePath(): string {
  if (!queuePath) queuePath = join(app.getPath('userData'), 'offline-queue.json');
  return queuePath;
}

function load(): void {
  try {
    const path = getQueuePath();
    if (existsSync(path)) {
      queue = JSON.parse(readFileSync(path, 'utf-8')) as QueuedOp[];
    }
  } catch (err) {
    console.error('[offlineQueue] failed to load queue file, starting empty:', err);
    queue = [];
  }
}

function persist(): void {
  try {
    const path = getQueuePath();
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(queue));
  } catch (err) {
    console.error('[offlineQueue] failed to persist queue file:', err);
  }
}

/** True for a connectivity-layer failure (DNS/timeout/offline) that throws
 * from the fetch call itself, as opposed to a structured Postgrest error
 * object (RLS denial, constraint violation, bad input) that comes back as
 * `{ error }` on a successful round trip. Only the former is worth queuing —
 * retrying a permissions error or a constraint violation would just loop
 * forever and block every later op behind it. */
function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    err instanceof TypeError || // "Failed to fetch" / "NetworkError when attempting..."
    /network|fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout/i.test(msg)
  );
}

export function queueInsert(table: string, payload: Record<string, unknown> & { id: string }): void {
  queue.push({ kind: 'insert', id: payload.id, table, payload, queuedAt: new Date().toISOString() });
  persist();
}

export function queueUpdate(
  table: string,
  id: string,
  payload: Record<string, unknown>,
  match: { column: string; value: string },
): void {
  queue.push({ kind: 'update', id, table, payload, match, queuedAt: new Date().toISOString() });
  persist();
}

/** Runs any Supabase write; on success returns normally. On a connectivity
 * failure, queues it locally for later retry and returns without throwing —
 * the caller already has (or generated) the id it needs and can proceed
 * optimistically. On a real server-side error, rethrows so the caller's
 * existing error handling is unchanged. */
export async function writeOrQueue(
  // Supabase query builders are thenables, not real Promises (no .catch/.finally
  // until awaited), so this accepts anything await-able rather than Promise<T>.
  attempt: () => PromiseLike<{ error: { message: string } | null }>,
  onNetworkFailure: () => void,
): Promise<void> {
  try {
    const { error } = await attempt();
    if (error) throw new Error(error.message);
  } catch (err) {
    if (isNetworkError(err)) {
      console.warn('[offlineQueue] write failed (network), queuing for retry:', err);
      onNetworkFailure();
      return;
    }
    throw err;
  }
}

export function queueLength(): number {
  return queue.length;
}

/** Retries queued ops in order (oldest first), stopping at the first one
 * that still fails for network reasons — later ops stay queued rather than
 * being tried out of order. A non-network failure (the row was since deleted,
 * a constraint now rejects it, etc.) drops just that one op, logged, so a
 * single bad row can't jam the queue forever. */
export async function flushQueue(client: SupabaseClient): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  try {
    while (queue.length > 0) {
      const op = queue[0];
      try {
        const result =
          op.kind === 'insert'
            ? await client.from(op.table).insert(op.payload)
            : await client.from(op.table).update(op.payload).eq(op.match.column, op.match.value);
        if (result.error) {
          console.error('[offlineQueue] queued op rejected by server, dropping:', op.table, result.error.message);
        }
        queue.shift();
        persist();
      } catch (err) {
        if (isNetworkError(err)) {
          // Still offline — stop here, keep this op and everything after it queued.
          break;
        }
        console.error('[offlineQueue] queued op threw unexpectedly, dropping:', op.table, err);
        queue.shift();
        persist();
      }
    }
  } finally {
    flushing = false;
  }
}

export function startAutoFlush(client: SupabaseClient, intervalMs = 30_000): void {
  load();
  if (flushHandle) clearInterval(flushHandle);
  void flushQueue(client);
  flushHandle = setInterval(() => void flushQueue(client), intervalMs);
}

export function stopAutoFlush(): void {
  if (flushHandle) {
    clearInterval(flushHandle);
    flushHandle = null;
  }
}
