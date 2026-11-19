// KD Office: the virtual office as a desktop app.
//
// It is the live website in its own window, so every update to the site reaches the app with no reinstall. What the app adds:
//  - the window is never put to sleep by Chrome's background throttling, so you do not go inactive
//  - real system notifications (rings, waves, messages), a taskbar flash and an unread count
//  - sits in the tray: closing the window keeps you in the office; Quit really leaves
//  - microphone, camera and screen sharing work without browser prompts
//  - a friendly offline screen that reconnects by itself (power and network cuts happen)
//  - only one copy runs, and it can start with your computer
const { app, BrowserWindow, Menu, Notification, Tray, nativeImage, session, shell, powerSaveBlocker, desktopCapturer, ipcMain, systemPreferences } = require('electron');
const fs = require('fs');
const path = require('path');

const APP_URL = process.env.KD_OFFICE_URL || 'https://ops.kdsquares.com/office';
const ORIGIN = new URL(APP_URL).origin;
const SMOKE = process.argv.includes('--smoke');
const ICON = path.join(__dirname, 'build', 'icon.png');

let win = null;
let tray = null;
let quitting = false;
let unread = 0;
let retryTimer = null;

// ---- one copy only
if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}
app.setAppUserModelId('com.kdsquares.office');

// ---- small settings file (window size, start with computer)
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function writeSettings(patch) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch })); } catch { /* not worth stopping for */ }
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function setUnread(n) {
  unread = Math.max(0, n);
  if (tray) tray.setToolTip(unread ? `KD Office (${unread} waiting)` : 'KD Office');
  try { app.setBadgeCount(unread); } catch { /* not supported everywhere */ }
  if (win && unread > 0 && !win.isFocused()) win.flashFrame(true);
  if (unread === 0 && win) win.flashFrame(false);
}

function createWindow() {
  const s = readSettings();
  win = new BrowserWindow({
    width: s.width || 1400,
    height: s.height || 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0f17',
    title: 'KD Office',
    icon: ICON,
    autoHideMenuBar: true,
    show: !SMOKE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // the whole point: a window you are not looking at must keep running, or you drop out of the office
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  if (s.maximized) win.maximize();

  // tell the site it is inside the desktop app (it shows this on "you are somewhere else" and turns notifications on)
  win.webContents.setUserAgent(`${win.webContents.getUserAgent().replace(/\sElectron\/\S+/, '')} KDOfficeDesktop/${app.getVersion()}`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('kd-retry:')) { e.preventDefault(); void loadApp(); return; }
    if (url.startsWith('file:')) return;
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });

  // an unread count from the page title, "(3) Virtual Office"
  win.webContents.on('page-title-updated', (_e, title) => {
    const m = /^\((\d+)\)/.exec(title);
    setUnread(m ? Number(m[1]) : 0);
  });
  win.on('focus', () => { setUnread(0); });

  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 is a load that was cancelled on purpose
    void win.loadFile(path.join(__dirname, 'offline.html'));
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { void loadApp(); }, 10000);
    if (SMOKE) finishSmoke({ ok: false, reason: 'offline' });
  });
  win.webContents.on('did-finish-load', () => {
    if (SMOKE && win.webContents.getURL().startsWith(ORIGIN)) {
      setTimeout(async () => {
        const info = await win.webContents.executeJavaScript('JSON.stringify({ title: document.title, ua: navigator.userAgent, desktop: !!window.kdDesktop && window.kdDesktop.platform, root: document.getElementById("root") ? document.getElementById("root").children.length : -1 })');
        finishSmoke({ ok: true, ...JSON.parse(info) });
      }, 6000);
    }
  });

  // closing the window keeps you in the office (in the tray); Quit from the tray really leaves
  win.on('close', (e) => {
    const b = win.getBounds();
    writeSettings({ width: b.width, height: b.height, maximized: win.isMaximized() });
    // closing goes to the tray unless the person chose to quit instead (tray menu: "Closing the window keeps me in the tray")
    if (!quitting && !SMOKE && readSettings().closeToTray !== false) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });

  void loadApp();
}

function loadApp() {
  clearTimeout(retryTimer);
  return win ? win.loadURL(APP_URL).catch(() => undefined) : Promise.resolve();
}

function finishSmoke(result) {
  if (!SMOKE) return;
  console.log('SMOKE ' + JSON.stringify(result));
  quitting = true;
  app.quit();
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('KD Office');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open the office', click: () => showWindow() },
    { type: 'separator' },
    {
      label: 'Closing the window keeps me in the tray',
      type: 'checkbox',
      checked: readSettings().closeToTray !== false,
      click: (item) => writeSettings({ closeToTray: item.checked }),
    },
    {
      label: 'Start with my computer',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: item.checked ? ['--hidden'] : [] }),
    },
    { label: 'Reload', click: () => { void loadApp(); } },
    { type: 'separator' },
    { label: 'Quit KD Office', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.on('click', () => { if (win && win.isVisible() && win.isFocused()) win.hide(); else showWindow(); });
  tray.on('right-click', () => tray.popUpContextMenu(menu()));
  tray.setContextMenu(menu());
}

function allowMedia() {
  const ses = session.defaultSession;
  const allowed = new Set(['media', 'notifications', 'display-capture', 'clipboard-sanitized-write', 'fullscreen']);
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    callback(allowed.has(permission) && wc.getURL().startsWith(ORIGIN));
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => allowed.has(permission) && (requestingOrigin || '').startsWith(ORIGIN));

  // screen sharing: one screen goes straight through, several screens and windows ask which to share
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
      if (!sources.length) return callback({});
      const screens = sources.filter((s) => s.id.startsWith('screen:'));
      if (screens.length === 1 && sources.length === screens.length) return callback({ video: screens[0] });
      const menu = Menu.buildFromTemplate([
        { label: 'Share which screen or window?', enabled: false },
        { type: 'separator' },
        ...sources.slice(0, 20).map((s) => ({ label: s.name.slice(0, 60) || s.id, click: () => callback({ video: s }) })),
        { type: 'separator' },
        { label: 'Cancel', click: () => callback({}) },
      ]);
      menu.popup({ window: win || undefined, callback: () => undefined });
    } catch {
      callback({});
    }
  });
}

async function askMacAccess() {
  if (process.platform !== 'darwin') return;
  try { await systemPreferences.askForMediaAccess('microphone'); } catch { /* the person said no */ }
  try { await systemPreferences.askForMediaAccess('camera'); } catch { /* the person said no */ }
}

// real system notifications (Windows toast, macOS notification centre, Linux desktop notification), made here so they work
// whether the window is open, behind others or hidden in the tray. Clicking one brings the office to the front.
const shown = new Set();
ipcMain.on('kd:notify', (_e, p) => {
  if (!p || typeof p.title !== 'string' || !Notification.isSupported()) return;
  const n = new Notification({ title: p.title.slice(0, 100), body: String(p.body || '').slice(0, 240), icon: ICON, silent: false });
  shown.add(n); // keep it alive until it is gone
  n.on('click', () => {
    showWindow();
    if (win) win.webContents.send('kd:notification-click', String(p.id));
  });
  n.on('close', () => shown.delete(n));
  n.show();
  if (win && !win.isVisible()) { try { shell.beep(); } catch { /* fine */ } }
});

ipcMain.on('kd:focus', () => showWindow());
ipcMain.on('kd:badge', (_e, n) => setUnread(n));

app.whenReady().then(() => {
  // keep the app (and its connection) alive when the computer would otherwise suspend background apps
  powerSaveBlocker.start('prevent-app-suspension');
  allowMedia();
  void askMacAccess();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
  ]));
  if (!SMOKE) createTray();
  createWindow();
  if (process.argv.includes('--hidden') && win) win.hide();
  if (SMOKE) setTimeout(() => finishSmoke({ ok: false, reason: 'timeout' }), 45000);
});

app.on('activate', () => showWindow());
app.on('before-quit', () => { quitting = true; });
// closing the last window must not quit (the tray keeps you in the office)
app.on('window-all-closed', () => { if (SMOKE || process.platform !== 'darwin') { if (quitting || SMOKE) app.quit(); } });
