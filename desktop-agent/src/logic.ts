// Pure decision logic for the tracker, kept free of Electron and the network so it can be unit tested
// (desktop-agent/test). main.ts and tracker.ts call these.

export type IdleMode = 'pause' | 'track';

/**
 * What to do about idle time.
 *  - 'pause'  (do not track idle time): at the idle limit the timer is paused and the person is told; captures
 *             stop at that limit. Idle time before the limit is still marked idle once past the "away" time.
 *  - 'track'  (keep tracking): never pause and never stop capturing; idle time is just marked idle.
 */
export function idleDecision(mode: IdleMode, idleSec: number, stopAfterMin: number, awayAfterMin: number) {
  const pastLimit = idleSec >= stopAfterMin * 60;
  const awayMark = idleSec >= awayAfterMin * 60;
  return {
    /** pause the running timer (back-dated to when the idle began) and notify */
    pauseTimer: mode === 'pause' && pastLimit,
    /** skip this activity capture entirely */
    skipCapture: mode === 'pause' && pastLimit,
    /** tag this capture as idle instead of running it through the productivity rules */
    markIdle: awayMark,
    /** 'track' mode: show "idle" on the widget while the timer keeps running */
    showIdleOnWidget: mode === 'track' && awayMark,
  };
}

/** "20 minutes", "1 hour", "1 h 05 min" */
export function formatIdle(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} hour${h === 1 ? '' : 's'}` : `${h} h ${String(r).padStart(2, '0')} min`;
}

// ---- Per-task time today -------------------------------------------------------------------------------
export interface TaskToday { date: string; ms: Record<string, number> }

/** Time already worked today on a task, from the saved state (0 when the state is from another day). */
export function taskTodayMs(state: TaskToday | undefined, today: string, taskId: string): number {
  return state && state.date === today ? (state.ms[taskId] ?? 0) : 0;
}

/** Adds a finished work segment to a task's total for today. A new day starts from zero. */
export function addTaskToday(state: TaskToday | undefined, today: string, taskId: string, ms: number): TaskToday {
  const cur = state && state.date === today ? state.ms : {};
  if (!(ms > 0)) return { date: today, ms: { ...cur } };
  return { date: today, ms: { ...cur, [taskId]: (cur[taskId] ?? 0) + ms } };
}

/** Reconcile with the server: per task, keep the larger of the server's total and the local one (an offline segment may not be uploaded yet). */
export function mergeTaskToday(state: TaskToday | undefined, today: string, server: Record<string, number>): TaskToday {
  const local = state && state.date === today ? state.ms : {};
  const merged: Record<string, number> = { ...server };
  for (const [k, v] of Object.entries(local)) merged[k] = Math.max(merged[k] ?? 0, v);
  return { date: today, ms: merged };
}

// ---- Tracking hours ------------------------------------------------------------------------------------
export interface HoursRow { weekday: number; from_time: string; to_time: string }

/** True when `now` is inside the admin's tracking window for its weekday (0 = Monday). No rows = no restriction. */
export function withinTrackingHours(rows: HoursRow[], now: Date): boolean {
  if (rows.length === 0) return true;
  const row = rows.find((r) => r.weekday === (now.getDay() + 6) % 7);
  if (!row) return true;
  const hhmmss = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  return hhmmss >= row.from_time.slice(0, 8) && hhmmss <= row.to_time.slice(0, 8);
}

/**
 * What to call a running task on the widget, tray and notifications. Tracking a project itself uses the project's
 * hidden "General" task, so show the project's name then, not the word "General".
 */
export function taskDisplayName(t: { taskName: string; projectName: string }): string {
  return t.taskName.trim().toLowerCase() === 'general' && t.projectName ? t.projectName : t.taskName;
}
