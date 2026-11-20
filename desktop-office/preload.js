// Runs inside the page before it loads. It gives the web app three small things and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

// which tab of the KD Ops app this page is in ('ops' or 'office'), and whether that tab is the one being shown
const tabArg = (process.argv.find((a) => a.startsWith('--kd-tab=')) || '').slice('--kd-tab='.length);
const tab = tabArg === 'ops' || tabArg === 'office' ? tabArg : null;
let visible = true;
const watchers = new Set();
ipcRenderer.on('kd:tab-visible', (_e, v) => {
  visible = !!v;
  for (const cb of watchers) { try { cb(visible); } catch { /* one bad listener must not stop the rest */ } }
});

contextBridge.exposeInMainWorld('kdDesktop', {
  platform: process.platform,
  tab,
  // is this page's tab being shown? (the Office uses it to stop drawing while you are in the other tab)
  isVisible: () => visible,
  onVisible: (cb) => { watchers.add(cb); cb(visible); return () => { watchers.delete(cb); }; },
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
  onNotificationClick: (cb) => ipcRenderer.on('kd:notification-click', (_e, id) => cb(String(id))),
});
