import 'dotenv/config';
import { app, BrowserWindow, ipcMain, Tray, Menu } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import { supabase } from './supabaseClient';
import { startTracking, stopTracking } from './tracker';

const store = new Store<{ refresh_token?: string }>();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pollHandle: ReturnType<typeof setInterval> | null = null;

async function restoreSession() {
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
  const check = async () => {
    const { data, error } = await supabase
      .from('time_agent_settings')
      .select('is_enabled, capture_interval_minutes, screenshots_enabled, blur_screenshots')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (error || !data || !data.is_enabled) {
      stopTracking();
      mainWindow?.webContents.send('agent-status', { tracking: false });
      return;
    }
    startTracking(supabase, employeeId, data);
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

  const session = await restoreSession();
  if (session?.user) {
    mainWindow?.webContents.once('did-finish-load', () => mainWindow?.webContents.send('signed-in', session.user.email));
    pollSettingsAndTrack(session.user.id);
  }
});

ipcMain.handle('sign-in', async (_e, { email, password }: { email: string; password: string }) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { ok: false, error: error?.message ?? 'Sign-in failed' };
  store.set('refresh_token', data.session.refresh_token);
  pollSettingsAndTrack(data.session.user.id);
  return { ok: true, email: data.session.user.email };
});

ipcMain.handle('sign-out', async () => {
  stopTracking();
  if (pollHandle) clearInterval(pollHandle);
  store.delete('refresh_token');
  await supabase.auth.signOut();
  return { ok: true };
});

app.on('window-all-closed', (e: Event) => {
  // Keep running in the tray — this is a background tracker, closing the
  // window shouldn't stop capture if the agent is enabled.
  e.preventDefault();
});
