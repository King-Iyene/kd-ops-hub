import { app, BrowserWindow, ipcMain, Tray, Menu } from 'electron';
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

const store = new Store<{ refresh_token?: string }>();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pollHandle: ReturnType<typeof setInterval> | null = null;

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
      mainWindow?.webContents.send('agent-status', { tracking: false });
      return;
    }
    startTracking(client, employeeId, data);
    mainWindow?.webContents.send('agent-status', { tracking: true });
  };
  await check();
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(check, 60_000); // re-check enabled/settings every minute
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 420,
    resizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));
}

app.whenReady().then(async () => {
  createWindow();
  tray = new Tray(path.join(__dirname, '../src/renderer/tray-icon.png'));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow?.show() },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.setToolTip('KD Ops Time Tracker');

  initAutoUpdater();

  if (configError) {
    mainWindow?.webContents.once('did-finish-load', () => mainWindow?.webContents.send('config-error', configError));
    return;
  }

  const session = await restoreSession();
  if (session?.user) {
    mainWindow?.webContents.once('did-finish-load', () => mainWindow?.webContents.send('signed-in', session.user.email));
    pollSettingsAndTrack(session.user.id);
    void reportCheckin();
  }
});

ipcMain.handle('sign-in', async (_e, { email, password }: { email: string; password: string }) => {
  if (!supabase) return { ok: false, error: configError ?? 'Not configured' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { ok: false, error: error?.message ?? 'Sign-in failed' };
  store.set('refresh_token', data.session.refresh_token);
  pollSettingsAndTrack(data.session.user.id);
  void reportCheckin();
  return { ok: true, email: data.session.user.email };
});

ipcMain.handle('sign-out', async () => {
  stopTracking();
  if (pollHandle) clearInterval(pollHandle);
  store.delete('refresh_token');
  await supabase?.auth.signOut();
  return { ok: true };
});

app.on('window-all-closed', () => {
  // Keep running in the tray — this is a background tracker. Deliberately
  // NOT calling app.quit() here is what keeps it alive after the window
  // closes; 'window-all-closed' has no preventDefault() in Electron's types.
});
