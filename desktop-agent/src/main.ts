import { app, BrowserWindow, ipcMain, Tray, Menu, screen } from 'electron';
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

import { supabase, configError } from './supabaseClient';
import { startTracking, stopTracking } from './tracker';
import { startAutoFlush } from './offlineQueue';
import {
  fetchPickableTasks,
  fetchSuggestedTasks,
  createTask,
  getActiveTimer,
  switchTimer,
  resumeTask,
  stopActiveTimer,
  type ActiveTimer,
  type PickableTask,
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
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Same reasoning as the .on('error', ...) handler above.
  });
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

const store = new Store<{ refresh_token?: string; widget_visible?: boolean }>();

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

async function restoreSession() {
  if (!supabase) return null;
  const refreshToken = store.get('refresh_token');
  if (!refreshToken) return null;
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    store.delete('refresh_token');
    return null;
  }
  store.set('refresh_token', data.session.refresh_token);
  return data.session;
}

async function pollSettingsAndTrack(employeeId: string) {
  if (!supabase) return;
  const client = supabase;
  const check = async () => {
    const { data, error } = await client
      .from('time_agent_settings')
      .select('is_enabled, capture_interval_minutes, screenshots_enabled, blur_screenshots')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (error || !data || !data.is_enabled) {
      stopTracking();
      trackingStartedAt = null;
      safeSend(mainWindow, 'agent-status', { tracking: false });
      applyWidgetVisibility();
      return;
    }
    startTracking(client, employeeId, data);
    if (trackingStartedAt == null) trackingStartedAt = Date.now();
    safeSend(mainWindow, 'agent-status', { tracking: true });
    applyWidgetVisibility();
  };
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));
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
  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
}

function sendWidgetStatus(tracking: boolean) {
  safeSend(widgetWindow, 'widget-status', {
    tracking,
    idle: false, // true per-tick idle state isn't plumbed out of tracker.ts yet
    startedAt: trackingStartedAt,
    task: activeTimer ? { name: activeTimer.taskName, project: activeTimer.projectName, startedAt: new Date(activeTimer.startTime).getTime() } : null,
    pausedTask: !activeTimer && pausedTask ? { name: pausedTask.taskName, project: pausedTask.projectName } : null,
  });
}

// --- Manual task timer (tray "Start a Task…") ---------------------------
// Separate from the automatic window/activity tracker above: this is the
// TimeCamp-style "what am I working on" timer the user picks explicitly,
// writing directly to time_entries — see taskTimer.ts for why it shares that
// table with the web app's own timer instead of inventing a parallel one.

const TASK_PICKER_WIDTH = 360;
const TASK_PICKER_HEIGHT = 420;

function createTaskPickerWindow() {
  if (taskPickerWindow) {
    taskPickerWindow.show();
    taskPickerWindow.focus();
    return;
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
  taskPickerWindow.loadFile(path.join(__dirname, '../src/renderer/task-picker.html'));
  taskPickerWindow.on('blur', () => taskPickerWindow?.close());
  taskPickerWindow.on('closed', () => {
    taskPickerWindow = null;
  });
}

// --- Pause / Stop / Resume: shared by the tray menu and the widget/picker's
// IPC handlers below, so there's exactly one place each does its actual work. ---

async function pauseActiveTask() {
  if (!supabase || !activeTimer) return;
  const toPause = activeTimer;
  try {
    await stopActiveTimer(supabase, toPause.entryId);
    pausedTask = toPause;
  } catch {
    // Non-fatal — refreshActiveTimer's next poll reconciles either way.
  }
  activeTimer = null;
  rebuildTrayMenu();
  sendWidgetStatus(trackingStartedAt != null);
}

async function stopActiveTask() {
  if (!supabase || !activeTimer) return;
  try {
    await stopActiveTimer(supabase, activeTimer.entryId);
  } catch {
    // Non-fatal — see note above.
  }
  activeTimer = null;
  pausedTask = null; // an explicit Stop clears any pending pause too, not just the running entry
  rebuildTrayMenu();
  sendWidgetStatus(trackingStartedAt != null);
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
  } catch {
    // Non-fatal — widget just shows no task this tick; next poll retries.
  }
  rebuildTrayMenu();
  sendWidgetStatus(trackingStartedAt != null);
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
      : [{ label: 'Start a Task…', click: () => createTaskPickerWindow() }];
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow?.show() },
    { type: 'separator' },
    ...taskItems,
    { type: 'separator' },
    {
      label: 'Show floating widget',
      type: 'checkbox',
      checked: widgetPreferenceEnabled(),
      click: (menuItem) => {
        store.set('widget_visible', menuItem.checked);
        applyWidgetVisibility();
      },
    },
    { label: 'Quit', click: () => app.quit() },
  ]));
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
  createWindow();
  createWidgetWindow();
  tray = new Tray(path.join(__dirname, '../src/renderer/tray-icon.png'));
  rebuildTrayMenu();
  tray.setToolTip('KD Ops Time Tracker');

  initAutoUpdater();

  if (configError) {
    mainWindow?.webContents.once('did-finish-load', () => safeSend(mainWindow, 'config-error', configError));
    return;
  }

  const session = await restoreSession();
  if (session?.user) {
    mainWindow?.webContents.once('did-finish-load', () => safeSend(mainWindow, 'signed-in', session.user.email));
    currentEmployeeId = session.user.id;
    pollSettingsAndTrack(session.user.id);
    void reportCheckin();
    void refreshActiveTimer();
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
  try {
    const [tasks, suggested] = await Promise.all([
      fetchPickableTasks(supabase),
      currentEmployeeId ? fetchSuggestedTasks(supabase, currentEmployeeId) : Promise.resolve([]),
    ]);
    // taskPickerWindow closes on blur, so the user clicking away during this
    // await is routine, not an edge case — safeSend is load-bearing here,
    // not defensive decoration (see the comment on its definition).
    safeSend(taskPickerWindow, 'task-picker-data', { tasks, suggested });
  } catch {
    safeSend(taskPickerWindow, 'task-picker-data', { tasks: [], suggested: [] });
  }
});

ipcMain.on('task-picker-choose', async (_e, task: PickableTask) => {
  taskPickerWindow?.close();
  if (!supabase || !currentEmployeeId) return;
  try {
    activeTimer = await switchTimer(supabase, currentEmployeeId, task);
    pausedTask = null; // explicitly picking a task overrides whatever was paused
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
        activeTimer = await switchTimer(supabase, currentEmployeeId, created);
        pausedTask = null;
        rebuildTrayMenu();
        sendWidgetStatus(trackingStartedAt != null);
      }
      return { ok: true, task: created };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create task';
      return { ok: false, error: message };
    }
  },
);

ipcMain.on('task-picker-pause', () => {
  taskPickerWindow?.close();
  void pauseActiveTask();
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
  currentEmployeeId = data.session.user.id;
  pollSettingsAndTrack(data.session.user.id);
  void reportCheckin();
  void refreshActiveTimer();
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
  await supabase?.auth.signOut();
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
app.on('before-quit', () => {
  isQuitting = true;
});
