// Runs inside the page before it loads. It gives the web app three small things and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kdDesktop', {
  platform: process.platform,
  // bring this window to the front (used when you click a notification)
  focus: () => ipcRenderer.send('kd:focus'),
  // how many things are waiting for you, for the taskbar and tray
  setBadge: (n) => ipcRenderer.send('kd:badge', Number(n) || 0),
});
