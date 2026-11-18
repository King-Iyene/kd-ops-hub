// Runs inside the page before it loads. It gives the web app three small things and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kdDesktop', {
  platform: process.platform,
  // bring this window to the front (used when you click a notification)
  focus: () => ipcRenderer.send('kd:focus'),
  // how many things are waiting for you, for the taskbar and tray
  setBadge: (n) => ipcRenderer.send('kd:badge', Number(n) || 0),
  // a real system notification, made by the app itself (it shows even when the window is hidden in the tray)
  notify: (p) => ipcRenderer.send('kd:notify', { id: String(p.id), title: String(p.title), body: String(p.body || '') }),
  // runs when you click one of those notifications
  onNotificationClick: (cb) => ipcRenderer.on('kd:notification-click', (_e, id) => cb(String(id))),
});
