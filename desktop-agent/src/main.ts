import { app, BrowserWindow, ipcMain, Tray, Menu, screen, Notification, shell, powerMonitor } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';

// dotenv is a dev-only convenience for `npm start` — it loads a local .env
// file into process.env so supabaseClient.ts (required below) can pick up
// local Supabase credentials without touching the build-time-baked
// generated-config.ts. It is deliberately NOT listed in package.json
// (neither "dependencies" nor "devDependencies") and must never run in a
// packaged build: electron-builder only bundles what package.json declares,
// so a prior unconditional top-level `import 'dotenv/config'` here shipped
// fine from every local machine that happened to have dotenv sitting in
// node_modules already, then crashed every packaged install on first launch
// with "Cannot find module 'dotenv/config'" the moment it ran on a machine
// with a clean, production-only node_modules tree. Guarded on
// `!app.isPackaged` and wrapped in try/catch so a missing dotenv is a
// silent no-op both in production (expected) and for any dev machine that
// hasn't `npm install`ed it locally.
if (!app.isPackaged) {
  try {
    require('dotenv/config');
  } catch {
    // Not installed locally - fine, generated-config.ts / an explicitly
    // exported env var still works for `npm start`.
  }
}

import { supabase, configError, supabaseUrl } from './supabaseClient';
import { startTracking, stopTracking, setTimerRunningProvider, captureNow, getStopWhenUnusedMinutes } from './tracker';
import { startAutoFlush, flushQueue, queueLength, setAuthReady } from './offlineQueue';
import {
  fetchPickableTasks,
  fetchSuggestedTasks,
  fetchAllProjects,
  createTask,
  getActiveTimer,
  switchTimer,
  resumeTask,
  stopActiveTimer,
  type ActiveTimer,
  type PickableTask,
  type PickableProject,
} from './taskTimer';

// Single-instance lock: without this, every launch (a second double-click of
// the installed app, an "open at login" entry firing alongside a manual
// launch, etc.) spins up a FULLY SEPARATE process — its own tray icon, its
// own floating widget, and critically its own tracker.ts polling loop
// independently writing activity rows to Supabase. Nothing here ever
// prevented that, and it was invisible until there was a reason to look: an
// employee saw three stacked "Tracking" widget pills with different elapsed
// times, meaning three live agent processes had been running for the same
// person simultaneously, each tracking and writing on its own. This claims
// the lock as the very first thing the app does (before window/tray
// creation, before app.whenReady()), so a second launch attempt quits
// immediately instead of becoming a second independent tracker.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // process.exit (not app.quit) so NOTHING further in this module runs —
  // no window, no tray, no tracker poll loop gets created in this second
  // process before it goes away. No windows/tray exist yet at this point in
  // the file, so there is nothing for Electron's normal graceful-quit
  // sequence to clean up; an immediate process exit is the correct and safe
  // way to bail out of a losing instance.
  process.exit(0);
}

// Runs only in the single surviving instance: a later launch attempt (the
// one that just lost the lock above, in its own separate process) forwards
// here instead of starting its own window/tray/tracker. Bring the existing
// window forward rather than silently doing nothing, so "I double-clicked
// the app again" still feels like it did something.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Auto-update: electron-builder's `publish: { provider: 'github', ... }`
// config (package.json) makes it emit latest.yml / latest-mac.yml /
// latest-linux.yml alongside each release's installers — electron-updater
// reads those to check if a newer version is on the GitHub release this app
// was built to point at. Nobody has to manually reinstall on every machine
// again; a new tagged release (the same human-approved release flow as
// always) is enough for every running agent to pick it up on its own.
// autoUpdater.checkForUpdatesAndNotify() downloads silently in the
// background and shows a native OS notification once it's ready to install
// on next quit — never interrupts an active tracking session.
function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (err) => {
    // Non-fatal by design — an offline machine or a GitHub hiccup must never
    // crash or block the agent; it just tries again next launch.
    console.error('[auto-update] check failed:', err?.message ?? err);
  });
  autoUpdater.on('update-downloaded', (info) => {
    new Notification({
      title: 'KD Ops Time Tracker',
      body: `Version ${info.version} is ready. It installs when you quit and reopen the tracker (tray menu, Exit).`,
    }).show();
  });
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Same reasoning as the .on('error', ...) handler above.
  });
  // The tracker stays open for days, so a check only at launch meant people never got new versions.
  // Look again every 2 hours.
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => { /* offline or GitHub hiccup: try again next time */ });
  }, 2 * 60 * 60 * 1000);
}

// Reports this install into time_agent_settings (app_version, last_login_at,
// login_count) so the web app's User Statistics page — which reads those
// columns — has something real to show instead of permanent nulls. Called
// once per sign-in / session-restore, not on every settings poll tick, so
// login_count means what it says. Best-effort: a failure here must never
// block sign-in or tracking.
async function reportCheckin() {
  if (!supabase) return;
  try {
    await supabase.rpc('time_agent_checkin', { p_app_version: app.getVersion() });
  } catch {
    // Non-fatal — the agent still tracks even if this one upsert fails.
  }
}

interface CachedSettings { is_enabled: boolean; capture_interval_minutes: number; screenshots_enabled: boolean; blur_screenshots: boolean }
interface PickerCache { tasks: PickableTask[]; suggested: PickableTask[]; projects: PickableProject[] }

// Beyond the login token this keeps what the app needs to keep working with
// NO internet: who is signed in, the last tracking settings the server gave
// us, and the last project/task list (so the picker still works offline).
const store = new Store<{
  refresh_token?: string;
  widget_visible?: boolean;
  employee_id?: string;
  email?: string;
  settings?: CachedSettings;
  picker?: PickerCache;
  /** Last time this app knew a task timer was running (30s heartbeat), to recover from a crash or power loss. */
  timerBeat?: { entryId: string; at: number };
  /** Time already worked today on each task (ms), so a task picks up where it left off instead of restarting at 0. */
  taskToday?: { date: string; ms: Record<string, number> };
}>();

let mainWindow: BrowserWindow | null = null;
// Set by the 'before-quit' handler below so mainWindow's 'close' interceptor
// (createWindow) knows the difference between the user closing the window
// (hide it, stay in the tray) and the app actually quitting (let it close).
let isQuitting = false;
let widgetWindow: BrowserWindow | null = null;
let taskPickerWindow: BrowserWindow | null = null;

// Guards every webContents.send() in this file. Two real crashes this
// protects against, both hit live:
// 1. taskPickerWindow closes on blur, so any handler that does `await` work
//    (task-picker-ready fetching tasks) before calling
//    taskPickerWindow.webContents.send(...) can find the window already
//    destroyed by the time the await resolves — .send() throws
//    "Object has been destroyed" on a destroyed webContents even though the
//    JS variable itself isn't null yet (the 'closed' event that nulls it
//    fires on a later tick). Worse, the old code's catch block called
//    .send() again as its fallback, which threw the SAME error a second
//    time, uncaught, crashing the whole app to Electron's fatal-error
//    dialog — confirmed exactly matching a live crash report.
// 2. mainWindow is deliberately never closed-quit (see window-all-closed
//    below — the app stays alive in the tray after the user closes the
//    window) and is never nulled on close either, so mainWindow becomes a
//    stale destroyed BrowserWindow the moment the user closes it. Every
//    later mainWindow?.webContents.send(...) — including the 60-second
//    settings poll in pollSettingsAndTrack — would hit the identical crash
//    the first time it ran after that, independent of anything task-picker
//    related.
function safeSend(win: BrowserWindow | null, channel: string, payload?: unknown): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}
let tray: Tray | null = null;
let pollHandle: ReturnType<typeof setInterval> | null = null;
// Session-local (not persisted): when the current tracking run started, so
// the widget can show a live elapsed timer. Reset to null whenever tracking
// stops, so re-enabling starts the clock fresh rather than carrying over a
// stale start time across a pause.
let trackingStartedAt: number | null = null;
// The employee currently signed in — needed outside pollSettingsAndTrack's
// own closure for the task-timer IPC handlers below, which can fire any time
// after sign-in, not just during the settings poll.
let currentEmployeeId: string | null = null;
// Mirrors the one open (end_time IS NULL) time_entries row for this employee,
// if any — loaded on sign-in/restore and kept in sync by switchTimer/stopActiveTimer.
let activeTimer: ActiveTimer | null = null;
// Set by "Pause": the task that was running when paused, remembered so
// "Resume" can hand it straight back to resumeTask() without reopening the
// picker. Cleared whenever a different task is explicitly chosen, or "No
// Task" is chosen, or it's actually resumed. Lives only in memory — quitting
// the app and reopening loses a pending pause, same as most trackers.
let pausedTask: ActiveTimer | null = null;
// User-initiated pause of the AUTOMATIC activity tracker (the widget's Pause
// button when no manual task is running, or Pause on a running task, which
// pauses everything like TimeCamp). Session-local; the settings poll honours
// it so it doesn't silently restart tracking every 60s.
let autoPaused = false;
let pausedAtMs: number | null = null; // when the current task was paused, so the widget can freeze its clock
let runSettingsCheck: (() => Promise<void>) | null = null;

// ---- Per-task time today ---------------------------------------------------------------------
// The widget shows the task's total for TODAY: what was already worked on it earlier today plus the
// run that is going now. So pause, stop, switch away and come back, or restart the app, and the clock
// carries on from where it was. Segments are added locally the moment they end (works offline) and
// reconciled with the server whenever it is reachable.
const dayKey = () => new Date().toDateString();
function taskTodayMs(taskId: string): number {
  const s = store.get('taskToday');
  return s && s.date === dayKey() ? (s.ms[taskId] ?? 0) : 0;
}
function addTaskToday(taskId: string, ms: number) {
  if (!(ms > 0)) return;
  const s = store.get('taskToday');
  const cur = s && s.date === dayKey() ? s.ms : {};
  store.set('taskToday', { date: dayKey(), ms: { ...cur, [taskId]: (cur[taskId] ?? 0) + ms } });
}
function addSegment(t: ActiveTimer, endMs = Date.now()) {
  addTaskToday(t.taskId, Math.max(0, endMs - new Date(t.startTime).getTime()));
}
async function syncTaskToday() {
  if (!supabase || !currentEmployeeId) return;
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('time_entries')
      .select('task_id, start_time, end_time')
      .eq('employee_id', currentEmployeeId)
      .gte('start_time', dayStart.toISOString())
      .not('end_time', 'is', null);
    if (error || !data) return;
    const merged: Record<string, number> = {};
    for (const r of data as { task_id: string; start_time: string; end_time: string }[]) {
      merged[r.task_id] = (merged[r.task_id] ?? 0) + (new Date(r.end_time).getTime() - new Date(r.start_time).getTime());
    }
    // keep whichever is larger per task: the server may not have an offline segment yet
    const s = store.get('taskToday');
    const local = s && s.date === dayKey() ? s.ms : {};
    for (const [k, v] of Object.entries(local)) merged[k] = Math.max(merged[k] ?? 0, v);
    store.set('taskToday', { date: dayKey(), ms: merged });
    sendWidgetStatus(trackingStartedAt != null);
  } catch {
    // offline: the local totals keep the clock right
  }
}

async function setAutoPaused(paused: boolean) {
  autoPaused = paused;
  if (paused) stopTracking();
  // Update the widget and tray FIRST. The settings check below talks to the server,
  // which can take seconds to fail on a bad connection; the UI must not wait for it.
  rebuildTrayMenu();
  sendWidgetStatus(trackingStartedAt != null);
  if (!paused && runSettingsCheck) await runSettingsCheck();
}

type Restored = { kind: 'online' | 'offline'; userId: string; email: string } | null;

/** Brings the saved login back. Three outcomes, deliberately different:
 *  - online:  the server accepted the token (and gave us a fresh one, saved).
 *  - offline: we could not REACH the server (no internet, outage). The login
 *             is kept and the app runs from the cached identity; it syncs
 *             when the connection returns. Before this, ANY failure, even
 *             being offline, deleted the saved login and signed the person out.
 *  - null:    the server explicitly rejected the token, so it really is
 *             invalid and the person has to sign in again. */
/** Quick yes/no: can we reach the server right now? Any HTTP answer counts as
 * reachable. Needed because the login library retries a dead connection for
 * ~40s while holding an internal lock that every other request waits on, which
 * froze the whole app on start-up whenever there was no internet. */
async function isServerReachable(): Promise<boolean> {
  try {
    await fetch(`${supabaseUrl}/auth/v1/health`, { signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
}

async function restoreSession(): Promise<Restored> {
  if (!supabase) return null;
  const refreshToken = store.get('refresh_token');
  if (!refreshToken) return null;
  if (!(await isServerReachable())) {
    const cachedId = store.get('employee_id');
    return cachedId ? { kind: 'offline', userId: cachedId, email: store.get('email') ?? '' } : null;
  }
  try {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (data.session) {
      store.set('refresh_token', data.session.refresh_token);
      store.set('employee_id', data.session.user.id);
      store.set('email', data.session.user.email ?? '');
      return { kind: 'online', userId: data.session.user.id, email: data.session.user.email ?? '' };
    }
    const status = (error as { status?: number } | null)?.status;
    if (status === 400 || status === 401 || status === 403) {
      // Only give up if the saved token is still the one that was just rejected.
      // If another refresh already saved a newer token, that one is the live login.
      if (store.get('refresh_token') !== refreshToken) {
        const userId = store.get('employee_id');
        if (userId) return { kind: 'offline', userId, email: store.get('email') ?? '' };
      }
      store.delete('refresh_token');
      return null;
    }
  } catch {
    // network failure: fall through to the offline path
  }
  const userId = store.get('employee_id');
  if (userId) return { kind: 'offline', userId, email: store.get('email') ?? '' };
  return null;
}

let reconnectHandle: ReturnType<typeof setInterval> | null = null;

/** Started when the app launched without a connection. Retries the login every
 * 15s; once it works, writes go straight to the server again and everything
 * queued while offline is uploaded. */
// True once the server has accepted our login in this run (sign-in, or the saved
// login restored). Until then we are running from the cached identity.
let sessionActive = false;

let reconnecting = false; // the login library retries a dead connection for a long time; never overlap attempts

async function attemptReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  try {
    const r = await restoreSession();
    if (r?.kind === 'online') {
      if (reconnectHandle) clearInterval(reconnectHandle);
      reconnectHandle = null;
      sessionActive = true;
      setAuthReady(true);
      if (supabase) void flushQueue(supabase);
      void reportCheckin();
      void refreshActiveTimer();
      if (runSettingsCheck) void runSettingsCheck(); // pick up the server's real settings now that we are logged in
      announceSignedIn(r.email);
    } else if (r === null) {
      if (reconnectHandle) clearInterval(reconnectHandle);
      reconnectHandle = null;
      new Notification({ title: 'KD Ops Time Tracker', body: 'Your login expired. Please sign in again; offline tracking is kept and will upload.' }).show();
      safeSend(mainWindow, 'signed-out');
      mainWindow?.show();
    }
  } finally {
    reconnecting = false;
  }
}

function startReconnectLoop() {
  if (reconnectHandle) return;
  reconnectHandle = setInterval(() => void attemptReconnect(), 15_000);
  void attemptReconnect(); // first try right away
}

/** Tells the window who is signed in, whether or not it has finished loading yet. */
function announceSignedIn(label: string) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => safeSend(mainWindow, 'signed-in', label));
  } else {
    safeSend(mainWindow, 'signed-in', label);
  }
}

/** Shows the main window once it has rendered (avoids a blank flash). */
function showMainWhenReady() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.webContents.isLoading()) mainWindow.once('ready-to-show', () => mainWindow?.show());
  else mainWindow.show();
}

function beginSession(r: NonNullable<Restored>) {
  currentEmployeeId = r.userId;
  const label = r.kind === 'offline' ? r.email + ' (offline - will sync when connected)' : r.email;
  announceSignedIn(label);
  sessionActive = r.kind === 'online';
  setAuthReady(r.kind === 'online');
  void pollSettingsAndTrack(r.userId);
  if (r.kind === 'online') {
    void reportCheckin();
    void refreshActiveTimer();
  } else {
    startReconnectLoop();
  }
}

async function pollSettingsAndTrack(employeeId: string) {
  if (!supabase) return;
  const client = supabase;
  const check = async () => {
    // Forces the login token to refresh when near expiry; the
    // onAuthStateChange listener (whenReady) saves the rotated token.
    let fresh: CachedSettings | null = null;
    let error: unknown = null;
    if (sessionActive) {
      try { await client.auth.getSession(); } catch { /* offline: fine */ }
      const res = await client
        .from('time_agent_settings')
        .select('is_enabled, capture_interval_minutes, screenshots_enabled, blur_screenshots')
        .eq('employee_id', employeeId)
        .maybeSingle();
      fresh = (res.data as CachedSettings | null) ?? null;
      error = res.error;
    } else {
      // Started from the saved identity and not logged in to the server yet. An
      // anonymous query would come back EMPTY with no error (row-level security
      // hides the row), which used to be misread as "tracking disabled". Treat it
      // as unknown and use the cached settings instead.
      error = new Error('login not restored yet');
    }
    let data: CachedSettings | null = fresh;
    if (!error && fresh) {
      store.set('settings', fresh as CachedSettings);
    } else if (error) {
      // Could not reach the server. That is NOT "tracking disabled": keep
      // going on the last settings we were given instead of stopping.
      const cached = store.get('settings');
      if (cached) data = cached;
    }
    if (!data || !data.is_enabled) {
      stopTracking();
      trackingStartedAt = null;
      safeSend(mainWindow, 'agent-status', { tracking: false });
      applyWidgetVisibility();
      return;
    }
    if (trackingStartedAt == null) trackingStartedAt = Date.now();
    if (autoPaused) {
      stopTracking();
      safeSend(mainWindow, 'agent-status', { tracking: true });
      applyWidgetVisibility();
      return;
    }
    startTracking(client, employeeId, data);
    safeSend(mainWindow, 'agent-status', { tracking: true });
    applyWidgetVisibility();
  };
  runSettingsCheck = check;
  await check();
  await refreshActiveTimer(); // pick up a timer already running (e.g. started from the web app)
  // Retries anything that got queued locally because the network was down
  // when it was written (activity log ticks, timer start/stop/pause) —
  // tries immediately, then every 30s, so a dropped connection never means
  // dropped tracking data.
  startAutoFlush(client);
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(() => {
    void check();
    void refreshActiveTimer(); // keeps the tray/widget in sync if the timer was started/stopped from the web app
  }, 60_000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 420,
    resizable: false,
    // Hidden by default, like TimeCamp: once signed in there is no window, only the
    // floating widget and the tray menu. It is shown when sign-in is needed, or from
    // the tray's "Settings…" / the widget's "⋯" (that is where Sign out lives).
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    if (trackingStartedAt != null) safeSend(mainWindow, 'agent-status', { tracking: true });
  });
  // This is a tray-resident background tracker (see window-all-closed below),
  // so "closing" this window is meant to mean "hide it", not "destroy it" —
  // otherwise mainWindow becomes a stale destroyed BrowserWindow the moment
  // the user closes it (via the window's own X button, Alt+F4, etc.), and
  // EVERY later reference to it — the tray's "Show", the widget's "⋯" button
  // (open-main-window), the 60-second settings poll's agent-status send —
  // throws "Object has been destroyed", confirmed as a real live crash on
  // exactly this path (closing the window, then clicking the widget's "⋯").
  // preventDefault + hide() keeps the one BrowserWindow instance alive for
  // the whole life of the app, so "Show" (tray or widget) always has a real,
  // un-destroyed window to bring back.
  mainWindow.on('close', (event) => {
    if (isQuitting) return; // let the real app.quit() path actually close it
    event.preventDefault();
    mainWindow?.hide();
  });
}

const WIDGET_WIDTH = 274; // wide enough for pause + stop + open buttons alongside the label
const WIDGET_HEIGHT = 56;

// Floating always-on-top status pill — the "so they know it's active" piece
// TimeCamp's own desktop app ships as its Task Widget. We default to showing
// it (same as TimeCamp's first-run default) and let the tray menu toggle it.
function createWidgetWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workArea;
  widgetWindow = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    x: sw - WIDGET_WIDTH - 24,
    y: sh - WIDGET_HEIGHT - 24,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false, // the card itself draws its own shadow via CSS
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-widget.js'), contextIsolation: true },
  });
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widgetWindow.loadFile(path.join(__dirname, '../src/renderer/widget.html'));
  // Status sent before the page finished loading is lost (it happens when there is
  // no network delay to slow the first send down), so resend once it is ready.
  widgetWindow.webContents.on('did-finish-load', () => sendWidgetStatus(trackingStartedAt != null));
  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
}

function sendWidgetStatus(tracking: boolean) {
  safeSend(widgetWindow, 'widget-status', {
    tracking,
    idle: autoPaused, // per-tick idle isn't plumbed out of tracker.ts; this reflects a user pause
    autoPaused,
    startedAt: trackingStartedAt,
    task: activeTimer ? { name: activeTimer.taskName, project: activeTimer.projectName, startedAt: new Date(activeTimer.startTime).getTime(), baseMs: taskTodayMs(activeTimer.taskId) } : null,
    pausedTask:
      !activeTimer && pausedTask
        ? {
            name: pausedTask.taskName,
            project: pausedTask.projectName,
            // Time the task had run when it was paused (frozen on the widget).
            elapsedMs: taskTodayMs(pausedTask.taskId), // includes the segment that just ended
          }
        : null,
  });
}

// --- Manual task timer (tray "Start a Task…") ---------------------------
// Separate from the automatic window/activity tracker above: this is the
// TimeCamp-style "what am I working on" timer the user picks explicitly,
// writing directly to time_entries — see taskTimer.ts for why it shares that
// table with the web app's own timer instead of inventing a parallel one.

const TASK_PICKER_WIDTH = 360;
const TASK_PICKER_HEIGHT = 420;

const WEB_APP_TIME_URL = 'https://ops.kdsquares.com/timetrack/time';

function createTaskPickerWindow(startInCreate = false) {
  if (taskPickerWindow) {
    if (startInCreate) {
      // Existing picker is in browse mode — reopen straight into the create form.
      taskPickerWindow.removeAllListeners('closed');
      taskPickerWindow.destroy();
      taskPickerWindow = null;
    } else {
      taskPickerWindow.show();
      taskPickerWindow.focus();
      return;
    }
  }
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workArea;
  taskPickerWindow = new BrowserWindow({
    width: TASK_PICKER_WIDTH,
    height: TASK_PICKER_HEIGHT,
    x: sw - TASK_PICKER_WIDTH - 24,
    y: sh - TASK_PICKER_HEIGHT - 96,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload-task-picker.js'), contextIsolation: true },
  });
  taskPickerWindow.loadFile(
    path.join(__dirname, '../src/renderer/task-picker.html'),
    startInCreate ? { query: { create: '1' } } : undefined,
  );
  taskPickerWindow.on('blur', () => taskPickerWindow?.close());
  taskPickerWindow.on('closed', () => {
    taskPickerWindow = null;
  });
}

// --- Pause / Stop / Resume: shared by the tray menu and the widget/picker's
// IPC handlers below, so there's exactly one place each does its actual work. ---

// --- Keeping the tracked time honest -----------------------------------------------
// A timer must not keep counting when nobody is working. It stops (and the entry ends at
// the moment work really stopped) when: the app quits, the computer sleeps, the computer
// has been unused for the admin policy time, or the app died (crash / power loss) while
// the timer ran and is found still open at the next start.

const STALE_TIMER_MS = 2 * 60 * 1000; // open entry + last heartbeat older than this at start-up = app was not running

async function stopTimerAt(endMs: number, reason: 'quit' | 'idle' | 'sleep' | 'stale'): Promise<void> {
  if (!supabase || !activeTimer) return;
  const t = activeTimer;
  const end = Math.max(endMs, new Date(t.startTime).getTime()); // never before it started
  addSegment(t, end);
  activeTimer = null;
  pausedTask = null;
  store.delete('timerBeat');
  rebuildTrayMenu();
  sendWidgetStatus(trackingStartedAt != null);
  try {
    await stopActiveTimer(supabase, t.entryId, new Date(end).toISOString());
  } catch (err) {
    console.error('[timer] could not close the entry:', err);
  }
  if (reason === 'idle' || reason === 'sleep') {
    const hhmm = new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    new Notification({
      title: 'KD Ops Time Tracker',
      body: reason === 'idle' ? `Timer stopped: no activity since ${hhmm}.` : `Timer stopped when the computer went to sleep (${hhmm}).`,
    }).show();
  }
}

/** Every 30s while a timer runs: remember we are alive, and stop it if the computer has been unused too long. */
function startTimerWatchdog() {
  setInterval(() => {
    if (!activeTimer) return;
    store.set('timerBeat', { entryId: activeTimer.entryId, at: Date.now() });
    const idleSec = powerMonitor.getSystemIdleTime();
    if (idleSec >= getStopWhenUnusedMinutes() * 60) void stopTimerAt(Date.now() - idleSec * 1000, 'idle');
  }, 30_000);
  powerMonitor.on('suspend', () => void stopTimerAt(Date.now(), 'sleep'));
}

async function pauseActiveTask() {
  if (!supabase || !activeTimer) return;
  const toPause = activeTimer;
  // Optimistic: the widget updates at once. The write goes out (or is queued
  // when offline) in the background, so a slow or dead connection never makes
  // the Pause button feel stuck.
  addSegment(toPause);
  pausedTask = toPause;
  pausedAtMs = Date.now();
  activeTimer = null;
  void stopActiveTimer(supabase, toPause.entryId).catch((err) => console.error('[pause] write failed:', err));
  await setAutoPaused(true); // Pause means pause everything, like TimeCamp
}

async function stopActiveTask() {
  if (!supabase || !activeTimer) return;
  const toStop = activeTimer;
  addSegment(toStop);
  activeTimer = null;
  void stopActiveTimer(supabase, toStop.entryId).catch((err) => console.error('[stop] write failed:', err));
  pausedTask = null; // an explicit Stop clears any pending pause too, not just the running entry
  await setAutoPaused(false); // Stop ends the session; automatic tracking carries on
}

async function resumePausedTask() {
  if (!supabase || !currentEmployeeId || !pausedTask) return;
  const toResume = pausedTask;
  try {
    activeTimer = await resumeTask(supabase, currentEmployeeId, {
      taskId: toResume.taskId,
      taskName: toResume.taskName,
      projectId: toResume.projectId,
      projectName: toResume.projectName,
      clientName: toResume.clientName,
      searchLabel: '', // unused by resumeTask/switchTimer's own logic
    });
    pausedTask = null;
    await setAutoPaused(false);
    captureNow();
    return;
  } catch {
    // Non-fatal — pausedTask stays set so the user can just try Resume again.
  }
  rebuildTrayMenu();
  sendWidgetStatus(trackingStartedAt != null);
}

async function refreshActiveTimer() {
  if (!supabase || !currentEmployeeId) return;
  try {
    activeTimer = await getActiveTimer(supabase, currentEmployeeId);
    // Something is now actually running server-side (started here, from the
    // web app, or resumed some other way) — whatever was locally "paused"
    // before is superseded, so don't leave it to resurface once this stops.
    if (activeTimer) pausedTask = null;
    const beat = store.get('timerBeat');
    if (activeTimer && beat && beat.entryId === activeTimer.entryId && Date.now() - beat.at > STALE_TIMER_MS) {
      // The entry is still open but this app has not been running for a while (crash,
      // power loss, killed). End it when we last knew it was running, not now.
      await stopTimerAt(beat.at, 'stale');
    }
  } catch {
    // Non-fatal — widget just shows no task this tick; next poll retries.
  }
  rebuildTrayMenu();
  sendWidgetStatus(trackingStartedAt != null);
  void syncTaskToday();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const taskItems = activeTimer
    ? [
        {
          label: `Pause: ${activeTimer.taskName}`,
          click: () => pauseActiveTask(),
        },
        {
          label: `Stop: ${activeTimer.taskName}`,
          click: () => stopActiveTask(),
        },
        { label: 'Switch Task…', click: () => createTaskPickerWindow() },
      ]
    : pausedTask
      ? [
          { label: `Resume: ${pausedTask.taskName}`, click: () => resumePausedTask() },
          { label: 'Start a Different Task…', click: () => createTaskPickerWindow() },
        ]
      : [
          { label: 'Start a Task…', click: () => createTaskPickerWindow() },
          {
            label: autoPaused ? 'Resume tracking' : 'Pause tracking',
            click: () => void setAutoPaused(!autoPaused),
          },
        ];
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Settings…', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    ...taskItems,
    { label: 'Create New Task…', click: () => createTaskPickerWindow(true) },
    { type: 'separator' },
    { label: 'Open in Browser', click: () => void shell.openExternal(WEB_APP_TIME_URL) },
    { type: 'separator' },
    {
      label: 'Show Task Widget',
      type: 'checkbox',
      checked: widgetPreferenceEnabled(),
      click: (menuItem) => {
        store.set('widget_visible', menuItem.checked);
        applyWidgetVisibility();
      },
    },
    {
      label: 'Force Synchronization',
      click: () => void forceSync(),
    },
    { type: 'separator' },
    { label: 'Exit', click: () => app.quit() },
  ]));
}

/** Manual retry of whatever's sitting in the offline queue (activity-log
 * ticks and/or timer start/stop/pause that couldn't reach the server when
 * they happened), for when someone doesn't want to wait for the 30s
 * auto-retry — e.g. right after reconnecting to wifi. Matches the reference
 * app's "Force Synchronization" tray item. */
async function forceSync() {
  if (!supabase) return;
  const before = queueLength();
  if (before === 0) {
    new Notification({ title: 'KD Ops Time Tracker', body: 'Already up to date — nothing queued.' }).show();
    return;
  }
  await flushQueue(supabase);
  const after = queueLength();
  if (after === 0) {
    new Notification({ title: 'KD Ops Time Tracker', body: `Synced ${before} queued item(s).` }).show();
  } else {
    new Notification({
      title: 'KD Ops Time Tracker',
      body: `Still offline — ${after} item(s) remain queued, will keep retrying.`,
    }).show();
  }
}

function widgetPreferenceEnabled() {
  return store.get('widget_visible', true);
}

function applyWidgetVisibility() {
  if (!widgetWindow) return;
  if (trackingStartedAt != null && widgetPreferenceEnabled()) {
    widgetWindow.showInactive(); // never steals focus from whatever the user is doing
    sendWidgetStatus(true);
  } else {
    widgetWindow.hide();
  }
}

app.whenReady().then(async () => {
  // Capture only while a task timer runs (and tracking isn't paused), per the
  // "track only when timer running" policy (default on, same as Hubstaff / TimeCamp).
  setTimerRunningProvider(() => activeTimer !== null && !autoPaused);
  startTimerWatchdog();
  createWindow();
  createWidgetWindow();
  tray = new Tray(path.join(__dirname, '../src/renderer/tray-icon.png'));
  rebuildTrayMenu();
  tray.setToolTip('KD Ops Time Tracker');

  initAutoUpdater();

  if (configError) {
    mainWindow?.webContents.once('did-finish-load', () => safeSend(mainWindow, 'config-error', configError));
    showMainWhenReady(); // a build problem must be visible
    return;
  }

  // The login token rotates whenever it refreshes (about hourly). Save every
  // new one: persistSession is off, so without this the saved token went stale
  // after an hour and the next launch could no longer sign in.
  supabase?.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_OUT' && session?.refresh_token) store.set('refresh_token', session.refresh_token);
  });

  // Start straight away from the saved identity instead of waiting on the
  // network: tracking, the widget and the queue work immediately (even with no
  // internet), and the login is re-checked in the background. If it succeeds
  // the app switches to online and uploads anything queued meanwhile.
  const cachedUserId = store.get('employee_id');
  if (store.get('refresh_token') && cachedUserId) {
    // Already signed in: stay out of the way (no window), just the widget and tray.
    beginSession({ kind: 'offline', userId: cachedUserId, email: store.get('email') ?? '' });
  } else {
    const restored = await restoreSession();
    if (restored) beginSession(restored);
    else showMainWhenReady(); // nobody signed in: show the sign-in window
  }
});

// Opens the same picker the tray's "Start a Task…" item opens, but from a
// click on the floating widget itself (the task name / "No Task" label) —
// so changing task doesn't require finding the tray icon and right-clicking.
ipcMain.on('open-task-picker', () => {
  createTaskPickerWindow();
});

ipcMain.on('task-picker-ready', async () => {
  if (!supabase || !taskPickerWindow) return;
  // Show the last known list instantly, then replace it with fresh data. Waiting
  // on the network first left the picker (and the Create form) empty, or stuck on
  // "no projects", for as long as a slow or dead connection took to answer.
  const cachedNow = store.get('picker');
  if (cachedNow) safeSend(taskPickerWindow, 'task-picker-data', cachedNow);
  try {
    const [tasks, suggested, projects] = await Promise.all([
      fetchPickableTasks(supabase),
      currentEmployeeId ? fetchSuggestedTasks(supabase, currentEmployeeId) : Promise.resolve([]),
      fetchAllProjects(supabase),
    ]);
    // taskPickerWindow closes on blur, so the user clicking away during this
    // await is routine, not an edge case — safeSend is load-bearing here,
    // not defensive decoration (see the comment on its definition).
    store.set('picker', { tasks, suggested, projects });
    safeSend(taskPickerWindow, 'task-picker-data', { tasks, suggested, projects });
  } catch {
    // Offline: the cached list (if any) is already on screen; only fall back to an
    // empty list when there was nothing cached to show.
    if (!cachedNow) safeSend(taskPickerWindow, 'task-picker-data', { tasks: [], suggested: [], projects: [] });
  }
});

/** Click a project to track the project itself: time goes on its "General" task, made the first time it is needed. */
ipcMain.on('task-picker-choose-project', async (_e, p: { projectId: string; projectName: string; clientName: string | null }) => {
  taskPickerWindow?.close();
  if (!supabase || !currentEmployeeId) return;
  try {
    const { data } = await supabase.from('time_tasks').select('id, name').eq('project_id', p.projectId).ilike('name', 'General').limit(1);
    const found = data?.[0] as { id: string; name: string } | undefined;
    const task: PickableTask = found
      ? { taskId: found.id, taskName: found.name, projectId: p.projectId, projectName: p.projectName, clientName: p.clientName, searchLabel: '' }
      : await createTask(supabase, currentEmployeeId, p.projectId, p.projectName, p.clientName, 'General');
    const previous = activeTimer;
    activeTimer = await switchTimer(supabase, currentEmployeeId, task, activeTimer);
    if (previous && previous.entryId !== activeTimer?.entryId) addSegment(previous);
    pausedTask = null;
    if (autoPaused) await setAutoPaused(false);
    captureNow();
  } catch {
    // offline or no permission: the picker simply does not start a timer; try again when connected
  }
  rebuildTrayMenu();
  sendWidgetStatus(trackingStartedAt != null);
});

ipcMain.on('task-picker-choose', async (_e, task: PickableTask) => {
  taskPickerWindow?.close();
  if (!supabase || !currentEmployeeId) return;
  try {
    const previous = activeTimer;
    activeTimer = await switchTimer(supabase, currentEmployeeId, task, activeTimer);
    if (previous && previous.entryId !== activeTimer?.entryId) addSegment(previous);
    pausedTask = null; // explicitly picking a task overrides whatever was paused
    if (autoPaused) await setAutoPaused(false); // starting a task resumes tracking, like TimeCamp
    captureNow(); // first capture right as the timer starts
  } catch {
    // Non-fatal — tray menu/widget simply won't reflect a switch that failed
    // server-side; refreshActiveTimer's next poll will reconcile either way.
  }
  rebuildTrayMenu();
  sendWidgetStatus(trackingStartedAt != null);
});

ipcMain.on('task-picker-choose-none', async () => {
  taskPickerWindow?.close();
  await stopActiveTask();
});

ipcMain.on('task-picker-cancel', () => {
  taskPickerWindow?.close();
});

// Inline "Create task…": subject to time_tasks' own RLS (manage_tasks
// capability, or being that project's manager) — a regular employee
// creating a task under a project they don't manage gets a real permission
// error back, surfaced to the picker rather than swallowed, since silently
// failing here would look like the button just doesn't work.
ipcMain.handle(
  'task-picker-create-task',
  async (
    _e,
    args: { projectId: string; projectName: string; clientName: string | null; name: string; selectAfterCreate: boolean },
  ) => {
    if (!supabase) return { ok: false, error: 'Not signed in' };
    try {
      const created = await createTask(supabase, currentEmployeeId ?? '', args.projectId, args.projectName, args.clientName, args.name);
      if (args.selectAfterCreate && currentEmployeeId) {
        const previous = activeTimer;
        activeTimer = await switchTimer(supabase, currentEmployeeId, created, activeTimer);
        if (previous && previous.entryId !== activeTimer?.entryId) addSegment(previous);
        pausedTask = null;
        if (autoPaused) await setAutoPaused(false);
        captureNow();
        rebuildTrayMenu();
        sendWidgetStatus(trackingStartedAt != null);
      }
      return { ok: true, task: created };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? 'Could not create task');
      const offline = /fetch failed|network|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout/i.test(raw);
      return {
        ok: false,
        error: offline ? 'You are offline. New tasks can only be created while connected; pick an existing task to keep tracking.' : raw,
      };
    }
  },
);

ipcMain.on('task-picker-pause', () => {
  taskPickerWindow?.close();
  void pauseActiveTask();
});

ipcMain.on('toggle-auto-pause', () => {
  void setAutoPaused(!autoPaused);
});

ipcMain.on('task-picker-resume', () => {
  taskPickerWindow?.close();
  void resumePausedTask();
});

ipcMain.handle('sign-in', async (_e, { email, password }: { email: string; password: string }) => {
  if (!supabase) return { ok: false, error: configError ?? 'Not configured' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { ok: false, error: error?.message ?? 'Sign-in failed' };
  store.set('refresh_token', data.session.refresh_token);
  store.set('employee_id', data.session.user.id);
  store.set('email', data.session.user.email ?? '');
  sessionActive = true;
  setAuthReady(true);
  currentEmployeeId = data.session.user.id;
  pollSettingsAndTrack(data.session.user.id);
  void reportCheckin();
  void refreshActiveTimer();
  // Job done once signed in: let the person see "Signed in" for a moment, then tuck the
  // window away so only the widget stays on screen.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  }, 1500);
  return { ok: true, email: data.session.user.email };
});

ipcMain.handle('sign-out', async () => {
  stopTracking();
  if (pollHandle) clearInterval(pollHandle);
  trackingStartedAt = null;
  // Deliberately NOT stopping an open manual task timer here — same as
  // closing a browser tab doesn't stop the web app's own timer, the
  // time_entries row stays open server-side; only this agent's local view of
  // it (tray label, widget) goes away until someone signs back in.
  currentEmployeeId = null;
  activeTimer = null;
  applyWidgetVisibility();
  rebuildTrayMenu();
  store.delete('refresh_token');
  store.delete('employee_id');
  store.delete('email');
  store.delete('settings');
  store.delete('picker');
  if (reconnectHandle) clearInterval(reconnectHandle);
  reconnectHandle = null;
  sessionActive = false;
  await supabase?.auth.signOut({ scope: 'local' });
  return { ok: true };
});

ipcMain.on('open-main-window', () => {
  mainWindow?.show();
  mainWindow?.focus();
});

app.on('window-all-closed', () => {
  // Keep running in the tray — this is a background tracker. Deliberately
  // NOT calling app.quit() here is what keeps it alive after the window
  // closes; 'window-all-closed' has no preventDefault() in Electron's types.
  // In practice this now rarely fires at all, since mainWindow's own 'close'
  // handler hides rather than destroys it (see createWindow) — there's
  // nothing left to force-quit over.
});

// Fires for every real quit path (tray "Quit", Alt+F4 reaching the process,
// OS shutdown/logoff) BEFORE any window's 'close' event — flips the flag
// mainWindow's close interceptor checks, so an actual quit isn't silently
// turned into a hide.
let quitTimerHandled = false;
app.on('before-quit', (event) => {
  isQuitting = true;
  if (activeTimer && !quitTimerHandled) {
    // Quitting must end the running entry, otherwise it keeps counting while the app is closed.
    event.preventDefault();
    quitTimerHandled = true;
    void Promise.race([stopTimerAt(Date.now(), 'quit'), new Promise((r) => setTimeout(r, 2500))]).finally(() => app.quit());
  }
});
