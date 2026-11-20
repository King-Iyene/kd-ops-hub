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
const { app, BrowserWindow, WebContentsView, Menu, Notification, Tray, nativeImage, session, shell, powerSaveBlocker, desktopCapturer, ipcMain, systemPreferences, screen, powerMonitor, dialog } = require('electron');
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
const lastTold = {};
/** Tell every page whether its tab is showing and whether the app is in front; the KD Ops page also gets slowed right down when you are not looking at it. */
function syncPageState() {
  if (!win || win.isDestroyed()) return;
  const shown = win.isVisible() && !win.isMinimized();
  const focused = win.isFocused();
  for (const id of TAB_IDS) {
    const v = views[id];
    if (!v || v.webContents.isDestroyed()) continue;
    const tabShown = id === active && shown;
    const key = `${tabShown}|${focused}`;
    if (lastTold[id] === key) continue;
    lastTold[id] = key;
    v.webContents.send('kd:tab-visible', tabShown);
    v.webContents.send('kd:window-focus', focused);
    // the Office must keep running (voice, rings); the KD Ops page only needs full speed while you are using it
    if (id === 'ops') { try { v.webContents.setBackgroundThrottling(!(tabShown && focused)); } catch { /* older Electron: no change */ } }
  }
}

function layout() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  for (const id of TAB_IDS) {
    const v = views[id];
    if (!v) continue;
    v.setBounds({ x: 0, y: BAR_HEIGHT, width: Math.max(0, w), height: Math.max(0, h - BAR_HEIGHT) });
    v.setVisible(id === active);
  }
  syncPageState();
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

/** What pressing the X does: 'ask' (the first time), 'tray' (keep running in the tray) or 'quit'. Older installs that chose "do not keep me in the tray" mean 'quit'. */
function closeAction() {
  const st = readSettings();
  if (st.closeAction === 'ask' || st.closeAction === 'tray' || st.closeAction === 'quit') return st.closeAction;
  if (st.closeToTray === false) return 'quit';
  return process.env.KD_OPS_TEST ? 'tray' : 'ask';
}
let closeAsking = false;
function askWhatToDoOnClose() {
  if (closeAsking || !win) return;
  closeAsking = true;
  void dialog.showMessageBox(win, {
    type: 'question',
    title: NAME,
    message: 'Close KD Ops?',
    detail: 'Keep it in the tray and rings, calls and messages still reach you, or quit it completely.',
    buttons: ['Keep in the tray', `Quit ${NAME}`, 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    checkboxLabel: 'Remember my choice (you can change it from the tray menu)',
  }).then((r) => {
    if (r.response === 2) return;
    if (r.checkboxChecked) writeSettings({ closeAction: r.response === 1 ? 'quit' : 'tray' });
    if (r.response === 1) { quitting = true; app.quit(); } else if (win) win.hide();
  }).catch(() => undefined).finally(() => { closeAsking = false; });
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
  wc.on('did-finish-load', () => { delete lastTold[id]; syncPageState(); });

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

// ---- Mini Mode: a small always-on-top strip with who is around, your status and a way back. Like Gather, it opens by itself when you
// switch to another app (not when you minimise), and it hides again when you come back. Closing it by hand keeps it closed until the next time you come back to the app.
let miniWin = null;
let miniState = null; // the last list the Office sent
let miniDismissed = false;
let miniTimer = null;
const MINI_W = 204;

const COLOR = /^#[0-9a-fA-F]{3,8}$/;
function cleanAvatar(a) {
  const o = {};
  if (a && typeof a === 'object') for (const k of ['skin', 'hair', 'shirt']) if (typeof a[k] === 'string' && COLOR.test(a[k])) o[k] = a[k];
  return o;
}
const cleanStatus = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 60) : '');
function cleanMiniState(p) {
  if (!p || typeof p !== 'object' || !p.me || !Array.isArray(p.people)) return null;
  return {
    me: { name: String(p.me.name || '').slice(0, 40), status: cleanStatus(p.me.status), a: cleanAvatar(p.me.a) },
    people: p.people.slice(0, 14).map((q) => ({ id: String(q.id || '').slice(0, 64), name: String(q.name || '').slice(0, 40), status: cleanStatus(q.status), a: cleanAvatar(q.a) })),
  };
}

function miniPosition(w, h) {
  if (process.env.KD_OPS_TEST) return { x: -4000, y: -4000 }; // the automatic tests keep it off-screen
  const st = readSettings();
  const primary = screen.getPrimaryDisplay().workArea;
  let x = Number.isFinite(st.miniX) ? st.miniX : primary.x + primary.width - w - 16;
  let y = Number.isFinite(st.miniY) ? st.miniY : primary.y + primary.height - h - 16;
  const wa = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
  x = Math.min(Math.max(x, wa.x), wa.x + wa.width - w);
  y = Math.min(Math.max(y, wa.y), wa.y + wa.height - h);
  return { x, y };
}

function createMini() {
  if (miniWin && !miniWin.isDestroyed()) return miniWin;
  const p = miniPosition(MINI_W, 150);
  miniWin = new BrowserWindow({
    width: MINI_W, height: 150, x: p.x, y: p.y,
    frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: '#0b0f17', title: 'KD Ops mini', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload-mini.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
  });
  miniWin.setAlwaysOnTop(true, 'screen-saver');
  void miniWin.loadFile(path.join(__dirname, 'mini.html'));
  // after you drag it: it snaps to a screen edge when it is close, and it remembers where you left it
  miniWin.on('moved', () => {
    if (!miniWin || miniWin.isDestroyed()) return;
    const b = miniWin.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    const SNAP = 24;
    let { x, y } = b;
    if (Math.abs(x - wa.x) < SNAP) x = wa.x;
    if (Math.abs(x + b.width - (wa.x + wa.width)) < SNAP) x = wa.x + wa.width - b.width;
    if (Math.abs(y - wa.y) < SNAP) y = wa.y;
    if (Math.abs(y + b.height - (wa.y + wa.height)) < SNAP) y = wa.y + wa.height - b.height;
    if (x !== b.x || y !== b.y) miniWin.setPosition(x, y);
    writeSettings({ miniX: x, miniY: y });
  });
  miniWin.on('closed', () => { miniWin = null; });
  return miniWin;
}
function sendMini() { if (miniWin && !miniWin.isDestroyed() && miniState) miniWin.webContents.send('mini:state', miniState); }
function showMini() {
  if (!miniState || quitting) return;
  const m = createMini();
  sendMini();
  if (!m.isVisible()) m.showInactive();
}
function hideMini() { if (miniWin && !miniWin.isDestroyed() && miniWin.isVisible()) miniWin.hide(); }
function maybeShowMini() {
  if (readSettings().autoMini === false || miniDismissed || !miniState || quitting) return;
  // only while the app is minimised: switching to another app, or hiding the window to the tray, never opens it
  if (!win || !win.isMinimized()) return;
  showMini();
}
function scheduleMini() { clearTimeout(miniTimer); miniTimer = setTimeout(maybeShowMini, 350); }

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
  const first = active;
  const second = TAB_IDS.find((i) => i !== first);
  void loadTab(first);
  let secondStarted = false;
  const startSecond = () => { if (secondStarted || !second) return; secondStarted = true; setTimeout(() => { if (win) void loadTab(second); }, 1500); };
  const fv = views[first];
  fv.webContents.once('did-finish-load', startSecond);
  fv.webContents.once('did-fail-load', startSecond);
  setTimeout(startSecond, 12000);

  for (const ev of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore', 'show']) win.on(ev, layout);
  win.on('focus', () => { clearCounts(); miniDismissed = false; clearTimeout(miniTimer); hideMini(); syncPageState(); });
  win.on('restore', () => { miniDismissed = false; clearTimeout(miniTimer); hideMini(); syncPageState(); });
  win.on('minimize', () => { scheduleMini(); syncPageState(); });
  for (const ev of ['blur', 'hide', 'show']) win.on(ev, syncPageState);

  // closing the window keeps you in the office (in the tray); Quit from the tray really leaves
  win.on('close', (e) => {
    const b = win.getBounds();
    writeSettings({ width: b.width, height: b.height, maximized: win.isMaximized() });
    if (quitting || SMOKE) return;
    const how = closeAction();
    if (how === 'quit') { quitting = true; app.quit(); return; } // the window closes and the whole app ends with it
    e.preventDefault();
    if (how === 'tray') win.hide();
    else askWhatToDoOnClose();
  });
  win.on('closed', () => {
    for (const id of TAB_IDS) {
      try { if (views[id] && !views[id].webContents.isDestroyed()) views[id].webContents.close(); } catch { /* already gone */ }
      delete views[id];
      clearTimeout(retryTimers[id]);
    }
    win = null;
    hideMini();
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
      label: 'When I close the window',
      submenu: [
        { label: 'Ask me', type: 'radio', checked: closeAction() === 'ask', click: () => writeSettings({ closeAction: 'ask' }) },
        { label: 'Keep KD Ops in the tray', type: 'radio', checked: closeAction() === 'tray', click: () => writeSettings({ closeAction: 'tray' }) },
        { label: `Quit ${NAME}`, type: 'radio', checked: closeAction() === 'quit', click: () => writeSettings({ closeAction: 'quit' }) },
      ],
    },
    {
      label: 'Start with my computer',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: item.checked ? ['--hidden'] : [] }),
    },
    {
      label: 'Show a small window when I minimise',
      type: 'checkbox',
      checked: readSettings().autoMini !== false,
      click: (item) => { writeSettings({ autoMini: item.checked }); if (!item.checked) hideMini(); },
    },
    {
      label: 'Do not disturb when my computer locks or sleeps',
      type: 'checkbox',
      checked: readSettings().autoDndOnLock !== false,
      click: (item) => writeSettings({ autoDndOnLock: item.checked }),
    },
    { label: 'Show the small window now', click: () => { miniDismissed = false; showMini(); } },
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

// the Office page sends who is around (only the Office tab may)
ipcMain.on('kd:mini-state', (e, p) => {
  if (fromOurPages(e) !== 'office') return;
  const clean = cleanMiniState(p);
  if (!clean) return;
  miniState = clean;
  // get the small window ready (hidden) so it appears at once when you minimise, instead of loading then
  if (!miniWin || miniWin.isDestroyed()) createMini();
  sendMini();
});
const fromMini = (e) => !!miniWin && !miniWin.isDestroyed() && e.sender.id === miniWin.webContents.id;
ipcMain.on('mini:ready', (e) => { if (fromMini(e)) sendMini(); });
ipcMain.on('mini:expand', (e) => { if (!fromMini(e)) return; miniDismissed = false; hideMini(); showWindow('office'); });
ipcMain.on('mini:close', (e) => { if (!fromMini(e)) return; miniDismissed = true; hideMini(); });
ipcMain.on('mini:size', (e, h) => {
  if (!fromMini(e) || !Number.isFinite(h)) return;
  const b = miniWin.getBounds();
  const height = Math.max(96, Math.min(300, Math.round(h)));
  if (height !== b.height) miniWin.setBounds({ x: b.x, y: Math.max(screen.getDisplayMatching(b).workArea.y, Math.min(b.y, screen.getDisplayMatching(b).workArea.y + screen.getDisplayMatching(b).workArea.height - height)), width: b.width, height });
});
ipcMain.on('mini:status', (e, id) => {
  if (!fromMini(e) || typeof id !== 'string' || !/^(available|busy|dnd)$/.test(id)) return;
  const v = views.office;
  if (v && !v.webContents.isDestroyed()) v.webContents.send('kd:set-status', id);
});

// Do not disturb while the computer is locked or asleep, and back to how it was afterwards (the Office page does the switching)
function sendPower(state) {
  if (readSettings().autoDndOnLock === false) return;
  const v = views.office;
  if (v && !v.webContents.isDestroyed()) v.webContents.send('kd:power', state);
}

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
  for (const ev of ['lock-screen', 'suspend']) powerMonitor.on(ev, () => sendPower('away'));
  for (const ev of ['unlock-screen', 'resume']) powerMonitor.on(ev, () => sendPower('back'));
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
app.on('before-quit', () => { quitting = true; setTimeout(() => app.exit(0), 6000).unref(); try { if (miniWin && !miniWin.isDestroyed()) miniWin.destroy(); } catch { /* going away anyway */ } if (updateReadyVersion) logUpdate('quitting with update', updateReadyVersion, 'ready to install'); });
// closing the last window must not quit (the tray keeps you in the office)
app.on('window-all-closed', () => { if (SMOKE || process.platform !== 'darwin') { if (quitting || SMOKE) app.quit(); } });
