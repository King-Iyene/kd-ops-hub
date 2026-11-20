// KD Ops: the KD Squares ops site and the virtual Office as one desktop app.
//
// It is the live website in its own window, so every update to the site reaches the app with no reinstall.
// The window has two tabs, "KD Ops" and "Office". Each one is its own always-running page, so switching tabs only
// shows one and hides the other: you stay in the office (voice, presence, rings) while you work in KD Ops.
//
// What the app adds on top of a browser:
//  - a hidden tab is never put to sleep by Chrome's background throttling, so you do not go inactive
//  - real system notifications (rings, waves, messages), a taskbar flash and an unread count
//  - sits in the tray: closing the window keeps you in the office; Quit really leaves
//  - microphone, camera and screen sharing work without browser prompts
//  - a friendly offline screen that reconnects by itself (power and network cuts happen)
//  - only one copy runs, it can start with your computer, and it updates itself
const { app, BrowserWindow, WebContentsView, Menu, Notification, Tray, nativeImage, session, shell, powerSaveBlocker, desktopCapturer, ipcMain, systemPreferences } = require('electron');
const fs = require('fs');
const path = require('path');

// KD_OPS_URL points the whole app somewhere else (used by the tests). KD_OFFICE_URL is the older name for the Office address.
const BASE = (() => {
  try {
    if (process.env.KD_OPS_URL) return new URL(process.env.KD_OPS_URL);
    if (process.env.KD_OFFICE_URL) return new URL('/', process.env.KD_OFFICE_URL);
  } catch { /* fall through to the real site */ }
  return new URL('https://ops.kdsquares.com/');
})();
const ORIGIN = BASE.origin;
const TAB_URLS = {
  ops: BASE.href,
  office: process.env.KD_OFFICE_URL || `${ORIGIN}/office`,
};
const TAB_IDS = Object.keys(TAB_URLS);
const BAR_HEIGHT = 40;
const SMOKE = process.argv.includes('--smoke');
const ICON = path.join(__dirname, 'build', 'icon.png');
// the tray has its own small, simplified icon (tray.png, with tray@2x.png and tray@3x.png for sharper screens)
const TRAY_ICON = path.join(__dirname, 'build', 'tray.png');
const NAME = 'KD Ops';

let win = null;
let tray = null;
let quitting = false;
let active = 'ops';
let updateReadyVersion = null;
let autoUpdater = null;
const views = {};
const counts = { ops: 0, office: 0 };
const retryTimers = {};
// the last address each tab showed that really belongs in it (to put a tab back when a page lands in the wrong one)
const lastGood = {};

// ---- one copy only
if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}
app.setAppUserModelId('com.kdsquares.office');

// ---- small settings file (window size, last tab, start with computer)
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function writeSettings(patch) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch })); } catch { /* not worth stopping for */ }
}

// ---- which tab a web address belongs to
function sameOrigin(url) {
  try { return new URL(url).origin === ORIGIN; } catch { return false; }
}
function isOfficeUrl(url) {
  try {
    const u = new URL(url);
    return u.origin === ORIGIN && (u.pathname === '/office' || u.pathname.startsWith('/office/'));
  } catch { return false; }
}
// sign-in pages show up in whichever tab needed you to sign in (the Office tab too), so they never move between tabs
function isAuthUrl(url) {
  try {
    const p = new URL(url).pathname;
    return ['/login', '/register', '/forgot-password', '/reset-password', '/unauthorized'].some((a) => p === a || p.startsWith(a + '/'));
  } catch { return false; }
}
/** 'ops' | 'office' for an address on our own site, 'auth' for a sign-in page, 'external' for any other web address, 'block' for anything else. */
function routeOf(url) {
  if (!/^https?:/i.test(url)) return 'block';
  if (!sameOrigin(url)) return 'external';
  if (isAuthUrl(url)) return 'auth';
  return isOfficeUrl(url) ? 'office' : 'ops';
}
function tabOf(webContents) {
  return TAB_IDS.find((id) => views[id] && !views[id].webContents.isDestroyed() && views[id].webContents.id === webContents.id) || null;
}

function totalUnread() { return counts.ops + counts.office; }

function pushBar() {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.webContents.send('tabs:state', { active, counts: { ...counts } });
}

function setCount(id, n) {
  counts[id] = Math.max(0, n | 0);
  const total = totalUnread();
  if (tray) tray.setToolTip(total ? `${NAME} (${total} waiting)` : NAME);
  try { app.setBadgeCount(total); } catch { /* not supported everywhere */ }
  if (win && total > 0 && !win.isFocused()) win.flashFrame(true);
  if (total === 0 && win) win.flashFrame(false);
  pushBar();
}

function clearCounts() {
  counts.ops = 0;
  counts.office = 0;
  if (tray) tray.setToolTip(NAME);
  try { app.setBadgeCount(0); } catch { /* not supported everywhere */ }
  if (win) win.flashFrame(false);
  pushBar();
}

// ---- layout: both pages keep the same size under the tab bar; only the chosen one is shown
function layout() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  for (const id of TAB_IDS) {
    const v = views[id];
    if (!v) continue;
    v.setBounds({ x: 0, y: BAR_HEIGHT, width: Math.max(0, w), height: Math.max(0, h - BAR_HEIGHT) });
    v.setVisible(id === active);
    if (!v.webContents.isDestroyed()) v.webContents.send('kd:tab-visible', id === active);
  }
}

function selectTab(id, { focus = true } = {}) {
  if (!TAB_URLS[id]) return;
  active = id;
  // the KD Ops tab is for the ops site: if it ever shows the Office page, put it on the dashboard (the Office has its own tab)
  if (id === 'ops') {
    const ov = views.ops;
    let cur = '';
    try { cur = ov && !ov.webContents.isDestroyed() ? ov.webContents.getURL() : ''; } catch { /* gone */ }
    if (cur && isOfficeUrl(cur)) void ov.webContents.loadURL(TAB_URLS.ops).catch(() => undefined);
  }
  layout();
  writeSettings({ tab: id });
  pushBar();
  const v = views[id];
  if (focus && v && !v.webContents.isDestroyed()) v.webContents.focus();
}

function showWindow(tab) {
  if (!win) createWindow();
  else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  if (tab) selectTab(tab);
  else if (views[active] && !views[active].webContents.isDestroyed()) views[active].webContents.focus();
}

// ---- send a web address to the tab it belongs to
function openInTab(id, url) {
  const v = views[id];
  if (!v) return;
  const wc = v.webContents;
  selectTab(id);
  let current = '';
  try { current = wc.getURL(); } catch { /* destroyed */ }
  const onPage = id === 'office' ? isOfficeUrl(current) : sameOrigin(current) && !isOfficeUrl(current);
  // the Office is a place you stay in: only reload it when it is not showing the office at all
  if (id === 'office' && onPage) return;
  if (!url || current === url) return;
  void wc.loadURL(url).catch(() => undefined);
}

function loadTab(id) {
  clearTimeout(retryTimers[id]);
  const v = views[id];
  return v && !v.webContents.isDestroyed() ? v.webContents.loadURL(TAB_URLS[id]).catch(() => undefined) : Promise.resolve();
}

function createView(id) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--kd-tab=${id}`],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // the whole point: a page you are not looking at must keep running, or you drop out of the office
      backgroundThrottling: false,
      // rings, waves and messages must be heard even when nobody has clicked in the window yet (it may have started hidden in the tray)
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });
  const wc = view.webContents;
  views[id] = view;

  // tell the site it is inside the desktop app (it shows this on "you are somewhere else" and turns notifications on)
  const baseUa = wc.getUserAgent().replace(/\sElectron\/\S+/, '');
  wc.setUserAgent(`${baseUa} KDOfficeDesktop/${app.getVersion()} KDOpsDesktop/${app.getVersion()}`);

  wc.setWindowOpenHandler(({ url }) => {
    const r = routeOf(url);
    if (r === 'external') void shell.openExternal(url);
    else if (r === 'ops' || r === 'office') openInTab(r, url);
    else if (r === 'auth') openInTab('ops', url);
    return { action: 'deny' };
  });

  wc.on('will-navigate', (e, url) => {
    if (url.startsWith('kd-retry:')) { e.preventDefault(); void loadTab(id); return; }
    if (url.startsWith('file:')) return;
    const r = routeOf(url);
    if (r === 'auth') return;
    if (r === id) { lastGood[id] = url; return; }
    e.preventDefault();
    if (r === 'external') void shell.openExternal(url);
    else if (r === 'ops' || r === 'office') openInTab(r, url);
  });

  // the site changes page without a real navigation (its own menu links): keep each page in the tab it belongs to,
  // so the Office is never opened twice and the Office tab always stays the Office
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (!isMainFrame) return;
    const r = routeOf(url);
    if (r !== 'ops' && r !== 'office') return;
    if (r === id) { lastGood[id] = url; return; }
    // put this tab back where it was (the site's own back step when there is one, otherwise its last good page), then open the page in its own tab
    let wentBack = false;
    try { if (wc.navigationHistory.canGoBack()) { wc.navigationHistory.goBack(); wentBack = true; } } catch { /* fall through */ }
    if (!wentBack) void wc.loadURL(lastGood[id] || TAB_URLS[id]).catch(() => undefined);
    openInTab(r, url);
  });

  wc.on('did-navigate', (_e, url) => { if (routeOf(url) === id) lastGood[id] = url; });
  wc.on('did-finish-load', () => { if (!wc.isDestroyed()) wc.send('kd:tab-visible', active === id); });

  // an unread count from the page title, "(3) Virtual Office"
  wc.on('page-title-updated', (_e, title) => {
    const m = /^\((\d+)\)/.exec(title);
    setCount(id, m ? Number(m[1]) : 0);
  });

  wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 is a load that was cancelled on purpose
    void wc.loadFile(path.join(__dirname, 'offline.html'));
    clearTimeout(retryTimers[id]);
    retryTimers[id] = setTimeout(() => { void loadTab(id); }, 10000);
    if (SMOKE && id === 'ops') finishSmoke({ ok: false, reason: 'offline' });
  });

  wc.on('did-finish-load', () => {
    if (SMOKE && id === 'ops' && sameOrigin(wc.getURL())) {
      setTimeout(async () => {
        const info = await wc.executeJavaScript('JSON.stringify({ title: document.title, ua: navigator.userAgent, desktop: !!window.kdDesktop && window.kdDesktop.platform, root: document.getElementById("root") ? document.getElementById("root").children.length : -1 })');
        finishSmoke({ ok: true, ...JSON.parse(info) });
      }, 6000);
    }
  });

  return view;
}

function createWindow() {
  const s = readSettings();
  active = TAB_URLS[s.tab] ? s.tab : 'ops';
  win = new BrowserWindow({
    width: s.width || 1400,
    height: s.height || 900,
    minWidth: 900,
    minHeight: 600,
    // the automatic tests open their windows far off-screen so they never pop up on anyone's desktop
    ...(process.env.KD_OPS_TEST ? { x: -4000, y: -4000 } : {}),
    backgroundColor: '#0b0f17',
    title: NAME,
    icon: ICON,
    autoHideMenuBar: true,
    show: !SMOKE,
    webPreferences: {
      // this page is only the tab bar
      preload: path.join(__dirname, 'preload-tabs.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  if (s.maximized) win.maximize();
  void win.loadFile(path.join(__dirname, 'tabs.html'));

  for (const id of TAB_IDS) {
    const v = createView(id);
    win.contentView.addChildView(v);
  }
  layout();
  for (const id of TAB_IDS) void loadTab(id);

  for (const ev of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore', 'show']) win.on(ev, layout);
  win.on('focus', () => { clearCounts(); });
  // minimising sends the app to the tray too (it keeps running; the tray icon or the Start menu shortcut brings it back)
  win.on('minimize', () => { if (!quitting && !SMOKE && readSettings().closeToTray !== false) win.hide(); });

  // closing the window keeps you in the office (in the tray); Quit from the tray really leaves
  win.on('close', (e) => {
    const b = win.getBounds();
    writeSettings({ width: b.width, height: b.height, maximized: win.isMaximized() });
    // closing goes to the tray unless the person chose to quit instead (tray menu: "Closing the window keeps me in the tray")
    if (!quitting && !SMOKE && readSettings().closeToTray !== false) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => {
    for (const id of TAB_IDS) {
      try { if (views[id] && !views[id].webContents.isDestroyed()) views[id].webContents.close(); } catch { /* already gone */ }
      delete views[id];
      clearTimeout(retryTimers[id]);
    }
    win = null;
  });
}

function finishSmoke(result) {
  if (!SMOKE) return;
  console.log('SMOKE ' + JSON.stringify(result));
  quitting = true;
  app.quit();
}

// ---- the tab bar page asks to switch tabs
ipcMain.on('tabs:select', (e, id) => {
  if (!win || e.sender.id !== win.webContents.id) return;
  if (TAB_IDS.includes(id)) selectTab(id);
});
ipcMain.on('tabs:ready', (e) => {
  if (win && e.sender.id === win.webContents.id) pushBar();
});

function trayMenu() {
  return Menu.buildFromTemplate([
    ...(updateReadyVersion ? [{ label: `Restart to update to ${updateReadyVersion}`, click: () => installUpdateNow() }, { type: 'separator' }] : []),
    { label: 'Open KD Ops', click: () => showWindow('ops') },
    { label: 'Open the Office', click: () => showWindow('office') },
    { type: 'separator' },
    {
      label: 'Closing or minimising keeps me in the tray',
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
    { label: 'Reload this tab', click: () => { void loadTab(active); } },
    { type: 'separator' },
    { label: `Quit ${NAME}`, click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray() {
  const img = nativeImage.createFromPath(TRAY_ICON);
  tray = new Tray(img.isEmpty() ? nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 }) : img);
  tray.setToolTip(NAME);
  tray.on('click', () => { if (win && win.isVisible() && win.isFocused()) win.hide(); else showWindow(); });
  tray.setContextMenu(trayMenu());
}
function rebuildTray() { if (tray) tray.setContextMenu(trayMenu()); }

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

// ---- updates: the app checks for a newer version by itself and installs it the next time you quit.
// The update files live on one fixed release page that belongs to this app only (see build.publish in package.json),
// so they can never be mixed up with the Time Tracker's releases.
function installUpdateNow() {
  quitting = true;
  // silent: no installer wizard, the app closes, updates and starts again by itself
  logUpdate('restart to update requested');
  try { autoUpdater.quitAndInstall(true, true); } catch (e) { logUpdate('quitAndInstall failed: ' + (e && e.message)); app.quit(); }
}

// A small log of what the updater does (userData/updater.log), so "it did not update" can be answered by reading it.
function logUpdate(...parts) {
  try {
    const file = path.join(app.getPath('userData'), 'updater.log');
    try { if (fs.statSync(file).size > 200000) fs.writeFileSync(file, ''); } catch { /* no log yet */ }
    fs.appendFileSync(file, `${new Date().toISOString()} ${parts.map((p) => (p && p.stack) || String(p)).join(' ')}
`);
  } catch { /* logging must never break the app */ }
}

function initAutoUpdater() {
  if (!app.isPackaged || SMOKE) return;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: (...a) => logUpdate('info', ...a), warn: (...a) => logUpdate('warn', ...a), error: (...a) => logUpdate('error', ...a), debug: () => undefined };
  logUpdate('updater ready, app version', app.getVersion());
  autoUpdater.on('error', (e) => { logUpdate('updater error:', e); /* offline or no new version file: try again at the next check */ });
  autoUpdater.on('update-available', (info) => logUpdate('update available', info.version));
  autoUpdater.on('update-downloaded', (info) => {
    updateReadyVersion = info.version;
    logUpdate('update downloaded', info.version);
    rebuildTray();
    const n = new Notification({
      title: NAME,
      body: `Version ${info.version} is ready. Click here to restart and install it now, or use "Restart to update" in the tray menu. It also installs when you quit.`,
      icon: ICON,
    });
    shown.add(n);
    n.on('click', () => installUpdateNow());
    n.on('close', () => shown.delete(n));
    n.show();
  });
  const check = () => { autoUpdater.checkForUpdates().catch(() => undefined); };
  setTimeout(check, 20000);
  setInterval(check, 2 * 60 * 60 * 1000);
}

// real system notifications (Windows toast, macOS notification centre, Linux desktop notification), made here so they work
// whether the window is open, behind others or hidden in the tray. Clicking one brings that tab to the front.
const shown = new Set();
function fromOurPages(e) {
  const id = tabOf(e.sender);
  if (!id) return null;
  const url = e.senderFrame && e.senderFrame.url;
  if (url && !url.startsWith(ORIGIN)) return null;
  return id;
}
ipcMain.on('kd:notify', (e, p) => {
  const id = fromOurPages(e);
  if (!id || !p || typeof p.title !== 'string' || !p.title.trim() || !Notification.isSupported()) return;
  const n = new Notification({ title: p.title.slice(0, 100), body: String(p.body || '').slice(0, 240), icon: ICON, silent: false });
  shown.add(n); // keep it alive until it is gone
  n.on('click', () => {
    showWindow(id);
    const v = views[id];
    if (v && !v.webContents.isDestroyed()) v.webContents.send('kd:notification-click', String(p.id));
  });
  n.on('close', () => shown.delete(n));
  n.show();
  if (win && !win.isVisible()) { try { shell.beep(); } catch { /* fine */ } }
});

ipcMain.on('kd:focus', (e) => { const id = fromOurPages(e); if (id) showWindow(id); });
ipcMain.on('kd:badge', (e, n) => { const id = fromOurPages(e); if (id) setCount(id, Number(n) || 0); });

function zoomActive(delta) {
  const v = views[active];
  if (!v || v.webContents.isDestroyed()) return;
  const wc = v.webContents;
  wc.setZoomLevel(delta === 0 ? 0 : Math.max(-3, Math.min(4, wc.getZoomLevel() + delta)));
}

app.whenReady().then(() => {
  // keep the app (and its connection) alive when the computer would otherwise suspend background apps
  powerSaveBlocker.start('prevent-app-suspension');
  allowMedia();
  void askMacAccess();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'Go',
      submenu: [
        { label: 'KD Ops', accelerator: 'CmdOrCtrl+1', click: () => showWindow('ops') },
        { label: 'Office', accelerator: 'CmdOrCtrl+2', click: () => showWindow('office') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload this tab', accelerator: 'CmdOrCtrl+R', click: () => { void loadTab(active); } },
        { role: 'togglefullscreen' },
        { label: 'Zoom in', accelerator: 'CmdOrCtrl+Plus', click: () => zoomActive(0.5) },
        { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => zoomActive(-0.5) },
        { label: 'Actual size', accelerator: 'CmdOrCtrl+0', click: () => zoomActive(0) },
      ],
    },
  ]));
  if (!SMOKE) createTray();
  createWindow();
  initAutoUpdater();
  if (process.argv.includes('--hidden') && win) win.hide();
  if (SMOKE) setTimeout(() => finishSmoke({ ok: false, reason: 'timeout' }), 45000);
});

app.on('activate', () => showWindow());
app.on('before-quit', () => { quitting = true; if (updateReadyVersion) logUpdate('quitting with update', updateReadyVersion, 'ready to install'); });
// closing the last window must not quit (the tray keeps you in the office)
app.on('window-all-closed', () => { if (SMOKE || process.platform !== 'darwin') { if (quitting || SMOKE) app.quit(); } });
