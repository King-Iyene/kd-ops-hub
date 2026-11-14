import 'dotenv/config';
import { app, BrowserWindow, ipcMain, Tray, Menu } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import { supabase, configError } from './supabaseClient';
import { startTracking, stopTracking } from './tracker';

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
