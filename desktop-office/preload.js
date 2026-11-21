// Runs inside the page before it loads. It gives the web app three small things and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

// which tab of the KD Ops app this page is in ('ops' or 'office'), and whether that tab is the one being shown
const tabArg = (process.argv.find((a) => a.startsWith('--kd-tab=')) || '').slice('--kd-tab='.length);
const tab = tabArg === 'ops' || tabArg === 'office' ? tabArg : null;
let visible = true;
let focused = true;
const watchers = new Set();
const activeWatchers = new Set();
const tellActive = () => { for (const cb of activeWatchers) { try { cb(visible && focused); } catch { /* one bad listener must not stop the rest */ } } };
ipcRenderer.on('kd:tab-visible', (_e, v) => {
  visible = !!v;
  for (const cb of watchers) { try { cb(visible); } catch { /* one bad listener must not stop the rest */ } }
  tellActive();
});
ipcRenderer.on('kd:window-focus', (_e, v) => { focused = !!v; tellActive(); });

// a newer version of the app itself has been downloaded (version number) or is not waiting (null); a page that opens later is told straight away
let updateVersion = null;
const updateWatchers = new Set();
ipcRenderer.on('kd:update', (_e, v) => {
  updateVersion = typeof v === 'string' && v ? v : null;
  for (const cb of updateWatchers) { try { cb(updateVersion); } catch { /* one bad listener must not stop the rest */ } }
});

contextBridge.exposeInMainWorld('kdDesktop', {
  platform: process.platform,
  tab,
  // a downloaded update is waiting: show "restart to update" in the page
  onUpdate: (cb) => { updateWatchers.add(cb); if (updateVersion) cb(updateVersion); return () => { updateWatchers.delete(cb); }; },
  // restart the app now so the update installs (the app ignores it when no update is waiting)
  installUpdate: () => ipcRenderer.send('kd:install-update'),
  // is this page's tab being shown? (the Office uses it to stop drawing while you are in the other tab)
  isVisible: () => visible,
  onVisible: (cb) => { watchers.add(cb); cb(visible); return () => { watchers.delete(cb); }; },
  // is this tab showing AND is the app in front? (the Office draws slowly and goes quiet when it is not)
  isActive: () => visible && focused,
  onActive: (cb) => { activeWatchers.add(cb); cb(visible && focused); return () => { activeWatchers.delete(cb); }; },
  // bring this window to the front (used when you click a notification)
  focus: () => ipcRenderer.send('kd:focus'),
  // how many things are waiting for you, for the taskbar and tray
  setBadge: (n) => ipcRenderer.send('kd:badge', Number(n) || 0),
  // a real system notification, made by the app itself (it shows even when the window is hidden in the tray)
  // (a request with no real title is dropped here, so the computer never shows a notification that just says "undefined")
  notify: (p) => {
    if (!p || typeof p.title !== 'string' || !p.title.trim()) return;
    ipcRenderer.send('kd:notify', { id: String(p.id), title: p.title, body: String(p.body || '') });
  },
  // runs when you click one of those notifications
  // who is around and my status, for the small always-on-top window (the app validates and trims it)
  miniUpdate: (state) => { try { ipcRenderer.send('kd:mini-state', state); } catch { /* not worth stopping for */ } },
  // the small window asked for a different status (available, busy or dnd)
  onSetStatus: (cb) => { const h = (_e, id) => cb(String(id)); ipcRenderer.on('kd:set-status', h); return () => ipcRenderer.removeListener('kd:set-status', h); },
  // the computer locked or went to sleep ('away'), or woke up ('back')
  onPower: (cb) => { const h = (_e, s) => cb(String(s)); ipcRenderer.on('kd:power', h); return () => ipcRenderer.removeListener('kd:power', h); },
  onNotificationClick: (cb) => ipcRenderer.on('kd:notification-click', (_e, id) => cb(String(id))),
});
