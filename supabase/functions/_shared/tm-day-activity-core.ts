// Daily report to Cliq: "Hours Worked: X Hours; Productive: X%; Unproductive: X%".
// The pure part (no Deno APIs, so it is unit tested). It mirrors how the Track reports count, so the numbers match the app:
//   - hours worked = hours on task timers + computer time the desktop app captured while no timer was running
//     (src/features/timetrack/lib/useTrackedHours.ts); idle captures are not work;
//   - each capture counts for the real gap between captures (median gap, never more than the configured interval)
//     (src/features/timetrack/pages/activity/shared.tsx effectiveIntervals);
//   - a capture's category comes from the CURRENT productivity rules, site rule first, then window title, then app
//     (matchProductivityRule), else the category stored with the capture; "blocked" counts as unproductive;
//   - Productive % and Unproductive % are shares of all non-idle captured time; the rest is neutral.

export interface DayLog { captured_at: string; app_name: string | null; window_title: string | null; url: string | null; productivity_category: string | null }
export interface DayEntry { start_time: string; end_time: string | null }
export interface DayRule { app_name_contains: string | null; title_contains: string | null; category: string; priority: number }
export interface DayActivity { hoursWorked: number; productivePct: number | null; unproductivePct: number | null }

export function captureHost(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

/** Site rule > window-title rule > app rule; lower priority number first. */
export function matchRule(rules: DayRule[], log: Pick<DayLog, 'app_name' | 'window_title' | 'url'>): string | null {
  const app = (log.app_name ?? '').toLowerCase();
  const title = (log.window_title ?? '').toLowerCase();
  const host = (captureHost(log.url) ?? '').toLowerCase();
  const has = (needle: string | null, hay: string) => !!needle && !!hay && hay.includes(needle.toLowerCase());
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  if (host) { const site = sorted.find((r) => !r.title_contains && has(r.app_name_contains, host)); if (site) return site.category; }
  const byTitle = sorted.find((r) => has(r.title_contains, title) && (!r.app_name_contains || has(r.app_name_contains, app)));
  if (byTitle) return byTitle.category;
  const byApp = sorted.find((r) => !r.title_contains && has(r.app_name_contains, app));
  return byApp ? byApp.category : null;
}

/** Minutes one capture stands for: the median gap between this person's captures when that is smaller than the configured interval. */
export function captureMinutes(times: number[], configured: number): number {
  const t = [...times].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < t.length; i++) { const g = (t[i] - t[i - 1]) / 60000; if (g > 0 && g <= configured * 3) gaps.push(g); }
  if (gaps.length < 3) return configured;
  gaps.sort((a, b) => a - b);
  return Math.max(0.5, Math.min(configured, gaps[Math.floor(gaps.length / 2)]));
}

export function dayActivity(opts: { entries: DayEntry[]; logs: DayLog[]; rules: DayRule[]; configuredMinutes?: number | null; now?: number }): DayActivity {
  const now = opts.now ?? Date.now();
  const configured = opts.configuredMinutes && opts.configuredMinutes > 0 ? opts.configuredMinutes : 10;
  const ivs = opts.entries.map((e) => ({ s: Date.parse(e.start_time), e: e.end_time ? Date.parse(e.end_time) : now })).filter((i) => Number.isFinite(i.s) && Number.isFinite(i.e));
  let hours = ivs.reduce((a, i) => a + Math.max(0, i.e - i.s) / 3_600_000, 0);

  const logs = opts.logs.map((l) => ({ ...l, t: Date.parse(l.captured_at) })).filter((l) => Number.isFinite(l.t));
  const minutes = captureMinutes(logs.map((l) => l.t), configured);
  let prod = 0, unprod = 0, total = 0;
  for (const l of logs) {
    const cat = l.productivity_category === 'idle' ? 'idle' : (matchRule(opts.rules, l) ?? l.productivity_category);
    if (cat === 'idle') continue; // away time is not work
    const h = minutes / 60;
    total += h;
    if (cat === 'productive') prod += h;
    else if (cat === 'unproductive' || cat === 'blocked') unprod += h;
    if (!ivs.some((i) => l.t >= i.s && l.t <= i.e)) hours += h; // computer time with no timer running
  }
  return {
    hoursWorked: Math.round(hours * 100) / 100,
    productivePct: total > 0 ? Math.round((prod / total) * 100) : null,
    unproductivePct: total > 0 ? Math.round((unprod / total) * 100) : null,
  };
}

/** "6.5 Hours", "8 Hours", "1 Hour". */
export function hoursText(h: number): string {
  const r = Math.round(h * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return `${s} ${r === 1 ? 'Hour' : 'Hours'}`;
}

/** The line added to the report. Without computer-activity data the percentages say n/a rather than a made-up number. */
export function activityLine(a: DayActivity): string {
  const pct = (v: number | null) => (v === null ? 'n/a' : `${v}%`);
  return `Hours Worked: ${hoursText(a.hoursWorked)}; Productive: ${pct(a.productivePct)}; Unproductive: ${pct(a.unproductivePct)}`;
}

/** The instant a calendar day (YYYY-MM-DD) starts in a time zone. */
export function zonedDayStart(day: string, tz: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const off = (at: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(at));
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - at;
  };
  let t = guess - off(guess);
  t = guess - off(t); // once more: the offset may differ at the real midnight (daylight saving)
  return t;
}
export function zonedDayEnd(day: string, tz: string): number {
  const next = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + 1)).toISOString().slice(0, 10);
  return zonedDayStart(next, tz);
}
/** The calendar day an instant falls on in a time zone. */
export function dayInZone(iso: string, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  return p; // en-CA gives YYYY-MM-DD
}
