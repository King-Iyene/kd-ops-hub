// Screenshot file cleanup, pure parts (no Deno APIs, so it can be unit tested).
//
// time_screenshots rows are removed by retention (purge_old_activity_logs cascades from time_activity_logs), by the
// Screenshots page and by employee deletion. The image files live in the private bucket `timetrack-screenshots` and
// used to be left behind. A trigger now queues the file path of every deleted row in storage_delete_queue and the
// timetrack-screenshot-cleaner function removes the files through the Storage API (a direct DELETE on storage.objects is
// blocked by Supabase). Nothing here decides what is "past retention": only files whose row is already gone are ever
// queued, and the cleaner re-checks that no row references the path before it removes anything.

export const SCREENSHOT_BUCKET = 'timetrack-screenshots';
export const DEFAULT_MAX_PER_RUN = 1000;
export const HARD_MAX_PER_RUN = 5000;
export const STORAGE_BATCH = 100;
export const MAX_ATTEMPTS = 5;

export interface QueueRow { id: number; path: string; attempts?: number }

/** Paths the agent writes: `<employee uuid>/<epoch ms>.jpg`. Anything else (empty, '..', absolute, a different shape) is never removed. */
const SAFE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i;
export function isSafeScreenshotPath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 300 && SAFE_PATH.test(path) && !path.includes('..');
}

export function clampLimit(requested: unknown, fallback: number = DEFAULT_MAX_PER_RUN, hardMax: number = HARD_MAX_PER_RUN): number {
  const n = typeof requested === 'number' ? requested : Number(requested);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), hardMax);
}

export function chunk<T>(items: T[], size: number = STORAGE_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface Plan {
  /** queue rows whose file should be removed from storage */
  remove: QueueRow[];
  /** queue rows to just drop: unsafe path, or a row still references the file */
  drop: QueueRow[];
}

/** Decide, for a batch of queued paths, which to remove and which to drop untouched. `stillReferenced` = paths a time_screenshots row still points at. */
export function planCleanup(queue: QueueRow[], stillReferenced: Set<string>): Plan {
  const remove: QueueRow[] = [];
  const drop: QueueRow[] = [];
  const seen = new Set<string>();
  for (const q of queue) {
    if (!isSafeScreenshotPath(q.path) || stillReferenced.has(q.path)) { drop.push(q); continue; }
    if (seen.has(q.path)) { drop.push(q); continue; } // duplicate queue row for the same file: one removal is enough
    seen.add(q.path);
    remove.push(q);
  }
  return { remove, drop };
}
